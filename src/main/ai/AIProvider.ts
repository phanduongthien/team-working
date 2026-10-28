import type { ChatEvent, ChatMode } from '@shared/ai'

export type ChatRequest = {
  prompt: string
  systemPrompt: string
  mode: ChatMode
  /** Session cũ để tiếp tục hội thoại (CLI: --resume). */
  sessionId?: string
  /** Thư mục làm việc: workspace của app, hoặc thư mục dự án ở chế độ Code. */
  cwd: string
  /** Tool được phép; mặc định không tool nào. */
  tools?: string[]
}

export interface AIProvider {
  readonly id: string
  isAvailable(): Promise<{ ok: boolean; reason?: string }>
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent>
}
