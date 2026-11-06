import { randomUUID } from 'node:crypto'
import type { ChatEvent, ChatMode, ChatUsage } from '@shared/ai'
import type { AssistantProfile } from '@shared/schemas'
import type {
  ChatSendResult,
  ChatStreamPayload,
  Message,
  StoredAttachment,
  ToolEvent
} from '@shared/types'
import { stripExpressTags, type MessageMedia, type Reaction } from '@shared/expressive'
import type { MessageVoice } from '@shared/voice'
import { hideArtifactBlocks, type MessageArtifact } from '@shared/artifacts'
import type { AIProvider, HistoryMessage } from '../ai/AIProvider'
import type { TurnPlan } from '../expressive/affinity'
import type { FinalizedReply } from '../expressive/service'
import { buildSystemPrompt, type UserProfileContext } from '../ai/systemPrompt'
import type { ConversationRepository, MessageRepository } from '../db/repositories'

export type ChatServiceDeps = {
  conversations: ConversationRepository
  messages: MessageRepository
  /** Provider theo cài đặt hiện tại (CLI hoặc API key). */
  getProvider(): AIProvider
  getAssistant(): AssistantProfile
  /** Hồ sơ + memory liên quan tới câu hỏi để chèn vào system prompt. */
  getMemoryContext(query: string): { user: UserProfileContext; memories: string[] }
  loadModeSkill(mode: ChatMode): Promise<string | undefined>
  /** Skill người dùng cài, chọn theo câu hỏi (my-style + gọi đích danh + vài skill liên quan). */
  userSkillsFor?(text: string): Promise<{ section: string; used: string[] }>
  workspaceDir: string
  emit(payload: ChatStreamPayload): void
  log: { info(msg: string): void; error(msg: string): void }
  /** Lượt chạy kết thúc (xong/lỗi/dừng) — vd hủy các yêu cầu duyệt sửa file còn treo. */
  onRunEnd?(conversationId: string): void
  /** Tool của app được bật cho lượt này (vd xem màn hình) + hướng dẫn chèn vào system prompt. */
  appToolsFor?(conversationId: string): { names: string[]; context: string } | null
  /** Chat biểu cảm (emoji / reaction / GIF / sticker). Không có → chỉ bỏ thẻ khỏi câu trả lời. */
  /** Hướng dẫn cho tin nhắn giọng nói (skill `voice`); tease = được trêu nhẹ lỗi chép lời. */
  voicePrompt?(tease: boolean): Promise<string>
  /** Artifact: hướng dẫn (skill `artifacts`), ngữ cảnh hội thoại, tách khối trong câu trả lời. */
  artifacts?: {
    prompt(): Promise<string>
    contextFor(conversationId: string): string
    applyReply(conversationId: string, raw: string): { text: string; artifacts: MessageArtifact[] }
  }
  expressive?: {
    onUserMessage(input: { text: string; media: boolean; mode: string }): TurnPlan
    onUserReaction(): void
    promptFor(plan: TurnPlan): Promise<string>
    finalize(raw: string, plan: TurnPlan): Promise<FinalizedReply>
  }
}

/** GIF / sticker người dùng gửi → Claude chỉ thấy chữ mô tả (không gửi ảnh, đỡ tốn hạn mức). */
export const mediaNote = (media: MessageMedia): string =>
  `[Người dùng gửi ${media.kind === 'gif' ? 'GIF' : 'sticker'}: "${media.title || 'không tên'}"]`

const MAX_NOTES = 3

/** Đánh dấu cho Claude: chữ do máy chép lại từ giọng nói. */
export const VOICE_NOTE = '[🎤 nói — chữ do máy chép lại từ giọng nói, có thể nghe sai]'

const TITLE_MAX = 60
const PERSIST_INTERVAL_MS = 1_000
/** Số tin gửi kèm khi provider không giữ session (API) hoặc khi session CLI bị mất. */
const HISTORY_LIMIT = 30

