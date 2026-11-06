/** Kết nối với agent khác — kiểu dùng chung main/renderer. */

/** Một agent được cấp token (Claude Code, Claude Desktop…). */
export type AgentClient = {
  id: string
  name: string
  createdAt: number
  /** Người dùng đã duyệt ở lần kết nối đầu tiên. */
  approved: boolean
  lastSeenAt: number | null
  requestCount: number
}

export type AgentLimits = { perHour: number; concurrency: number }

export type AgentServerStatus = {
  enabled: boolean
  running: boolean
  /** Endpoint MCP (Streamable HTTP), chỉ nghe 127.0.0.1. */
  url: string | null
  port: number
  error: string | null
  /** Phím dừng khẩn cấp đã đăng ký — không đăng ký được thì không bật server. */
  armed: boolean
  limits: AgentLimits
  clients: AgentClient[]
  /** Agent đang chờ người dùng duyệt lần đầu. */
  pending: { clientId: string; name: string; at: number }[]
}

export type AgentExchangeStatus = 'queued' | 'running' | 'done' | 'error' | 'rejected'

export type AgentExchange = {
  id: string
  clientId: string
  clientName: string
  tool: string
  input: string
  output: string | null
  status: AgentExchangeStatus
  error: string | null
  createdAt: number
  finishedAt: number | null
}

/** Thông báo nhỏ trong app (chạm giới hạn, bị dừng…). */
export type AgentNotice =
  | { kind: 'rate_limited'; clientName: string; at: number; retryAfterSec: number }
  | { kind: 'queue_full'; clientName: string; at: number }
  | { kind: 'stopped'; at: number }

/** Token mới tạo — chỉ trả về MỘT lần, kèm sẵn lệnh cấu hình cho Claude Code / Claude Desktop. */
export type NewAgentToken = {
  client: AgentClient
  token: string
  claudeCode: string
  claudeDesktop: string
}

// ---- MCP client: Mizuki dùng MCP server khác ----

export type McpServerType = 'stdio' | 'http'

export type McpServerInfo = {
  id: string
  /** Tên dùng trong tool: mcp__<name>__<tool>. */
  name: string
  type: McpServerType
  command: string | null
  args: string[]
  url: string | null
  enabled: boolean
  /** Tên biến môi trường / header có giá trị bí mật đã lưu (giá trị không bao giờ gửi về renderer). */
  secretKeys: string[]
  /** Tool người dùng đã bấm "luôn cho phép". */
  alwaysAllow: string[]
}

export type McpApprovalRequest = { id: string; server: string; tool: string; input: unknown }
export type McpApprovalDecision = 'once' | 'always' | 'deny'
