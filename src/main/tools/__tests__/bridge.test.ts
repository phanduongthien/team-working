import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ToolBridge } from '../bridge'
import { AppToolRegistry } from '../registry'

const SCRIPT = join(__dirname, '..', '..', '..', '..', 'resources', 'app-tools-mcp.cjs')

let enabled = true
let registry: AppToolRegistry
let bridge: ToolBridge

beforeEach(async () => {
  enabled = true
  registry = new AppToolRegistry()
  registry.register({
    name: 'echo',
    description: 'Lặp lại chữ',
    input: z.object({ text: z.string().max(10) }),
    available: () => enabled,
    run: async ({ text }, ctx) => ({ content: [{ type: 'text', text: `${ctx.conversationId}:${text}` }] })
  })
  registry.register({
    name: 'boom',
    description: 'Luôn lỗi',
    input: z.object({}),
    available: () => true,
    run: async () => {
      throw new Error('hỏng')
    }
  })
  bridge = new ToolBridge(registry)
  await bridge.start()
})
afterEach(() => bridge.stop())

const post = async (path: string, body: object): Promise<unknown> => {
  const res = await fetch(`${bridge.url}${path}`, { method: 'POST', body: JSON.stringify(body) })
  return res.json()
}

describe('AppToolRegistry', () => {
  it('từ chối tên tool sai định dạng hoặc trùng', () => {
    const tool = { name: 'Bad-Name', description: '', input: z.object({}), available: () => true, run: async () => ({ content: [] }) }
    expect(() => registry.register(tool)).toThrow()
    expect(() => registry.register({ ...tool, name: 'echo' })).toThrow()
  })

  it('validate input bằng zod, bắt lỗi khi chạy, tool bị tắt thì từ chối', async () => {
    const ctx = { conversationId: 'c1' }
    expect(await registry.call('echo', { text: 'hi' }, ctx)).toEqual({ content: [{ type: 'text', text: 'c1:hi' }] })
    expect((await registry.call('echo', { text: 'quá dài hơn mười ký tự' }, ctx)).isError).toBe(true)
    expect(await registry.call('boom', {}, ctx)).toMatchObject({ isError: true, content: [{ text: expect.stringContaining('hỏng') }] })
    expect((await registry.call('nope', {}, ctx)).isError).toBe(true)
    enabled = false
    expect(registry.available(ctx)).toEqual(['boom'])
    expect(await registry.call('echo', { text: 'hi' }, ctx)).toMatchObject({ isError: true })
  })

  it('definitions trả JSON Schema dạng object, không có $schema', () => {
    const [echo] = registry.definitions({ conversationId: 'c1' })
    expect(echo.name).toBe('echo')
    expect(echo.inputSchema).toMatchObject({ type: 'object', properties: { text: { type: 'string', maxLength: 10 } } })
    expect(echo.inputSchema).not.toHaveProperty('$schema')
  })
})

describe('ToolBridge', () => {
  it('sai token → danh sách rỗng, gọi tool bị từ chối', async () => {
    expect(await post('/list', { token: 'x', conversationId: 'c1' })).toEqual({ tools: [] })
    expect(await post('/call', { token: 'x', conversationId: 'c1', name: 'echo', input: { text: 'a' } })).toMatchObject({ isError: true })
  })

  it('đổi token (dừng khẩn cấp) → token cũ hết hiệu lực', async () => {
    const old = bridge.token
    expect(await post('/call', { token: old, conversationId: 'c1', name: 'echo', input: { text: 'a' } })).toEqual({
      content: [{ type: 'text', text: 'c1:a' }]
    })
    bridge.rotateToken()
    expect(await post('/call', { token: old, conversationId: 'c1', name: 'echo', input: { text: 'a' } })).toMatchObject({ isError: true })
  })

  it('script MCP thật (stdio) liệt kê và gọi tool qua bridge', async () => {
    const child = spawn(process.execPath, [SCRIPT], {
      env: { ...process.env, MMC_TOOLS_URL: bridge.url, MMC_TOOLS_TOKEN: bridge.token, MMC_CONVERSATION: 'conv-9' }
    })
    const replies = new Map<number, unknown>()
    createInterface({ input: child.stdout }).on('line', (line) => {
      const msg = JSON.parse(line) as { id: number; result: unknown }
      replies.set(msg.id, msg.result)
    })
    const rpc = async (id: number, method: string, params: object = {}): Promise<unknown> => {
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
      for (let i = 0; i < 200 && !replies.has(id); i++) await new Promise((r) => setTimeout(r, 10))
      return replies.get(id)
    }
    try {
      expect(await rpc(1, 'initialize', { protocolVersion: '2025-06-18' })).toMatchObject({ serverInfo: { name: 'mmc' } })
      const list = (await rpc(2, 'tools/list')) as { tools: { name: string }[] }
      expect(list.tools.map((t) => t.name)).toEqual(['echo', 'boom'])
      expect(await rpc(3, 'tools/call', { name: 'echo', arguments: { text: 'xin chào' } })).toEqual({
        content: [{ type: 'text', text: 'conv-9:xin chào' }]
      })
      bridge.rotateToken()
      expect(await rpc(4, 'tools/call', { name: 'echo', arguments: { text: 'a' } })).toMatchObject({ isError: true })
    } finally {
      child.kill()
    }
  })
})