export class ChatBusyError extends Error {
  constructor() {
    super('conversation_busy')
  }
}

export class ConversationNotFoundError extends Error {
  constructor() {
    super('conversation_not_found')
  }
}

export function titleFromText(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  return oneLine.length <= TITLE_MAX ? oneLine : `${oneLine.slice(0, TITLE_MAX - 1)}…`
}

/** Dựng lại ngữ cảnh khi session CLI bị mất (ví dụ người dùng xóa ~/.claude). */
export function promptWithHistory(history: Message[], text: string): string {
  const lines = history
    .filter((m) => m.content.trim())
    .map((m) => `${m.role === 'user' ? 'Người dùng' : 'Trợ lý'}: ${m.content.trim()}`)
  if (lines.length === 0) return text
  return `Đoạn hội thoại trước đó (để nắm ngữ cảnh):\n${lines.join('\n\n')}\n\n---\n\n${text}`
}

/** Prompt khi người dùng chỉ gửi file/ảnh, không gõ chữ. */
export const EMPTY_TEXT_PROMPT =
  'Người dùng gửi file đính kèm (không kèm lời nhắn). Hãy xem và phản hồi phù hợp.'

const isLostSession = (message: string): boolean => /no conversation found/i.test(message)

export const READ_TOOLS = ['Read', 'Grep', 'Glob']
export const WRITE_TOOLS = ['Edit', 'Write']

export type RunOptions = {
  cwd: string
  tools?: string[]
  allowedTools?: string[]
  approval?: { conversationId: string }
  appTools?: { conversationId: string; names: string[] }
  externalMcp?: { conversationId: string }
  context?: string
}

/** Thêm tool của app (nếu có) vào lượt chạy và nối hướng dẫn của chúng vào ngữ cảnh. */
export function withAppTools(
  options: RunOptions,
  conversationId: string,
  tools: { names: string[]; context: string } | null
): RunOptions {
  if (!tools || (tools.names.length === 0 && !tools.context)) return options
  return {
    ...options,
    // Chỉ có hướng dẫn, không có tool (vd Gmail hết hạn đăng nhập) → không mở cầu nối tool.
    ...(tools.names.length > 0 ? { appTools: { conversationId, names: tools.names } } : {}),
    context: options.context
      ? `${options.context}

${tools.context}`
      : tools.context
  }
}

/**
 * Chế độ Code có thư mục dự án: chỉ đọc → Read/Grep/Glob tự duyệt;
 * bật sửa file → thêm Edit/Write nhưng MỖI lần sửa phải người dùng duyệt (không tự duyệt).
 * Không bao giờ cho Bash/lệnh shell. Chế độ khác: workspace riêng của app, không tool.
 */
export function runOptions(input: {
  mode: ChatMode
  cwd: string | null
  codeWrite: boolean
  conversationId: string
  workspaceDir: string
}): RunOptions {
  if (input.mode !== 'code' || !input.cwd) return { cwd: input.workspaceDir }
  if (!input.codeWrite) {
    return {
      cwd: input.cwd,
      tools: READ_TOOLS,
      allowedTools: READ_TOOLS,
      context: `Thư mục dự án: ${input.cwd}\nQuyền: CHỈ ĐỌC. Không sửa file; nếu cần thay đổi, đưa đề xuất dưới dạng diff để người dùng tự áp dụng.`
    }
  }
  return {
    cwd: input.cwd,
    tools: [...READ_TOOLS, ...WRITE_TOOLS],
    allowedTools: READ_TOOLS,
    approval: { conversationId: input.conversationId },
    context: `Thư mục dự án: ${input.cwd}\nQuyền: ĐƯỢC SỬA FILE trong thư mục này bằng Edit/Write; mỗi thay đổi người dùng sẽ xem diff và duyệt, có thể bị từ chối — khi bị từ chối thì dừng và hỏi lại. Không có lệnh shell.`
  }
}

