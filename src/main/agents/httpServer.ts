import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { AgentExchange } from '@shared/agents'
import type { AgentHub, ServerPort, StoredClient } from './hub'
import { bearer } from './tokens'

const MAX_BODY = 256 * 1024
const LOCAL_ORIGIN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/

const text = (t: string, isError = false): { content: { type: 'text'; text: string }[]; isError?: boolean } =>
  isError ? { content: [{ type: 'text', text: t }], isError: true } : { content: [{ type: 'text', text: t }] }

function describe(e: AgentExchange): string {
  const lines = [`id: ${e.id}`, `trạng thái: ${e.status}`, `tạo lúc: ${new Date(e.createdAt).toISOString()}`]
  if (e.error) lines.push(`lỗi: ${e.error}`)
  if (e.output) lines.push('', e.output)
  return lines.join('\n')
}

/** MCP server cho một agent đã xác thực — mỗi request một instance (chế độ stateless). */
export function createMizukiServer(hub: AgentHub, client: StoredClient, assistantName: () => string): McpServer {
  const name = assistantName()
  const server = new McpServer(
    { name: 'mizuki', version: '1.0.0' },
    {
      instructions:
        `${name} là trợ lý cá nhân của người dùng trong app MMC studio. Dùng ask_${'mizuki'} để hỏi nhanh, ` +
        'submit_task để giao việc dài rồi get_task để lấy kết quả. Mỗi yêu cầu tốn hạn mức Claude của người dùng ' +
        'và bị giới hạn số lần mỗi giờ. Mizuki không có quyền xem màn hình, điều khiển máy hay đọc email/tin nhắn.'
    }
  )
  server.registerTool(
    'ask_mizuki',
    {
      title: `Hỏi ${name}`,
      description: `Hỏi ${name} một câu và nhận câu trả lời (chờ tối đa khoảng 100 giây; lâu hơn thì trả mã việc để get_task).`,
      inputSchema: { message: z.string().min(1).max(20_000).describe('Câu hỏi / yêu cầu') }
    },
    async ({ message }) => {
      const r = await hub.ask(client, message)
      return 'error' in r ? text(r.error, true) : text(r.text)
    }
  )
  server.registerTool(
    'submit_task',
    {
      title: `Giao việc cho ${name}`,
      description: 'Giao một việc (chạy nền). Trả về mã việc; dùng get_task để lấy kết quả.',
      inputSchema: {
        title: z.string().min(1).max(200).describe('Tên ngắn của việc'),
        instructions: z.string().min(1).max(20_000).describe('Mô tả chi tiết việc cần làm')
      }
    },
    async ({ title, instructions }) => {
      const r = hub.submit(client, title, instructions)
      return 'error' in r ? text(r.error, true) : text(`Đã nhận việc. Mã: ${r.id}`)
    }
  )
  server.registerTool(
    'get_task',
    {
      title: 'Xem kết quả việc',
      description: 'Trạng thái và kết quả của một việc đã giao (chỉ việc của chính bạn).',
      inputSchema: { id: z.uuid().describe('Mã việc từ submit_task / ask_mizuki') }
    },
    async ({ id }) => {
      const e = hub.getTask(client, id)
      return e ? text(describe(e)) : text('Không tìm thấy việc này.', true)
    }
  )
  server.registerTool(
    'list_tasks',
    { title: 'Danh sách việc', description: 'Các việc gần đây bạn đã giao cho Mizuki.', inputSchema: {} },
    async () => {
      const list = hub.listTasks(client)
      return text(list.length ? list.map((e) => `- ${e.id} [${e.status}] ${e.tool}: ${e.input.split('\n')[0].slice(0, 80)}`).join('\n') : 'Chưa có việc nào.')
    }
  )
  return server
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers }).end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > MAX_BODY) throw new Error('body_too_large')
    chunks.push(chunk as Buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')
}

/**
 * Endpoint MCP (Streamable HTTP, trả JSON) CHỈ trên 127.0.0.1. Thứ tự kiểm tra: Host/Origin (chống DNS
 * rebinding từ trang web) → token → duyệt lần đầu → tool. Mọi lỗi trả JSON rõ ràng, không lộ chi tiết nội bộ.
 */
export function agentHttpServer(hub: AgentHub, assistantName: () => string, log: { warn(msg: string): void }): ServerPort {
  let server: Server | null = null
  let port = 0

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const path = (req.url ?? '').split('?')[0]
    if (path !== '/mcp') return json(res, 404, { error: 'not_found' })
    const host = req.headers.host ?? ''
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return json(res, 403, { error: 'forbidden_host' })
    const origin = req.headers.origin
    if (origin && !LOCAL_ORIGIN.test(origin)) return json(res, 403, { error: 'forbidden_origin' })

    const client = hub.authenticate(bearer(req.headers.authorization))
    if (!client) return json(res, 401, { error: 'invalid_token' }, { 'WWW-Authenticate': 'Bearer' })
    if (!(await hub.ensureApproved(client))) {
      return json(res, 403, { error: 'not_approved', message: 'Người dùng chưa cho phép agent này. Mở MMC studio → Kết nối agent để duyệt, rồi kết nối lại.' })
    }
    if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' }, { Allow: 'POST' })

    let body: unknown
    try {
      body = await readBody(req)
    } catch (err) {
      return json(res, 400, { error: (err as Error).message === 'body_too_large' ? 'body_too_large' : 'invalid_json' })
    }
    const mcp = createMizukiServer(hub, client, assistantName)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    res.on('close', () => {
      void transport.close()
      void mcp.close()
    })
    await mcp.connect(transport)
    await transport.handleRequest(req, res, body)
  }

  return {
    async start(p) {
      if (server) return `http://127.0.0.1:${port}/mcp`
      const s = createServer((req, res) => {
        handle(req, res).catch((err: Error) => {
          log.warn(`Kết nối agent: lỗi xử lý request: ${err.message}`)
          if (!res.headersSent) json(res, 500, { error: 'internal_error' })
        })
      })
      await new Promise<void>((resolve, reject) => {
        s.once('error', reject)
        s.listen(p, '127.0.0.1', () => resolve())
      })
      server = s
      port = (s.address() as AddressInfo).port
      return `http://127.0.0.1:${port}/mcp`
    },
    async stop() {
      const s = server
      server = null
      if (!s) return
      s.closeAllConnections()
      await new Promise<void>((resolve) => s.close(() => resolve()))
    }
  }
}
