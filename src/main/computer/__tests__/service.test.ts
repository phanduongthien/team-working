import { describe, expect, it, vi } from 'vitest'
import type { ComputerStatus } from '@shared/computer'
import type { ComputerUseSettings } from '@shared/schemas'
import { AppToolRegistry } from '../../tools/registry'
import type { ActionEntry, ActionLog } from '../actionLog'
import { EMERGENCY_HOTKEY, type ShortcutPort } from '../killSwitch'
import type { DisplayInfo } from '../screen'
import { ComputerUseError, ComputerUseService } from '../service'

const PRIMARY: DisplayInfo = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1.5, primary: true }
const SECOND: DisplayInfo = { id: 2, bounds: { x: 1920, y: 0, width: 1280, height: 1024 }, scaleFactor: 1, primary: false }

function setup(opts: { settings?: ComputerUseSettings; hotkeyTaken?: boolean } = {}) {
  let settings: ComputerUseSettings = opts.settings ?? { enabled: false, warningAcceptedAt: null }
  const registered = new Map<string, () => void>()
  const shortcuts: ShortcutPort = {
    register: vi.fn((accel: string, cb: () => void) => {
      if (opts.hotkeyTaken) return false
      registered.set(accel, cb)
      return true
    }),
    unregister: vi.fn((accel: string) => void registered.delete(accel)),
    isRegistered: (accel: string) => registered.has(accel)
  }
  const entries: ActionEntry[] = []
  const actions = { record: vi.fn(async (e: ActionEntry) => void entries.push(e)) } as unknown as ActionLog
  const capture = { displays: () => [SECOND, PRIMARY], capture: vi.fn(async () => Buffer.from('PNG')) }
  const statuses: ComputerStatus[] = []
  const abortChats = vi.fn()
  const revokeToolSessions = vi.fn()
  const service = new ComputerUseService({
    getSettings: () => settings,
    setSettings: (s) => {
      settings = s
    },
    shortcuts,
    capture,
    actions,
    abortChats,
    revokeToolSessions,
    emit: (s) => statuses.push(s),
    log: { info: () => {}, warn: () => {} },
    now: () => 1_000
  })
  const registry = new AppToolRegistry()
  service.registerTools(registry)
  return {
    service,
    registry,
    capture,
    entries,
    statuses,
    abortChats,
    revokeToolSessions,
    pressHotkey: () => registered.get(EMERGENCY_HOTKEY)?.(),
    hotkeyRegistered: () => registered.has(EMERGENCY_HOTKEY),
    settings: () => settings
  }
}

const ctx = { conversationId: 'c1' }

describe('ComputerUseService — an toàn', () => {
  it('mặc định tắt: không đăng ký phím tắt, không có tool', () => {
    const t = setup()
    expect(t.hotkeyRegistered()).toBe(false)
    expect(t.service.status()).toMatchObject({ enabled: false, armed: false, screenAccess: false, mode: 'view' })
    expect(t.service.toolsFor()).toBeNull()
    expect(t.registry.available(ctx)).toEqual([])
  })

  it('lần đầu bật phải chấp nhận cảnh báo; bật xong thì phím dừng khẩn cấp được đăng ký', () => {
    const t = setup()
    expect(() => t.service.setEnabled(true)).toThrow(new ComputerUseError('warning_required'))
    expect(t.hotkeyRegistered()).toBe(false)
    const status = t.service.setEnabled(true, true)
    expect(status).toMatchObject({ enabled: true, warningAccepted: true, armed: true, hotkey: 'Control+Alt+Q' })
    expect(t.settings()).toEqual({ enabled: true, warningAcceptedAt: 1_000 })
    expect(t.hotkeyRegistered()).toBe(true)
  })

  it('phím dừng khẩn cấp bị app khác chiếm → KHÔNG bật được', () => {
    const t = setup({ hotkeyTaken: true })
    expect(() => t.service.setEnabled(true, true)).toThrow(new ComputerUseError('hotkey_unavailable'))
    expect(t.settings().enabled).toBe(false)
  })

  it('đã bật từ trước nhưng lúc mở app không đăng ký được phím → không có tool, không cho xem màn hình', () => {
    const t = setup({ settings: { enabled: true, warningAcceptedAt: 1 }, hotkeyTaken: true })
    expect(t.service.status()).toMatchObject({ enabled: true, armed: false })
    expect(() => t.service.setScreenAccess(true)).toThrow(new ComputerUseError('not_enabled'))
  })

  it('tool chỉ có khi đã bật + cho xem màn hình trong phiên', () => {
    const t = setup({ settings: { enabled: true, warningAcceptedAt: 1 } })
    expect(t.hotkeyRegistered()).toBe(true)
    expect(t.registry.available(ctx)).toEqual([])
    t.service.setScreenAccess(true)
    expect(t.registry.available(ctx)).toEqual(['list_displays', 'screenshot', 'list_app_logs', 'read_app_log'])
    expect(t.service.toolsFor()).toMatchObject({ names: ['list_displays', 'screenshot', 'list_app_logs', 'read_app_log'], context: expect.stringContaining('CHỈ XEM') })
  })

  it('phím tắt khẩn cấp: tắt quyền xem, huỷ chat, vô hiệu phiên tool, báo renderer', async () => {
    const t = setup({ settings: { enabled: true, warningAcceptedAt: 1 } })
    t.service.setScreenAccess(true)
    t.pressHotkey()
    expect(t.abortChats).toHaveBeenCalledOnce()
    expect(t.revokeToolSessions).toHaveBeenCalledOnce()
    expect(t.service.status()).toMatchObject({ screenAccess: false, lastStop: { at: 1_000, source: 'hotkey' } })
    expect(t.statuses.at(-1)?.lastStop?.source).toBe('hotkey')
    expect(t.registry.available(ctx)).toEqual([])
    expect((await t.registry.call('screenshot', {}, ctx)).isError).toBe(true)
    expect(t.capture.capture).not.toHaveBeenCalled()
  })

  it('nút dừng trong app cũng dừng như phím tắt', () => {
    const t = setup({ settings: { enabled: true, warningAcceptedAt: 1 } })
    t.service.setScreenAccess(true)
    t.service.killSwitch.trigger()
    expect(t.abortChats).toHaveBeenCalledOnce()
    expect(t.service.status().lastStop?.source).toBe('button')
  })

  it('tắt tính năng → gỡ phím tắt và tắt quyền xem', () => {
    const t = setup({ settings: { enabled: true, warningAcceptedAt: 1 } })
    t.service.setScreenAccess(true)
    t.service.setEnabled(false)
    expect(t.hotkeyRegistered()).toBe(false)
    expect(t.service.status()).toMatchObject({ enabled: false, screenAccess: false, armed: false })
    // Bật lại không cần cảnh báo nữa (đã chấp nhận).
    expect(t.service.setEnabled(true).enabled).toBe(true)
  })
})

