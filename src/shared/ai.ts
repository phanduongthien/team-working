export const CHAT_MODES = ['free', 'study', 'code', 'project'] as const
export type ChatMode = (typeof CHAT_MODES)[number]

export type ChatUsage = {
  inputTokens?: number
  outputTokens?: number
  durationMs?: number
}

/** Sự kiện duy nhất renderer nhìn thấy — không lộ chi tiết CLI/API. */
export type ChatEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string; input: unknown }
  | { type: 'done'; usage?: ChatUsage }
  | { type: 'error'; message: string }

export type CliState = 'ok' | 'not_installed' | 'not_logged_in' | 'error'

export type CliStatus = {
  state: CliState
  version?: string
  executablePath?: string
  subscriptionType?: string
  message?: string
}
