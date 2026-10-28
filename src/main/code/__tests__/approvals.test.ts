import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CodeApprovalRequest } from '@shared/types'
import { CodeApprovals } from '../approvals'

const SCRIPT = join(__dirname, '..', '..', '..', '..', 'resources', 'permission-mcp.cjs')

let root: string
let approvals: CodeApprovals
let requests: CodeApprovalRequest[]
let writable: boolean

beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'tw-appr-'))
  writeFileSync(join(root, 'a.txt'), 'xin chao\n')
  requests = []
  writable = true
  approvals = new CodeApprovals({
    writableRoot: (id) => (writable && id === 'conv-1' ? root : null),
    emit: (r) => requests.push(r),
    log: { warn: vi.fn() }
  })
  await approvals.start()
})
afterEach(() => {
  approvals.stop()
  rmSync(root, { recursive: true, force: true })
})

/** Chạy MCP script thật như CLI làm: initialize → tools/list → tools/call. */
async function callTool(args: object, env: Record<string, string> = {}): Promise<{ behavior: string; message?: string }> {
  const child = spawn(process.execPath, [SCRIPT], {
    env: { ...process.env, TW_PERM_URL: approvals.url, TW_PERM_TOKEN: approvals.token, TW_CONVERSATION: 'conv-1', ...env }
  })
  const lines: string[] = []
  let buf = ''
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (c: string) => {
    buf += c
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      lines.push(buf.slice(0, i))
      buf = buf.slice(i + 1)
    }
  })
  const send = (m: object): boolean => child.stdin.write(JSON.stringify(m) + '\n')
  send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } } })
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
  send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'approve', arguments: args } })
  await vi.waitFor(() => expect(lines.some((l) => JSON.parse(l).id === 3)).toBe(true), { timeout: 10_000 })
  child.stdin.end()
  expect(JSON.parse(lines.find((l) => JSON.parse(l).id === 2)!).result.tools[0].name).toBe('approve')
  return JSON.parse(JSON.parse(lines.find((l) => JSON.parse(l).id === 3)!).result.content[0].text)
}

const edit = { tool_name: 'Edit', input: { file_path: 'a.txt', old_string: 'xin chao', new_string: 'xin chào' } }

describe('CodeApprovals + permission-mcp.cjs', () => {
  it('hiện diff cho người dùng; Đồng ý → allow kèm input gốc', async () => {
    const pending = callTool(edit)
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(requests[0]).toMatchObject({ conversationId: 'conv-1', toolName: 'Edit', change: { path: 'a.txt', added: 1, removed: 1 } })
    approvals.respond(requests[0].id, true)
    expect(await pending).toEqual({ behavior: 'allow', updatedInput: edit.input })
  })

  it('Từ chối → deny có lý do', async () => {
    const pending = callTool(edit)
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    approvals.respond(requests[0].id, false)
    expect(await pending).toMatchObject({ behavior: 'deny', message: 'Người dùng đã từ chối thay đổi này.' })
  })

  it('tự từ chối (không hỏi người dùng): ngoài dự án, tool lạ, quyền sửa đang tắt, sai token', async () => {
    expect(await callTool({ tool_name: 'Write', input: { file_path: join(tmpdir(), 'x.txt'), content: 'x' } })).toMatchObject({ behavior: 'deny' })
    expect(await callTool({ tool_name: 'Bash', input: { command: 'rm -rf .' } })).toMatchObject({ behavior: 'deny' })
    writable = false
    expect(await callTool(edit)).toMatchObject({ behavior: 'deny', message: 'Chế độ sửa file đang tắt.' })
    writable = true
    expect(await callTool(edit, { TW_PERM_TOKEN: 'sai' })).toMatchObject({ behavior: 'deny' })
    expect(requests).toEqual([])
  })

  it('dừng phản hồi → từ chối yêu cầu đang chờ', async () => {
    const pending = callTool(edit)
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    approvals.cancelConversation('conv-1')
    expect(await pending).toMatchObject({ behavior: 'deny' })
  })
})
