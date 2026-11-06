import { create } from 'zustand'
import type { AgentExchange, AgentNotice, AgentServerStatus, McpApprovalRequest, McpServerInfo } from '@shared/agents'
import { api } from '@renderer/lib/api'
import { coalesce, onSync, optimistic } from '@renderer/lib/sync'

type AgentsStore = {
  status: AgentServerStatus | null
  exchanges: AgentExchange[]
  servers: McpServerInfo[]
  /** Thông báo nhỏ đang hiện (chạm giới hạn, bị dừng…). */
  notices: (AgentNotice & { key: number })[]
  /** Lần gọi tool MCP đang chờ duyệt. */
  approvals: McpApprovalRequest[]
  error: string | null
  refreshStatus(): Promise<void>
  refreshExchanges(): Promise<void>
  refreshServers(): Promise<void>
  /** Đổi trạng thái trên giao diện ngay, lưu sau; lỗi → hoàn tác + hiện lỗi trên trang. */
  patchStatus(patch: (s: AgentServerStatus) => AgentServerStatus, save: () => Promise<unknown>): Promise<boolean>
  patchServers(patch: (list: McpServerInfo[]) => McpServerInfo[], save: () => Promise<unknown>): Promise<boolean>
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
  // Gộp các lần hỏi lại dồn dập (nhiều sự kiện liền nhau khi agent đang chạy việc) thành một.
  refreshStatus: coalesce(async () => set({ status: await api.agents.status() })),
  refreshExchanges: coalesce(async () => set({ exchanges: await api.agents.exchanges() })),
  refreshServers: coalesce(async () => set({ servers: await api.mcp.list() })),
  async patchStatus(patch, save) {
    const before = get().status
    if (!before) return false
    const r = await optimistic({
      topic: 'agents',
      apply: () => set({ status: patch(before), error: null }),
      rollback: () => set({ status: before }),
      save,
      onError: (error) => set({ error })
    })
    return r !== null
  },
  async patchServers(patch, save) {
    const before = get().servers
    const r = await optimistic({
      topic: 'mcpServers',
      apply: () => set({ servers: patch(before) }),
      rollback: () => set({ servers: before }),
      save
    })
    return r !== null
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
  // Lịch sử trao đổi: main báo mỗi lần thêm / đổi trạng thái một việc → không cần hỏi định kỳ.
  const offSync = [
    onSync('agents', () => useAgents.getState().refreshStatus()),
    onSync('agentExchanges', () => useAgents.getState().refreshExchanges()),
    onSync('mcpServers', () => useAgents.getState().refreshServers())
  ]
  void useAgents.getState().refreshStatus()
  return () => {
    offStatus()
    offNotice()
    offApproval()
    offSync.forEach((off) => off())
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
