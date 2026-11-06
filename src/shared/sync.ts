/**
 * Đồng bộ trạng thái toàn app: main phát `sync:changed` (danh sách mục vừa đổi), renderer hỏi lại đúng mục đó.
 * Tính năng mới có trạng thái hiện trên giao diện → thêm mục vào đây (xem CLAUDE.md, "Đồng bộ trạng thái").
 */
export const SYNC_TOPICS = [
  'update',
  'computer',
  'sidecar',
  'agents',
  'agentExchanges',
  'mcpServers',
  'voice',
  'expressive',
  'skills',
  'gmail',
  'telegram',
  'artifacts',
  'ai',
  'appearance',
  'assistant',
  'workday',
  'conversations',
  'expressiveRecent',
  'memory'
] as const

export type SyncTopic = (typeof SYNC_TOPICS)[number]

/** Khoá trong bảng settings → mục bị ảnh hưởng. Ghi settings là tự báo, không cần nhớ gọi riêng. */
export const SETTINGS_TOPICS: Record<string, SyncTopic> = {
  update: 'update',
  updateSkipped: 'update',
  computerUse: 'computer',
  agents: 'agents',
  agentClients: 'agents',
  mcpServers: 'mcpServers',
  voice: 'voice',
  expressive: 'expressive',
  expressiveStats: 'expressive',
  expressiveFavorites: 'expressive',
  skills: 'skills',
  gmail: 'gmail',
  telegram: 'telegram',
  ai: 'ai',
  appearance: 'appearance',
  assistant: 'assistant',
  workday: 'workday',
  chatOrganize: 'conversations',
  expressiveRecent: 'expressiveRecent'
}
