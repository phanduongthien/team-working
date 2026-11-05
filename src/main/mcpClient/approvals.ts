import { randomUUID } from 'node:crypto'
import type { McpApprovalDecision, McpApprovalRequest } from '@shared/agents'
import type { McpServerStore } from './store'

type Decision = { allow: boolean; message?: string }
type Pending = McpApprovalRequest & { conversationId: string; resolve(d: Decision): void; timer: ReturnType<typeof setTimeout> }

const TIMEOUT_MS = 10 * 60 * 1000

/** "mcp__<server>__<tool>" → { server, tool }. Tên server không chứa "__" (zod chặn lúc thêm). */
export function parseToolName(name: string): { server: string; tool: string } | null {
  const m = /^mcp__([a-z0-9][a-z0-9_-]*?)__(.+)$/.exec(name)
  return m ? { server: m[1], tool: m[2] } : null
}

/**
 * Duyệt từng lần Mizuki gọi tool của MCP server người dùng thêm. "Luôn cho phép" ghi tool vào danh sách
 * tự duyệt của server (thu hồi được trong trang Kết nối agent). Không phản hồi trong 10 phút → từ chối.
 */
export class McpApprovals {
  private pending = new Map<string, Pending>()

  constructor(
    private readonly deps: {
      store: Pick<McpServerStore, 'isUserServer' | 'allowAlways'>
      emit(req: McpApprovalRequest): void
      log: { info(msg: string): void; warn(msg: string): void }
      timeoutMs?: number
    }
  ) {}

  request(conversationId: string, toolName: string, input: unknown): Promise<Decision> {
    const parsed = parseToolName(toolName)
    if (!parsed || !this.deps.store.isUserServer(parsed.server)) {
      this.deps.log.warn(`MCP: từ chối tự động tool lạ ${toolName}`)
      return Promise.resolve({ allow: false, message: 'Tool này không thuộc MCP server nào người dùng đã thêm.' })
    }
    const id = randomUUID()
    return new Promise<Decision>((resolve) => {
      const timer = setTimeout(() => this.settle(id, { allow: false, message: 'Hết thời gian chờ người dùng duyệt.' }), this.deps.timeoutMs ?? TIMEOUT_MS)
      this.pending.set(id, { id, conversationId, server: parsed.server, tool: parsed.tool, input, resolve, timer })
      this.deps.emit({ id, server: parsed.server, tool: parsed.tool, input })
    })
  }

  respond(id: string, decision: McpApprovalDecision): boolean {
    const p = this.pending.get(id)
    if (!p) return false
    if (decision === 'always') this.deps.store.allowAlways(p.server, p.tool)
    this.deps.log.info(`MCP: ${decision} ${p.server}/${p.tool}`)
    return this.settle(id, decision === 'deny' ? { allow: false, message: 'Người dùng đã từ chối lần gọi tool này.' } : { allow: true })
  }

  cancelConversation(conversationId: string): void {
    for (const [id, p] of this.pending) if (p.conversationId === conversationId) this.settle(id, { allow: false, message: 'Đã dừng.' })
  }

  cancelAll(): void {
    for (const id of [...this.pending.keys()]) this.settle(id, { allow: false, message: 'Đã dừng.' })
  }

  private settle(id: string, d: Decision): boolean {
    const p = this.pending.get(id)
    if (!p) return false
    clearTimeout(p.timer)
    this.pending.delete(id)
    p.resolve(d)
    return true
  }
}
