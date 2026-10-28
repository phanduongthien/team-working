import { randomUUID } from 'node:crypto'
import type { ChatEvent, ChatMode, ChatUsage } from '@shared/ai'
import type { AssistantProfile } from '@shared/schemas'
import type { ChatSendResult, ChatStreamPayload, Message, ToolEvent } from '@shared/types'
import type { AIProvider } from '../ai/AIProvider'
import { buildSystemPrompt } from '../ai/systemPrompt'
import type { ConversationRepository, MessageRepository } from '../db/repositories'

export type ChatServiceDeps = {
  conversations: ConversationRepository
  messages: MessageRepository
  provider: AIProvider
  getAssistant(): AssistantProfile
  loadModeSkill(mode: ChatMode): Promise<string | undefined>
  workspaceDir: string
  emit(payload: ChatStreamPayload): void
  log: { info(msg: string): void; error(msg: string): void }
}

const TITLE_MAX = 60
const PERSIST_INTERVAL_MS = 1_000
const HISTORY_ON_LOST_SESSION = 12

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

type ActiveRequest = { controller: AbortController; conversationId: string }

export class ChatService {
  private active = new Map<string, ActiveRequest>()

  constructor(private readonly deps: ChatServiceDeps) {}

  send(conversationId: string, text: string): ChatSendResult {
    const { conversations, messages } = this.deps
    const conversation = conversations.get(conversationId)
    if (!conversation) throw new ConversationNotFoundError()
    if ([...this.active.values()].some((r) => r.conversationId === conversationId)) throw new ChatBusyError()

    const history = messages.recent(conversationId, HISTORY_ON_LOST_SESSION)
    const userMessage = messages.insert({ conversationId, role: 'user', content: text })
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
      signal: controller.signal
    }).finally(() => this.active.delete(requestId))

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

    const systemPrompt = buildSystemPrompt({
      assistant: deps.getAssistant(),
      mode: args.mode,
      modeSkill: await deps.loadModeSkill(args.mode)
    })

    const attempt = async (prompt: string, sessionId: string | undefined): Promise<void> => {
      error = null
      const stream = deps.provider.chat(
        { prompt, systemPrompt, mode: args.mode, sessionId, cwd: deps.workspaceDir },
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
      await attempt(args.text, args.sessionId)
      if (error && args.sessionId && isLostSession(error) && !signal.aborted) {
        deps.log.info(`Session ${args.sessionId} không còn, tạo session mới cho ${conversationId}`)
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
