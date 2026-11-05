import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { pythonCommand, SidecarClient } from '../client'

// Sidecar giả: script Node nói cùng giao thức JSON-lines với desktop_server.py.
let dir: string
let script: string
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'mmc-sidecar-client-'))
  script = join(dir, 'fake.js')
  writeFileSync(
    script,
    `const rl = require('node:readline').createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const { id, method, params } = JSON.parse(line)
  const reply = (m) => process.stdout.write(JSON.stringify({ id, ...m }) + '\\n')
  if (method === 'echo') reply({ result: params })
  else if (method === 'fail') reply({ error: 'ValueError: nope' })
  else if (method === 'pid') reply({ result: process.pid })
  else if (method === 'crash') process.exit(3)
  // 'hang': không trả lời
})
`
  )
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

let client: SidecarClient | null = null
afterEach(() => client?.stop())

const make = (timeoutMs = 10_000): SidecarClient =>
  (client = new SidecarClient({ command: () => ({ cmd: process.execPath, args: [script] }), log: { warn: () => {} }, timeoutMs }))

describe('SidecarClient', () => {
  it('chưa cài → báo lỗi rõ ràng', async () => {
    const c = new SidecarClient({ command: () => null, log: { warn: () => {} } })
    await expect(c.call('echo')).rejects.toThrow('Chưa cài Python sidecar')
  })

  it('gọi và nhận kết quả (UTF-8); lỗi từ Python thành Error', async () => {
    const c = make()
    expect(await c.call('echo', { a: 1, text: 'xin chào' })).toEqual({ a: 1, text: 'xin chào' })
    await expect(c.call('fail')).rejects.toThrow('ValueError: nope')
    expect(c.running).toBe(true)
  })

  it('quá giờ → kill và tự khởi động lại ở lần gọi sau', async () => {
    // Giới hạn ngắn CHỈ cho lệnh treo — khởi động tiến trình trên máy CI chậm có thể mất > 300 ms.
    const c = make(10_000)
    const firstPid = await c.call<number>('pid')
    await expect(c.call('hang', {}, 300)).rejects.toThrow('không phản hồi')
    expect(c.running).toBe(false)
    expect(await c.call<number>('pid')).not.toBe(firstPid)
  })

  it('tiến trình chết → yêu cầu đang chờ bị huỷ, lần sau chạy lại được', async () => {
    const c = make()
    await expect(c.call('crash')).rejects.toThrow('dừng bất thường')
    expect(await c.call('echo', { ok: true })).toEqual({ ok: true })
  })

  it('stop() huỷ yêu cầu đang chờ', async () => {
    const c = make()
    const pending = c.call('hang')
    await new Promise((r) => setTimeout(r, 100))
    c.stop()
    await expect(pending).rejects.toThrow('đã dừng')
  })

  it('pythonCommand chạy cô lập, tắt cảnh báo', () => {
    expect(pythonCommand('C:\\sc\\venv\\Scripts\\python.exe', 'C:\\res\\desktop_server.py')).toEqual({
      cmd: 'C:\\sc\\venv\\Scripts\\python.exe',
      args: ['-I', '-W', 'ignore', 'C:\\res\\desktop_server.py']
    })
  })
})
