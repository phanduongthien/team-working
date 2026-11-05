import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import type { SidecarState } from '@shared/sidecar'
import { pythonCommand, SidecarClient } from '../client'
import { SidecarInstaller } from '../installer'
import { extractZip, runProcess } from '../process'

// Cài THẬT (tải ~50 MB từ GitHub/PyPI) vào thư mục tạm rồi gọi desktop_server.py thật.
// Chỉ chạy khi đặt E2E_SIDECAR=1 — không chạy trong CI mặc định.
const REAL = process.env.E2E_SIDECAR === '1'
const RESOURCES = join(__dirname, '..', '..', '..', '..', 'resources', 'sidecar')

describe.skipIf(!REAL)('Python sidecar — cài và chạy thật', () => {
  const root = join(mkdtempSync(join(tmpdir(), 'mmc-sidecar-real-')), 'sidecar')
  const states: SidecarState[] = []
  const installer = new SidecarInstaller({
    root,
    requirementsFile: join(RESOURCES, 'requirements.txt'),
    fetch: (url, init) => fetch(url, init),
    run: runProcess,
    extractZip,
    emit: (s) => states.push(s),
    log: { info: () => {}, warn: (m) => console.warn(m) }
  })
  const client = new SidecarClient({
    command: () => pythonCommand(installer.paths.venvPython, join(RESOURCES, 'desktop_server.py')),
    log: { warn: (m) => console.warn(m) }
  })
  afterAll(() => {
    client.stop()
    rmSync(join(root, '..'), { recursive: true, force: true })
  })

  it('cài đủ 3 bước với hash khoá cứng', { timeout: 10 * 60_000 }, async () => {
    const final = await installer.install()
    if (final.state === 'error') console.error(final)
    expect(final).toMatchObject({ state: 'installed', uv: '0.13.7', python: expect.stringMatching(/^3\.12\./) })
    const steps = states.filter((s) => s.state === 'installing').map((s) => (s as { step: string }).step)
    expect(new Set(steps)).toEqual(new Set(['uv', 'python', 'packages']))
    expect(existsSync(join(root, 'cache'))).toBe(false)
    const mb = (final as { sizeBytes: number }).sizeBytes / 1024 / 1024
    console.log(`Sidecar chiếm ${mb.toFixed(0)} MB`)
    expect(mb).toBeLessThan(200)
  })

  it('desktop_server.py: ping, list_windows, ui_tree; không có hàm thao tác', { timeout: 60_000 }, async () => {
    expect(await client.call('ping')).toMatchObject({ protocol: 1, python: expect.stringMatching(/^3\.12\./) })
    const windows = await client.call<{ handle: number; process: string }[]>('list_windows')
    expect(windows.length).toBeGreaterThan(0)
    const tree = await client.call<{ nodes: unknown[] }>('ui_tree', { handle: windows[0].handle, max_depth: 2, max_nodes: 50 })
    expect(tree.nodes.length).toBeGreaterThan(0)
    await expect(client.call('click', {})).rejects.toThrow('unknown_method')
  })

  it('gỡ sạch', async () => {
    client.stop()
    expect(await installer.uninstall(() => client.stop())).toMatchObject({ state: 'not_installed' })
    expect(existsSync(root)).toBe(false)
  })
})
