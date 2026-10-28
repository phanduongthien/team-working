import { randomUUID } from 'node:crypto'
import type { ChatEvent, ChatMode, ChatUsage } from '@shared/ai'
import type { AssistantProfile } from '@shared/schemas'
import type { ChatSendResult, ChatStreamPayload, Message, StoredAttachment, ToolEvent } from '@shared/types'
import type { AIProvider, HistoryMessage } from '../ai/AIProvider'
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
  workspaceDir: string
  emit(payload: ChatStreamPayload): void
  log: { info(msg: string): void; error(msg: string): void }
  /** Lượt chạy kết thúc (xong/lỗi/dừng) — vd hủy các yêu cầu duyệt sửa file còn treo. */
  onRunEnd?(conversationId: string): void
}

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

const isLostSession = (message: string): boolean => /no conversation found/i.test(message)

export const READ_TOOLS = ['Read', 'Grep', 'Glob']
export const WRITE_TOOLS = ['Edit', 'Write']

export type RunOptions = {
  cwd: string
  tools?: string[]
  allowedTools?: string[]
  approval?: { conversationId: string }
  context?: string
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
      content: m.attachments.length
        ? `${m.content}\n[Đã đính kèm: ${m.attachments.map((a) => a.name).join(', ')}]`
        : m.content
    }))
}

type ActiveRequest = { controller: AbortController; conversationId: string }

export class ChatService {
  private active = new Map<string, ActiveRequest>()

  constructor(private readonly deps: ChatServiceDeps) {}

  isBusy(conversationId: string): boolean {
    return [...this.active.values()].some((r) => r.conversationId === conversationId)
  }

  send(conversationId: string, text: string, attachments: StoredAttachment[] = []): ChatSendResult {
    const { conversations, messages } = this.deps
    const conversation = conversations.get(conversationId)
    if (!conversation) throw new ConversationNotFoundError()
    if (this.isBusy(conversationId)) throw new ChatBusyError()

    const history = messages.recent(conversationId, HISTORY_LIMIT)
    const userMessage = messages.insert({ conversationId, role: 'user', content: text, attachments })
    const assistantMessage = messages.insert({
      conversationId,
      role: 'assistant',
      content: '',
      status: 'streaming'
    })
    if (!conversation.title) conversations.update({ id: conversationId, title: titleFromText(text) })
    conversations.touch(conversationId)

    const requestId = randomUUID()
    const controller = new AbortController()
    this.active.set(requestId, { controller, conversationId })

    void this.run({
      requestId,
      conversationId,
      messageId: assistantMessage.id,
      mode: conversation.mode,
      sessionId: conversation.cliSessionId ?? undefined,
      text,
      history,
      attachments,
      options: runOptions({
        mode: conversation.mode,
        cwd: conversation.cwd,
        codeWrite: conversation.codeWrite,
        conversationId,
        workspaceDir: this.deps.workspaceDir
      }),
      signal: controller.signal
    }).finally(() => {
      this.active.delete(requestId)
      this.deps.onRunEnd?.(conversationId)
    })

    return { requestId, userMessage, assistantMessage }
  }

  abort(requestId: string): void {
    this.active.get(requestId)?.controller.abort()
  }

  abortAll(): void {
    for (const r of this.active.values()) r.controller.abort()
  }

  private async run(args: {
    requestId: string
    conversationId: string
    messageId: string
    mode: ChatMode
    sessionId?: string
    text: string
    history: Message[]
    attachments: StoredAttachment[]
    options: RunOptions
    signal: AbortSignal
  }): Promise<void> {
    const { deps } = this
    const { requestId, conversationId, messageId, signal } = args
    const emit = (event: ChatEvent): void => deps.emit({ requestId, conversationId, messageId, event })

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
    const systemPrompt = buildSystemPrompt({
      assistant: deps.getAssistant(),
      mode: args.mode,
      modeSkill: await deps.loadModeSkill(args.mode),
      user: memory.user,
      memories: memory.memories,
      extraContext: args.options.context
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
          approval: args.options.approval
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
    deps.messages.update(messageId, { content, status, error, toolEvents, usage })
    deps.conversations.touch(conversationId)
    this.active.delete(requestId)
    if (signal.aborted) terminal = { type: 'error', message: 'aborted' }
    emit(terminal ?? (error ? { type: 'error', message: error } : { type: 'done' }))
  }
}