/** Tin nhắn cũ → lịch sử cho provider; file đính kèm cũ chỉ còn tên. */
export function toHistory(messages: Message[]): HistoryMessage[] {
  return messages
    .filter((m) => m.status === 'done' || m.role === 'user')
    .map((m) => ({
      role: m.role,
      content: [
        m.content,
        m.attachments.length ? `[Đã đính kèm: ${m.attachments.map((a) => a.name).join(', ')}]` : '',
        m.media && m.role === 'user' ? mediaNote(m.media) : ''
      ]
        .filter(Boolean)
        .join('\n')
    }))
}

type ActiveRequest = { controller: AbortController; conversationId: string }

export class ChatService {
  private active = new Map<string, ActiveRequest>()
  /** Cảm xúc người dùng thả vào câu trả lời của trợ lý — báo cho trợ lý ở lượt sau. */
  private notes = new Map<string, string[]>()

  constructor(private readonly deps: ChatServiceDeps) {}

  isBusy(conversationId: string): boolean {
    return [...this.active.values()].some((r) => r.conversationId === conversationId)
  }

  send(
    conversationId: string,
    text: string,
    attachments: StoredAttachment[] = [],
    media: MessageMedia | null = null,
    voice: MessageVoice | null = null
  ): ChatSendResult {
    const { conversations, messages } = this.deps
    const conversation = conversations.get(conversationId)
    if (!conversation) throw new ConversationNotFoundError()
    if (this.isBusy(conversationId)) throw new ChatBusyError()

    const history = messages.recent(conversationId, HISTORY_LIMIT)
    const userMessage = messages.insert({
      conversationId,
      role: 'user',
      content: text,
      attachments,
      media,
      voice
    })
    const plan =
      this.deps.expressive?.onUserMessage({ text, media: !!media, mode: conversation.mode }) ?? null
    const assistantMessage = messages.insert({
      conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming'
    })
    if (!conversation.title)
      conversations.update({
        id: conversationId,
        title: titleFromText(text || media?.title || attachments.map((a) => a.name).join(', '))
      })
    conversations.touch(conversationId)

    const requestId = randomUUID()
    const controller = new AbortController()
    this.active.set(requestId, { controller, conversationId })
    const options = withAppTools(
      runOptions({
        mode: conversation.mode,
        cwd: conversation.cwd,
        codeWrite: conversation.codeWrite,
        conversationId,
        workspaceDir: this.deps.workspaceDir
      }),
      conversationId,
      this.deps.appToolsFor?.(conversationId) ?? null
    )
    // MCP server người dùng thêm: chỉ cho lượt chat tương tác (mỗi lần gọi tool vẫn phải duyệt).
    options.externalMcp = { conversationId }

    void this.run({
      requestId,
      conversationId,
      messageId: assistantMessage.id,
      mode: conversation.mode,
      sessionId: conversation.cliSessionId ?? undefined,
      // Chỉ gửi ảnh/file không kèm chữ → vẫn cần một câu nhắc cho Claude.
      text: this.promptText(conversationId, voice ? `${VOICE_NOTE}\n${text}` : text, media, attachments.length > 0),
      voice: !!voice,
      userMessageId: userMessage.id,
      plan,
      history,
      attachments,
      options,
      signal: controller.signal
    }).finally(() => {
      this.active.delete(requestId)
      this.deps.onRunEnd?.(conversationId)
    })

    return { requestId, userMessage, assistantMessage }
  }

  private promptText(
    conversationId: string,
    text: string,
    media: MessageMedia | null,
    hasFiles: boolean
  ): string {
    const notes = this.notes.get(conversationId) ?? []
    this.notes.delete(conversationId)
    const body =
      [text, media ? mediaNote(media) : ''].filter(Boolean).join('\n') ||
      (hasFiles ? EMPTY_TEXT_PROMPT : '')
    return notes.length ? `(${notes.join(' ')})\n\n${body}` : body
  }

