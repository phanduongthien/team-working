import type { ChatEvent, ChatUsage } from '@shared/ai'

type ContentBlock = { type?: string; text?: string; name?: string; input?: unknown }

type CliLine = {
  type?: string
  subtype?: string
  session_id?: string
  parent_tool_use_id?: string | null
  is_error?: boolean
  result?: string
  errors?: unknown
  duration_ms?: number
  usage?: { input_tokens?: number; output_tokens?: number }
  message?: { id?: string; content?: ContentBlock[] }
  event?: {
    type?: string
    delta?: { type?: string; text?: string }
  }
  api_message_id?: string
}

/**
 * Chuyển từng dòng stdout của `claude -p --output-format stream-json --verbose
 * --include-partial-messages` thành ChatEvent.
 *
 * - `system/init` → session
 * - `stream_event` text_delta → text (từng mảnh)
 * - `assistant` tool_use → tool; text chỉ dùng khi message đó không có delta
 *   (ví dụ chạy không kèm --include-partial-messages)
 * - `result` → done / error
 * Chỉ xét hội thoại chính (parent_tool_use_id null); dòng hỏng bị bỏ qua.
 */
export class StreamJsonParser {
  private sessionId: string | null = null
  private messagesWithDeltas = new Set<string>()
  private finished = false

  constructor(private readonly onInvalidLine?: (line: string) => void) {}

  get hasResult(): boolean {
    return this.finished
  }

  push(rawLine: string): ChatEvent[] {
    const line = rawLine.trim()
    if (!line) return []

    let msg: CliLine
    try {
      msg = JSON.parse(line) as CliLine
    } catch {
      this.onInvalidLine?.(line)
      return []
    }
    if (typeof msg !== 'object' || msg === null) return []
    if (msg.parent_tool_use_id) return []

    switch (msg.type) {
      case 'system':
        return this.handleSystem(msg)
      case 'stream_event':
        return this.handleStreamEvent(msg)
      case 'assistant':
        return this.handleAssistant(msg)
      case 'result':
        return this.handleResult(msg)
      default:
        return []
    }
  }

  private handleSystem(msg: CliLine): ChatEvent[] {
    if (msg.subtype !== 'init' || !msg.session_id || msg.session_id === this.sessionId) return []
    this.sessionId = msg.session_id
    return [{ type: 'session', sessionId: msg.session_id }]
  }

  private handleStreamEvent(msg: CliLine): ChatEvent[] {
    const delta = msg.event?.delta
    if (msg.event?.type !== 'content_block_delta' || delta?.type !== 'text_delta' || !delta.text) {
      return []
    }
    if (msg.api_message_id) this.messagesWithDeltas.add(msg.api_message_id)
    return [{ type: 'text', delta: delta.text }]
  }

  private handleAssistant(msg: CliLine): ChatEvent[] {
    const events: ChatEvent[] = []
    const streamed = msg.message?.id ? this.messagesWithDeltas.has(msg.message.id) : false
    for (const block of msg.message?.content ?? []) {
      if (block.type === 'tool_use' && block.name) {
        events.push({ type: 'tool', name: block.name, input: block.input ?? null })
      } else if (block.type === 'text' && block.text && !streamed) {
        events.push({ type: 'text', delta: block.text })
      }
    }
    return events
  }

  private handleResult(msg: CliLine): ChatEvent[] {
    this.finished = true
    if (msg.is_error || (msg.subtype && msg.subtype !== 'success')) {
      return [{ type: 'error', message: resultErrorMessage(msg) }]
    }
    const usage: ChatUsage = {
      inputTokens: msg.usage?.input_tokens,
      outputTokens: msg.usage?.output_tokens,
      durationMs: msg.duration_ms
    }
    return [{ type: 'done', usage }]
  }
}

function resultErrorMessage(msg: CliLine): string {
  if (Array.isArray(msg.errors) && msg.errors.length > 0) {
    return msg.errors.map(String).join('\n')
  }
  if (typeof msg.result === 'string' && msg.result.trim()) return msg.result.trim()
  return msg.subtype ?? 'unknown_error'
}