describe('ComputerUseService — tool chụp màn hình', () => {
  const ready = () => {
    const t = setup({ settings: { enabled: true, warningAcceptedAt: 1 } })
    t.service.setScreenAccess(true)
    return t
  }

  it('màn hình 1 là màn hình chính; trả ảnh + mô tả toạ độ; ghi log kèm ảnh', async () => {
    const t = ready()
    const result = await t.registry.call('screenshot', {}, ctx)
    expect(result.isError).toBeUndefined()
    expect(result.content[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Màn hình 1/2 (chính)') })
    expect(result.content[1]).toEqual({ type: 'image', data: Buffer.from('PNG').toString('base64'), mimeType: 'image/png' })
    expect(t.capture.capture).toHaveBeenCalledWith(PRIMARY, expect.objectContaining({ output: { width: 1280, height: 720 } }))
    expect(t.entries).toEqual([
      expect.objectContaining({ conversationId: 'c1', tool: 'screenshot', ok: true, image: Buffer.from('PNG') })
    ])
  })

  it('chọn màn hình 2 và vùng phóng to', async () => {
    const t = ready()
    await t.registry.call('screenshot', { display: 2, region: { x: 10, y: 20, width: 300, height: 200 } }, ctx)
    expect(t.capture.capture).toHaveBeenCalledWith(
      SECOND,
      expect.objectContaining({ crop: { x: 10, y: 20, width: 300, height: 200 }, output: { width: 300, height: 200 } })
    )
  })

  it('màn hình không tồn tại / tham số sai → lỗi, không chụp', async () => {
    const t = ready()
    expect((await t.registry.call('screenshot', { display: 5 }, ctx)).isError).toBe(true)
    expect((await t.registry.call('screenshot', { max_width: 99999 }, ctx)).isError).toBe(true)
    expect(t.capture.capture).not.toHaveBeenCalled()
  })

  it('bị dừng khẩn cấp trong lúc đang chụp → không gửi ảnh đi', async () => {
    const t = ready()
    t.capture.capture.mockImplementationOnce(async () => {
      t.pressHotkey()
      return Buffer.from('PNG')
    })
    const result = await t.registry.call('screenshot', {}, ctx)
    expect(result.isError).toBe(true)
    expect(result.content.some((c) => c.type === 'image')).toBe(false)
  })

  it('list_displays liệt kê theo thứ tự: chính trước', async () => {
    const t = ready()
    const result = await t.registry.call('list_displays', {}, ctx)
    expect(result.content[0]).toMatchObject({ text: expect.stringMatching(/^1\. 1920x1080.*màn hình chính\n2\. 1280x1024/) })
  })
})
