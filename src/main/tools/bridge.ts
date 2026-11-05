import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { errorResult, type AppToolRegistry, type ToolResult } from './registry'

const MAX_BODY = 1024 * 1024

/**
 * Cầu nối HTTP (chỉ 127.0.0.1, bắt buộc token) giữa script MCP `resources/app-tools-mcp.cjs`
 * (CLI spawn) và registry tool trong main. `rotateToken()` vô hiệu ngay mọi phiên CLI đang chạy
 * (dùng khi dừng khẩn cấp) — script cũ còn giữ token cũ sẽ bị từ chối.
 */
export class ToolBridge {
  private server: Server | null = null
  private currentToken = randomBytes(24).toString('hex')
  url = ''

  constructor(private readonly registry: AppToolRegistry) {}

  get token(): string {
    return this.currentToken
  }

  rotateToken(): void {
    this.currentToken = randomBytes(24).toString('hex')
  }

  async start(): Promise<void> {
    if (this.server) return
    this.server = createServer((req, res) => {
      if (req.method !== 'POST' || (req.url !== '/list' && req.url !== '/call')) {
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
        void this.handle(req.url!, body).then(
          (result) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result)),
          () => res.writeHead(500).end()
        )
      })
    })
    // Tool sau này có thể chờ người dùng xác nhận vài phút.
    this.server.requestTimeout = 0
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve))
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`
  }

  stop(): void {
    this.server?.close()
    this.server = null
  }

  private tokenOk(value: unknown): boolean {
    if (typeof value !== 'string' || value.length !== this.currentToken.length) return false
    return timingSafeEqual(Buffer.from(value), Buffer.from(this.currentToken))
  }

  private async handle(path: string, raw: string): Promise<unknown> {
    let body: { token?: unknown; conversationId?: unknown; name?: unknown; input?: unknown }
    try {
      body = JSON.parse(raw)
    } catch {
      return errorResult('invalid_request')
    }
    const denied: ToolResult = errorResult('Phiên làm việc đã bị dừng hoặc không hợp lệ. Hãy dừng lại và báo người dùng.')
    if (!this.tokenOk(body.token) || typeof body.conversationId !== 'string') {
      return path === '/list' ? { tools: [] } : denied
    }
    const ctx = { conversationId: body.conversationId }
    if (path === '/list') return { tools: this.registry.definitions(ctx) }
    if (typeof body.name !== 'string') return errorResult('invalid_request')
    return this.registry.call(body.name, body.input, ctx)
  }
}
