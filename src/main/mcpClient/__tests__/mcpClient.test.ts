import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpApprovalRequest, McpServerInfo } from '@shared/agents'
import { mcpServerInputSchema } from '@shared/schemas'
import { mcpConfig } from '../../ai/claudeCli'
import { McpApprovals, parseToolName } from '../approvals'
import { McpServerStore } from '../store'

// Mã hoá giả (đảo + tiền tố) để kiểm tra giá trị bí mật không nằm dạng thường trong file.
const crypto = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from('ENC:' + Buffer.from(s).toString('base64')),
  decryptString: (b: Buffer) => Buffer.from(b.toString().slice(4), 'base64').toString()
}

let dir: string
let list: McpServerInfo[]
let store: McpServerStore
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mmc-mcp-'))
  list = []
  store = new McpServerStore({ get: () => list, set: (l) => void (list = l) }, dir, crypto)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('McpServerStore', () => {
  it('lưu server; giá trị bí mật mã hoá, renderer chỉ thấy tên khoá', () => {
    const s = store.save({ name: 'github', type: 'http', url: 'https://api.example.com/mcp', headers: { Authorization: 'Bearer ghp_secret' }, enabled: true })
    expect(s.secretKeys).toEqual(['Authorization'])
    expect(JSON.stringify(list)).not.toContain('ghp_secret')
    expect(readFileSync(join(dir, 'mcp-servers.bin'), 'utf8')).not.toContain('ghp_secret')
    expect(store.forCli()).toEqual({
      servers: { github: { type: 'http', url: 'https://api.example.com/mcp', headers: { Authorization: 'Bearer ghp_secret' } } },
      allowedTools: []
    })
  })

  it('sửa server: giá trị bí mật để trống = giữ giá trị cũ', () => {
    const s = store.save({ name: 'fs', type: 'stdio', command: 'npx', args: ['-y', 'server-fs'], env: { TOKEN: 'abc' }, enabled: true })
    store.save({ id: s.id, name: 'fs', type: 'stdio', command: 'npx', args: ['-y', 'server-fs', 'D:\\game'], env: { TOKEN: '' }, enabled: true })
    expect(store.forCli()!.servers.fs).toEqual({ command: 'npx', args: ['-y', 'server-fs', 'D:\\game'], env: { TOKEN: 'abc' } })
  })

  it('tên dành riêng / trùng / có "__" bị chặn', () => {
    expect(() => store.save({ name: 'mmc', type: 'stdio', command: 'x', args: [], env: {}, enabled: true })).toThrow('reserved_name')
    store.save({ name: 'a', type: 'stdio', command: 'x', args: [], env: {}, enabled: true })
    expect(() => store.save({ name: 'a', type: 'stdio', command: 'y', args: [], env: {}, enabled: true })).toThrow('duplicate_name')
    expect(mcpServerInputSchema.safeParse({ name: 'a__b', type: 'stdio', command: 'x', args: [], env: {}, enabled: true }).success).toBe(false)
  })

  it('"luôn cho phép" → tool vào --allowedTools; thu hồi được; server tắt thì không nạp', () => {
    const s = store.save({ name: 'notion', type: 'stdio', command: 'x', args: [], env: {}, enabled: true })
    store.allowAlways('notion', 'search')
    expect(store.forCli()!.allowedTools).toEqual(['mcp__notion__search'])
    store.revokeAlways(s.id, 'search')
    expect(store.forCli()!.allowedTools).toEqual([])
    store.setEnabled(s.id, false)
    expect(store.forCli()).toBeNull()
  })
})

describe('McpApprovals', () => {
  const make = () => {
    const emitted: McpApprovalRequest[] = []
    store.save({ name: 'notion', type: 'stdio', command: 'x', args: [], env: {}, enabled: true })
    const approvals = new McpApprovals({ store, emit: (r) => void emitted.push(r), log: { info: () => {}, warn: () => {} }, timeoutMs: 200 })
    return { approvals, emitted }
  }

  it('parseToolName', () => {
    expect(parseToolName('mcp__notion__search_pages')).toEqual({ server: 'notion', tool: 'search_pages' })
    expect(parseToolName('mcp__my-srv__a__b')).toEqual({ server: 'my-srv', tool: 'a__b' })
    expect(parseToolName('Read')).toBeNull()
  })

  it('mỗi lần gọi phải duyệt: một lần / luôn cho phép / từ chối', async () => {
    const { approvals, emitted } = make()
    const once = approvals.request('c1', 'mcp__notion__search', { q: 'GDD' })
    await vi.waitFor(() => expect(emitted).toHaveLength(1))
    expect(emitted[0]).toMatchObject({ server: 'notion', tool: 'search', input: { q: 'GDD' } })
    approvals.respond(emitted[0].id, 'once')
    expect(await once).toEqual({ allow: true })
    expect(store.forCli()!.allowedTools).toEqual([])

    const always = approvals.request('c1', 'mcp__notion__search', {})
    approvals.respond(emitted[1].id, 'always')
    expect(await always).toEqual({ allow: true })
    expect(store.forCli()!.allowedTools).toEqual(['mcp__notion__search'])

    const deny = approvals.request('c1', 'mcp__notion__delete_page', {})
    approvals.respond(emitted[2].id, 'deny')
    expect(await deny).toMatchObject({ allow: false })
  })

  it('tool của server lạ → từ chối không cần hỏi; hết giờ / dừng hội thoại → từ chối', async () => {
    const { approvals, emitted } = make()
    expect(await approvals.request('c1', 'mcp__evil__x', {})).toMatchObject({ allow: false })
    expect(emitted).toHaveLength(0)
    expect(await approvals.request('c1', 'mcp__notion__search', {})).toMatchObject({ allow: false, message: expect.stringContaining('Hết thời gian') })
    const p = approvals.request('c2', 'mcp__notion__search', {})
    approvals.cancelConversation('c2')
    expect(await p).toMatchObject({ allow: false })
  })
})

it('mcpConfig: server người dùng thêm không đè được server của app', () => {
  const cfg = JSON.parse(
    mcpConfig({
      electronPath: 'e',
      permission: { script: 'p', url: 'u', token: 't', conversationId: 'c' },
      extra: { notion: { command: 'x', args: [] }, twperm: { command: 'evil', args: [] } }
    })
  )
  expect(Object.keys(cfg.mcpServers).sort()).toEqual(['notion', 'twperm'])
  expect(cfg.mcpServers.twperm.args).toEqual(['p'])
})
