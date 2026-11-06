import { randomUUID } from 'node:crypto'
import type { DraftApprovalRequest, DraftDecision } from '@shared/connectors'

export type DraftVerdict = { approve: true; body: string } | { approve: false; reason: string }
type Pending = DraftApprovalRequest & {
  conversationId: string
  resolve(v: DraftVerdict): void
  timer: ReturnType<typeof setTimeout>
}

const TIMEOUT_MS = 10 * 60 * 1000

/**
 * Mỗi bản nháp trợ lý muốn tạo (Gmail / Telegram) phải được người dùng xem — có thể sửa nội dung — rồi mới tạo.
 * Không phản hồi trong 10 phút, dừng lượt chat hoặc tắt kết nối → coi như từ chối.
 */
export class DraftApprovals {
  private pending = new Map<string, Pending>()

  constructor(
    private readonly deps: {
      emit(req: DraftApprovalRequest | { id: string; closed: true }): void
      log: { info(msg: string): void }
      timeoutMs?: number
    }
  ) {}

  request(conversationId: string, draft: Omit<DraftApprovalRequest, 'id'>): Promise<DraftVerdict> {
    const id = randomUUID()
    return new Promise<DraftVerdict>((resolve) => {
      const timer = setTimeout(
        () => this.settle(id, { approve: false, reason: 'Hết thời gian chờ người dùng duyệt.' }),
        this.deps.timeoutMs ?? TIMEOUT_MS
      )
      const req: DraftApprovalRequest = { id, ...draft }
      this.pending.set(id, { ...req, conversationId, resolve, timer })
      this.deps.emit(req)
    })
  }

  respond(decision: DraftDecision): boolean {
    const p = this.pending.get(decision.id)
    if (!p) return false
    this.deps.log.info(`Nháp ${p.service}: ${decision.approve ? 'duyệt' : 'từ chối'}`)
    const body = decision.body?.trim() ? decision.body : p.body
    return this.settle(
      decision.id,
      decision.approve
        ? { approve: true, body }
        : { approve: false, reason: 'Người dùng đã từ chối bản nháp này.' }
    )
  }

  cancelConversation(conversationId: string): void {
    for (const [id, p] of this.pending)
      if (p.conversationId === conversationId)
        this.settle(id, { approve: false, reason: 'Đã dừng.' })
  }

  cancelService(service: DraftApprovalRequest['service']): void {
    for (const [id, p] of this.pending)
      if (p.service === service) this.settle(id, { approve: false, reason: 'Kết nối đã tắt.' })
  }

  cancelAll(): void {
    for (const id of [...this.pending.keys()])
      this.settle(id, { approve: false, reason: 'Đã dừng.' })
  }

  private settle(id: string, v: DraftVerdict): boolean {
    const p = this.pending.get(id)
    if (!p) return false
    clearTimeout(p.timer)
    this.pending.delete(id)
    // Đóng hộp thoại ở renderer (hết giờ / dừng chat / đã trả lời).
    this.deps.emit({ id, closed: true })
    p.resolve(v)
    return true
  }
}
