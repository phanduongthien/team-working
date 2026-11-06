import { create } from 'zustand'
import type { AgentExchange, AgentNotice, AgentServerStatus, McpApprovalRequest, McpServerInfo } from '@shared/agents'
import { api } from '@renderer/lib/api'

type AgentsStore = {
  status: AgentServerStatus | null
  exchanges: AgentExchange[]
  servers: McpServerInfo[]
  /** Thông báo nhỏ đang hiện (chạm giới hạn, bị dừng…). */
  notices: (AgentNotice & { key: number })[]
  /** Lần gọi tool MCP đang chờ duyệt. */
  approvals: McpApprovalRequest[]
  error: string | null
  refreshExchanges(): Promise<void>
  refreshServers(): Promise<void>
  dismissNotice(key: number): void
  respondApproval(id: string, decision: 'once' | 'always' | 'deny'): Promise<void>
  setError(error: string | null): void
}

let noticeKey = 0

export const useAgents = create<AgentsStore>((set, get) => ({
  status: null,
  exchanges: [],
  servers: [],
  notices: [],
  approvals: [],
  error: null,
  async refreshExchanges() {
    set({ exchanges: await api.agents.exchanges() })
  },
  async refreshServers() {
    set({ servers: await api.mcp.list() })
  },
  dismissNotice: (key) => set((s) => ({ notices: s.notices.filter((n) => n.key !== key) })),
  async respondApproval(id, decision) {
    set((s) => ({ approvals: s.approvals.filter((a) => a.id !== id) }))
    await api.mcp.respond(id, decision)
    if (decision === 'always') await get().refreshServers()
  },
  setError: (error) => set({ error })
}))

const NOTICE_MS = 10_000

/** Nghe sự kiện từ main ngay từ lúc mở app (duyệt agent / duyệt tool có thể đến bất cứ lúc nào). */
export function setupAgents(): () => void {
  const offStatus = api.agents.onStatus((status) => {
    useAgents.setState({ status })
    void useAgents.getState().refreshExchanges()
  })
  const offNotice = api.agents.onNotice((notice) => {
    const key = ++noticeKey
    useAgents.setState((s) => ({ notices: [...s.notices, { ...notice, key }].slice(-3) }))
    setTimeout(() => useAgents.getState().dismissNotice(key), NOTICE_MS)
    void useAgents.getState().refreshExchanges()
  })
  const offApproval = api.mcp.onApproval((req) => useAgents.setState((s) => ({ approvals: [...s.approvals, req] })))
  void api.agents.status().then((status) => useAgents.setState({ status }))
  return () => {
    offStatus()
    offNotice()
    offApproval()
  }
}

/** "KEY=VALUE" (biến môi trường) hoặc "Name: value" (header), mỗi dòng một cặp. */
export function parsePairs(text: string, sep: '=' | ':'): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const i = line.indexOf(sep)
    if (i <= 0) continue
    const key = line.slice(0, i).trim()
    if (key) out[key] = line.slice(i + 1).trim()
  }
  return out
}

export const hhmm = (ms: number): string => new Date(ms).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