  /** Người dùng thả / bỏ cảm xúc (null) cho một tin nhắn — mỗi người tối đa 1 cảm xúc mỗi tin. */
  react(messageId: string, emoji: string | null): Message {
    const { messages, conversations } = this.deps
    const message = messages.get(messageId)
    // Chỉ tin trong hội thoại của tài khoản hiện tại.
    if (!message || !conversations.get(message.conversationId))
      throw new ConversationNotFoundError()
    const reactions: Reaction[] = [
      ...message.reactions.filter((r) => r.by !== 'user'),
      ...(emoji ? [{ emoji, by: 'user' as const }] : [])
    ]
    messages.update(messageId, { reactions })
    if (emoji && message.role === 'assistant') {
      const list = [
        ...(this.notes.get(message.conversationId) ?? []),
        `Người dùng vừa thả ${emoji} vào một câu trả lời của bạn.`
      ]
      this.notes.set(message.conversationId, list.slice(-MAX_NOTES))
      this.deps.expressive?.onUserReaction()
    }
    return { ...message, reactions }
  }

  abort(requestId: string): void {
    this.active.get(requestId)?.controller.abort()
  }

  abortAll(): void {
    for (const r of this.active.values()) r.controller.abort()
  }

  /** Dừng mọi lượt đang chạy và chờ chúng lưu xong (vd trước khi thoát để cài bản cập nhật). */
  async stopAll(timeoutMs: number): Promise<boolean> {
    this.abortAll()
    const deadline = Date.now() + timeoutMs
    while (this.active.size > 0 && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 50))
    return this.active.size === 0
  }

  private async run(args: {
    requestId: string
    conversationId: string
    messageId: string
    mode: ChatMode
    sessionId?: string
    text: string
    userMessageId: string
    plan: TurnPlan | null
    voice: boolean
    history: Message[]
    attachments: StoredAttachment[]
    options: RunOptions
    signal: AbortSignal
  }): Promise<void> {
    const { deps } = this
    const { requestId, conversationId, messageId, signal } = args
    const emit = (event: ChatEvent): void =>
      deps.emit({ requestId, conversationId, messageId, event })

    let content = ''
    const toolEvents: ToolEvent[] = []
    let usage: ChatUsage | null = null
    let error: string | null = null
    let lastPersist = Date.now()
    // done/error chỉ phát sau khi tiến trình thoát hẳn (CLI còn chạy một lúc sau `result`),
    // để UI không cho gửi tin mới khi hội thoại vẫn đang bận.
    let terminal: ChatEvent | null = null

    const provider = deps.getProvider()
    const memory = deps.getMemoryContext(args.text)
    const userSkills = deps.userSkillsFor
      ? await deps.userSkillsFor(args.text).catch((e: unknown) => {
          deps.log.error(`Chọn skill lỗi: ${String(e)}`)
          return { section: '', used: [] }
        })
      : { section: '', used: [] }
    if (userSkills.used.length) deps.log.info(`Skill dùng cho lượt này: ${userSkills.used.join(', ')}`)
    const systemPrompt = buildSystemPrompt({
      assistant: deps.getAssistant(),
      mode: args.mode,
      modeSkill: await deps.loadModeSkill(args.mode),
      userSkills: userSkills.section,
      user: memory.user,
      memories: memory.memories,
      extraContext: [
        args.options.context,
        args.plan && deps.expressive ? await deps.expressive.promptFor(args.plan) : '',
        // Chỉ trêu lỗi chép lời khi đang chat vui (biểu cảm bật, không nghiêm túc / buồn).
        args.voice && deps.voicePrompt
          ? await deps.voicePrompt(!!args.plan && args.plan.level !== 'off' && args.plan.mood === 'normal')
          : '',
        deps.artifacts ? await deps.artifacts.prompt() : '',
        deps.artifacts?.contextFor(conversationId) ?? ''
      ]
        .filter(Boolean)
        .join('\n\n')
    })
    // Provider có session (CLI) tự nhớ hội thoại; provider không session (API) cần lịch sử.
    const history = provider.stateful ? undefined : toHistory(args.history)
    const initialSession = provider.stateful ? args.sessionId : undefined

    const attempt = async (prompt: string, sessionId: string | undefined): Promise<void> => {
      error = null
      const stream = provider.chat(
        {
          prompt,
          systemPrompt,
          mode: args.mode,
          sessionId,
          history,
          attachments: args.attachments,
          cwd: args.options.cwd,
          tools: args.options.tools,
          allowedTools: args.options.allowedTools,
          approval: args.options.approval,
          appTools: args.options.appTools,
          externalMcp: args.options.externalMcp
        },
        signal
      )
      for await (const event of stream) {
        switch (event.type) {
          case 'session':
            deps.conversations.setSession(conversationId, event.sessionId)
            continue // chi tiết nội bộ, renderer không cần
          case 'text':
            content += event.delta
            if (Date.now() - lastPersist > PERSIST_INTERVAL_MS) {
              deps.messages.update(messageId, { content })
              lastPersist = Date.now()
            }
            break
          case 'tool':
            toolEvents.push({ name: event.name, input: event.input })
            break
          case 'done':
            usage = event.usage ?? null
            terminal = event
            continue
          case 'error':
            error = event.message
            // Session mất: thử lại một lần, không báo lỗi này ra UI.
            if (!(sessionId && isLostSession(event.message))) terminal = event
            continue
        }
        emit(event)
      }
    }

    try {
      await attempt(args.text, initialSession)
      if (error && initialSession && isLostSession(error) && !signal.aborted) {
        deps.log.info(`Session ${initialSession} không còn, tạo session mới cho ${conversationId}`)
        deps.conversations.setSession(conversationId, null)
        await attempt(promptWithHistory(args.history, args.text), undefined)
      }
    } catch (err) {
      error = (err as Error).message
      deps.log.error(`chat lỗi: ${error}`)
      terminal = { type: 'error', message: error }
    }

    const status = signal.aborted ? 'aborted' : error ? 'error' : 'done'
    // Thẻ biểu cảm không bao giờ còn trong nội dung lưu lại; chỉ câu trả lời xong mới được reaction / GIF / sticker.
    let media: MessageMedia | null = null
    // Khối artifact → panel (chỉ khi trả lời xong); chat chỉ giữ phần lời nói.
    let artifactRefs: MessageArtifact[] = []
    if (status === 'done' && deps.artifacts) {
      const r = deps.artifacts.applyReply(conversationId, content)
      content = r.text
      artifactRefs = r.artifacts
    } else content = hideArtifactBlocks(content).text
    if (status === 'done' && args.plan && deps.expressive) {
      const reply = await deps.expressive.finalize(content, args.plan)
      content = reply.text
      media = reply.media
      if (reply.reaction) {
        const target = deps.messages.get(args.userMessageId)
        if (target) {
          const reactions: Reaction[] = [
            ...target.reactions.filter((r) => r.by !== 'assistant'),
            { emoji: reply.reaction, by: 'assistant' }
          ]
          deps.messages.update(target.id, { reactions })
          emit({ type: 'reactions', targetId: target.id, reactions })
        }
      }
    } else content = stripExpressTags(content)
    deps.messages.update(messageId, { content, status, error, toolEvents, usage, media, artifacts: artifactRefs })
    emit({ type: 'final', content, media, artifacts: artifactRefs })
    deps.conversations.touch(conversationId)
    this.active.delete(requestId)
    if (signal.aborted) terminal = { type: 'error', message: 'aborted' }
    emit(terminal ?? (error ? { type: 'error', message: error } : { type: 'done' }))
  }
}
