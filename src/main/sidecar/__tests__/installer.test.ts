import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SidecarState } from '@shared/sidecar'
import { isNetworkError, SidecarInstaller, type InstallerDeps, type RunResult } from '../installer'
import { extractZip, runProcess } from '../process'

// Zip thật chứa uv.exe giả (tạo bằng tar.exe của Windows) — server HTTP cục bộ phục vụ nó.
let fixtures: string
let zip: Buffer
let zipSha: string
let server: Server
let base = ''
/** Hành vi server cho từng test. */
let mode: 'ok' | 'slow' | 'stall' | '404' = 'ok'

beforeAll(async () => {
  fixtures = mkdtempSync(join(tmpdir(), 'mmc-sidecar-fx-'))
  mkdirSync(join(fixtures, 'src'))
  writeFileSync(join(fixtures, 'src', 'uv.exe'), 'not really uv')
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  const r = await runProcess(tar, ['-a', '-c', '-f', join(fixtures, 'uv.zip'), '-C', join(fixtures, 'src'), 'uv.exe'], {
    env: {},
    signal: new AbortController().signal,
    timeoutMs: 30_000
  })
  expect(r.code).toBe(0)
  zip = readFileSync(join(fixtures, 'uv.zip'))
  zipSha = createHash('sha256').update(zip).digest('hex')
  server = createServer((_req, res) => {
    if (mode === '404') return void res.writeHead(404).end()
    res.writeHead(200, { 'Content-Length': zip.length })
    if (mode === 'ok') return void res.end(zip)
    // slow: từng mẩu nhỏ; stall: gửi một nửa rồi im lặng.
    const half = Math.floor(zip.length / 2)
    res.write(zip.subarray(0, half))
    if (mode === 'slow') {
      const t = setTimeout(() => res.end(zip.subarray(half)), 5_000)
      res.on('close', () => clearTimeout(t))
    }
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(() => {
  server.close()
  rmSync(fixtures, { recursive: true, force: true })
})

let root: string
let states: SidecarState[]
let commands: { cmd: string; args: string[]; env: Record<string, string> }[]
let runImpl: (cmd: string, args: string[], signal: AbortSignal) => Promise<RunResult>

beforeEach(() => {
  mode = 'ok'
  root = join(mkdtempSync(join(tmpdir(), 'mmc-sidecar-')), 'sidecar')
  states = []
  commands = []
  // uv giả: tạo các thư mục/file mà bước thật sẽ tạo.
  runImpl = async (_cmd, args) => {
    if (args[0] === 'venv') {
      mkdirSync(join(args[1], 'Scripts'), { recursive: true })
      writeFileSync(join(args[1], 'Scripts', 'python.exe'), 'py')
    }
    if (args[0] === 'pip') mkdirSync(join(root, 'cache'), { recursive: true })
    if (args[0] === '--version') return { code: 0, stdout: 'Python 3.12.16\n', stderr: '' }
    return { code: 0, stdout: '', stderr: '' }
  }
})
afterEach(() => rmSync(dirname(root), { recursive: true, force: true }))

function make(overrides: Partial<InstallerDeps> = {}): SidecarInstaller {
  return new SidecarInstaller({
    root,
    requirementsFile: 'C:\\res\\requirements.txt',
    uvUrl: `${base}/uv.zip`,
    uvSha256: zipSha,
    fetch: (url, init) => fetch(url, init),
    run: (cmd, args, opts) => {
      commands.push({ cmd, args, env: opts.env })
      return runImpl(cmd, args, opts.signal)
    },
    extractZip,
    emit: (s) => states.push(s),
    log: { info: () => {}, warn: () => {} },
    ...overrides
  })
}

describe('SidecarInstaller', () => {
  it('cài đủ 3 bước, có tiến trình tải, kiểm tra hash, môi trường uv cô lập, xoá cache', async () => {
    const inst = make()
    const final = await inst.install()
    expect(final).toMatchObject({ state: 'installed', python: '3.12.16', uv: '0.13.7' })
    expect((final as { sizeBytes: number }).sizeBytes).toBeGreaterThan(0)

    const installing = states.filter((s) => s.state === 'installing') as Extract<SidecarState, { state: 'installing' }>[]
    expect(installing.map((s) => s.step)).toEqual(expect.arrayContaining(['uv', 'python', 'packages']))
    expect(installing.find((s) => s.step === 'uv' && s.received === zip.length)).toMatchObject({ total: zip.length, stepIndex: 1, stepCount: 3 })

    const uvCalls = commands.filter((c) => c.cmd.endsWith('uv.exe'))
    expect(uvCalls.map((c) => c.args.slice(0, 2))).toEqual([['python', 'install'], ['venv', expect.any(String)], ['pip', 'install']])
    expect(uvCalls[2].args).toContain('--require-hashes')
    expect(uvCalls[0].env).toMatchObject({ UV_NO_CONFIG: '1', UV_PYTHON_PREFERENCE: 'only-managed', UV_PYTHON_INSTALL_DIR: join(root, 'python') })
    expect(existsSync(join(root, 'uv', 'uv.exe'))).toBe(true)
    expect(existsSync(join(root, 'uv.zip'))).toBe(false)
    expect(existsSync(join(root, 'cache'))).toBe(false)
    expect(JSON.parse(readFileSync(join(root, 'installed.json'), 'utf8'))).toMatchObject({ python: '3.12.16' })

    // Mở lại app: đọc trạng thái từ đĩa.
    expect(await make().refresh()).toMatchObject({ state: 'installed', python: '3.12.16' })
  })

  it('hash không khớp → lỗi checksum, xoá sạch', async () => {
    const final = await make({ uvSha256: '0'.repeat(64) }).install()
    expect(final).toMatchObject({ state: 'error', code: 'checksum' })
    expect(existsSync(root)).toBe(false)
    expect(commands).toEqual([])
  })

  it('mất mạng (không kết nối được) → lỗi network rõ ràng, không treo', async () => {
    const final = await make({ uvUrl: 'http://127.0.0.1:9/uv.zip' }).install()
    expect(final).toMatchObject({ state: 'error', code: 'network', downloadMb: 50, diskMb: 120 })
    expect((final as { message: string }).message).toMatch(/Không tải được uv/)
    expect(existsSync(root)).toBe(false)
  })

  it('HTTP lỗi → network', async () => {
    mode = '404'
    expect(await make().install()).toMatchObject({ state: 'error', code: 'network', message: expect.stringContaining('404') })
  })

  it('tải bị treo quá lâu → network', async () => {
    mode = 'stall'
    const final = await make({ stallMs: 200 }).install()
    expect(final).toMatchObject({ state: 'error', code: 'network', message: expect.stringContaining('treo') })
    expect(existsSync(root)).toBe(false)
  })

  it('huỷ khi đang tải → về chưa cài, xoá sạch', async () => {
    mode = 'slow'
    const inst = make()
    const running = inst.install()
    await vi.waitFor(() => expect(inst.state).toMatchObject({ state: 'installing', step: 'uv' }))
    inst.cancel()
    expect(await running).toMatchObject({ state: 'not_installed' })
    expect(existsSync(root)).toBe(false)
  })

  it('huỷ khi uv đang tải Python → dừng tiến trình, về chưa cài', async () => {
    runImpl = (_cmd, args, signal) =>
      args[0] === 'python'
        ? new Promise((resolve) => signal.addEventListener('abort', () => resolve({ code: null, stdout: '', stderr: 'killed' })))
        : Promise.resolve({ code: 0, stdout: '', stderr: '' })
    const inst = make()
    const running = inst.install()
    await vi.waitFor(() => expect(inst.state).toMatchObject({ step: 'python' }))
    inst.cancel()
    expect(await running).toMatchObject({ state: 'not_installed' })
    expect(existsSync(root)).toBe(false)
  })

  it('uv lỗi: phân biệt lỗi mạng và lỗi khác', async () => {
    runImpl = async (_c, args) =>
      args[0] === 'python' ? { code: 2, stdout: '', stderr: 'error: Failed to download https://github.com/...: error sending request' } : { code: 0, stdout: '', stderr: '' }
    expect(await make().install()).toMatchObject({ state: 'error', code: 'network' })
    runImpl = async (_c, args) => (args[0] === 'pip' ? { code: 1, stdout: '', stderr: 'error: hash mismatch for pywinauto' } : { code: 0, stdout: '', stderr: '' })
    expect(await make().install()).toMatchObject({ state: 'error', code: 'failed', message: expect.stringContaining('hash mismatch') })
  })

  it('không cài hai lần cùng lúc', async () => {
    mode = 'slow'
    const inst = make()
    const running = inst.install()
    await expect(inst.install()).rejects.toMatchObject({ code: 'busy' })
    inst.cancel()
    await running
  })

  it('gỡ: dừng sidecar trước rồi xoá sạch thư mục', async () => {
    const inst = make()
    await inst.install()
    const order: string[] = []
    const final = await inst.uninstall(() => void order.push('stop'))
    expect(order).toEqual(['stop'])
    expect(final).toMatchObject({ state: 'not_installed' })
    expect(existsSync(root)).toBe(false)
    expect(states.some((s) => s.state === 'uninstalling')).toBe(true)
  })

  it('refresh: chưa cài / cài dở (thiếu file đánh dấu) → chưa cài', async () => {
    expect(await make().refresh()).toMatchObject({ state: 'not_installed' })
    mkdirSync(join(root, 'venv', 'Scripts'), { recursive: true })
    writeFileSync(join(root, 'venv', 'Scripts', 'python.exe'), 'py')
    expect(await make().refresh()).toMatchObject({ state: 'not_installed' })
  })

  it('isNetworkError', () => {
    expect(isNetworkError('TypeError: fetch failed')).toBe(true)
    expect(isNetworkError('getaddrinfo ENOTFOUND github.com')).toBe(true)
    expect(isNetworkError('hash mismatch')).toBe(false)
  })
})
