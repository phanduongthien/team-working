import type { ChatEvent, ChatMode } from '@shared/ai'
import type { StoredAttachment } from '@shared/types'

export type HistoryMessage = { role: 'user' | 'assistant'; content: string }

export type ChatRequest = {
  prompt: string
  systemPrompt: string
  mode: ChatMode
  /** Session cũ để tiếp tục hội thoại (CLI: --resume). */
  sessionId?: string
  /** Lịch sử gần đây — chỉ provider không giữ session (API) dùng. */
  history?: HistoryMessage[]
  /** File đính kèm của tin nhắn hiện tại (đã copy vào workspace). */
  attachments?: StoredAttachment[]
  /** Thư mục làm việc: workspace của app, hoặc thư mục dự án ở chế độ Code. */
  cwd: string
  /** Tool được phép; mặc định không tool nào. */
  tools?: string[]
  /** Lượt gọi một lần (vd trích memory) — không lưu session. */
  ephemeral?: boolean
}

export interface AIProvider {
  readonly id: string
  /** true: provider tự nhớ hội thoại qua sessionId; false: cần gửi kèm history. */
  readonly stateful: boolean
  isAvailable(): Promise<{ ok: boolean; reason?: string }>
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>
}

/** Chạy một lượt và gom toàn bộ text (dùng cho tác vụ nền như trích memory). */
export async function completeText(
  provider: AIProvider,
  req: ChatRequest,
  signal: AbortSignal
): Promise<{ text: string } | { error: string }> {
  let text = ''
  for await (const event of provider.chat(req, signal)) {
    if (event.type === 'text') text += event.delta
    else if (event.type === 'error') return { error: event.message }
  }
  return { text }
}
