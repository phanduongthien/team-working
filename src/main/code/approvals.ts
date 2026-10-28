import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { CodeApprovalRequest } from '@shared/types'
import { describeChange } from './change'

export type ApprovalDeps = {
  /** Thư mục dự án của hội thoại nếu chế độ Code đang BẬT quyền sửa; null = không được phép. */
  writableRoot(conversationId: string): string | null
  emit(request: CodeApprovalRequest): void
  log: { warn(msg: string): void }
}

type Decision = { allow: boolean; message?: string }
type Pending = { conversationId: string; resolve(d: Decision): void; timer: ReturnType<typeof setTimeout> }

const DECISION_TIMEOUT_MS = 10 * 60 * 1000
const MAX_BODY = 5 * 1024 * 1024

/**
 * Cầu nối duyệt quyền: MCP script (permission-mcp.cjs) gửi yêu cầu Edit/Write về đây,
 * app hiện diff cho người dùng và trả quyết định. Chỉ nghe 127.0.0.1, bắt buộc token.
 */
export class CodeApprovals {
  private server: Server | null = null
  private pending = new Map<string, Pending>()
  readonly token = randomBytes(24).toString('hex')
  url = ''

  constructor(private readonly deps: ApprovalDeps) {}

  async start(): Promise<void> {
    if (this.server) return
    this.server = createServer((req, res) => {
      if (req.method !== 'POST' || req.url !== '/approve') {
        res.writeHead(404).end()
        return
      }
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (c: string) => {
        body += c
        if (body.length > MAX_BODY) req.destroy()
      })
      req.on('end', () => {
        void this.handle(body).then((decision) => {
          res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(decision))
        })
      })
    })
    // Không giới hạn thời gian chờ: người dùng có thể cần vài phút để đọc diff.
    this.server.requestTimeout = 0
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  private tokenOk(value: unknown): boolean {
    if (typeof value !== 'string' || value.length !== this.token.length) return false
    return timingSafeEqual(Buffer.from(value), Buffer.from(this.token))
  }

  private async handle(raw: string): Promise<Decision> {
    let body: { token?: unknown; conversationId?: unknown; toolName?: unknown; input?: unknown }
    try {
      body = JSON.parse(raw)
    } catch {
      return { allow: false, message: 'invalid_request' }
    }
    if (!this.tokenOk(body.token)) return { allow: false, message: 'invalid_token' }
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId : ''
    const toolName = typeof body.toolName === 'string' ? body.toolName : ''
    const root = this.deps.writableRoot(conversationId)
    if (!root) return { allow: false, message: 'Chế độ sửa file đang tắt.' }

    const change = await describeChange(root, toolName, body.input)
    if ('error' in change) {
      this.deps.log.warn(`Từ chối tự động ${toolName}: ${change.error}`)
      const reasons = {
        outside_project: 'Chỉ được sửa file trong thư mục dự án đã chọn.',
        unsupported_tool: 'Tool này không được phép trong Team Working.',
        old_string_not_found: 'Không tìm thấy đoạn cần sửa trong file.',
        invalid_input: 'Yêu cầu sửa file không hợp lệ.'
      }
      return { allow: false, message: reasons[change.error] }
    }

    const id = randomUUID()
    return new Promise<Decision>((resolve) => {
      const timer = setTimeout(() => this.settle(id, { allow: false, message: 'Hết thời gian chờ người dùng duyệt.' }), DECISION_TIMEOUT_MS)
      this.pending.set(id, { conversationId, resolve, timer })
      this.deps.emit({ id, conversationId, toolName, change })
    })
  }

  private settle(id: string, decision: Decision): boolean {
    const p = this.pending.get(id)
    if (!p) return false
    clearTimeout(p.timer)
    this.pending.delete(id)
    p.resolve(decision)
    return true
  }

  /** Người dùng bấm Đồng ý / Từ chối. */
  respond(id: string, allow: boolean): boolean {
    return this.settle(id, allow ? { allow: true } : { allow: false, message: 'Người dùng đã từ chối thay đổi này.' })
  }

  /** Dừng phản hồi / tắt quyền sửa → từ chối mọi yêu cầu đang chờ của hội thoại. */
  cancelConversation(conversationId: string): void {
    for (const [id, p] of this.pending) if (p.conversationId === conversationId) this.settle(id, { allow: false, message: 'Đã dừng.' })
  }

  stop(): void {
    for (const id of [...this.pending.keys()]) this.settle(id, { allow: false, message: 'App đang đóng.' })
    this.server?.close()
    this.server = null
  }
}
