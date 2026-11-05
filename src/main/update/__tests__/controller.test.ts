import { afterEach, describe, expect, it, vi } from 'vitest'
import type { UpdateSettings } from '@shared/schemas'
import type { UpdateState } from '@shared/update'
import { UpdateController, type UpdaterPort } from '../controller'
import type { RawUpdateInfo } from '../policy'

const NORMAL: RawUpdateInfo = { version: '0.4.0', releaseName: 'MMC studio 0.4.0', releaseNotes: '<p>Mới</p>' }
const CRITICAL: RawUpdateInfo = { version: '0.4.0', releaseName: 'MMC studio 0.4.0 [critical]' }

function setup(opts: { info?: RawUpdateInfo | null; settings?: UpdateSettings; skipped?: string | null } = {}) {
  let progress: ((p: { percent: number; transferred: number; total: number }) => void) | null = null
  let downloadDone: { resolve(): void; reject(err: Error): void } | null = null
  const info = opts.info === undefined ? NORMAL : opts.info
  const updater = {
    setAllowPrerelease: vi.fn(),
    check: vi.fn(async () => (info ? { available: true, info } : { available: false, info: { version: '0.3.0' } })),
    download: vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          downloadDone = { resolve, reject }
        })
    ),
    install: vi.fn(),
    onProgress: (l: typeof progress) => {
      progress = l
    }
  } satisfies UpdaterPort
  let settings = opts.settings ?? { autoCheck: true, channel: 'stable' }
  let skipped = opts.skipped ?? null
  const states: UpdateState[] = []
  const beforeInstall = vi.fn(async () => {})
  const controller = new UpdateController({
    updater,
    getSettings: () => settings,
    getSkipped: () => skipped,
    setSkipped: (v) => {
      skipped = v
    },
    emit: (s) => states.push(s),
    beforeInstall,
    log: { info: () => {}, warn: () => {} },
    intervalMs: 1_000
  })
  return {
    controller,
    updater,
    states,
    beforeInstall,
    progress: (p: number) => progress?.({ percent: p, transferred: p, total: 100 }),
    finishDownload: () => downloadDone?.resolve(),
    failDownload: () => downloadDone?.reject(new Error('net::ERR')),
    setSettings: (s: UpdateSettings) => {
      settings = s
    },
    skipped: () => skipped
  }
}

afterEach(() => vi.useRealTimers())

describe('UpdateController', () => {
  it('không có updater (bản dev) → unsupported', async () => {
    const c = new UpdateController({
      updater: null,
      getSettings: () => ({ autoCheck: true, channel: 'stable' }),
      getSkipped: () => null,
      setSkipped: () => {},
      emit: () => {},
      beforeInstall: async () => {},
      log: { info: () => {}, warn: () => {} }
    })
    await c.check(true)
    expect(c.getState()).toEqual({ state: 'unsupported' })
  })

  it('có bản mới → hiện hộp thoại, KHÔNG tự tải', async () => {
    const t = setup()
    await t.controller.check(false)
    expect(t.controller.getState()).toMatchObject({ state: 'available', prompt: true, info: { version: '0.4.0', critical: false } })
    expect(t.updater.download).not.toHaveBeenCalled()
  })

  it('kiểm tra nền không phát trạng thái "checking"; bấm tay thì có', async () => {
    const t = setup()
    await t.controller.check(false)
    expect(t.states.map((s) => s.state)).toEqual(['available'])
    const t2 = setup({ info: null })
    await t2.controller.check(true)
    expect(t2.states.map((s) => s.state)).toEqual(['checking', 'none'])
  })

  it('Để sau → ẩn; kiểm tra nền lần sau trong phiên không hiện lại; bấm tay thì hiện', async () => {
    const t = setup()
    await t.controller.check(false)
    t.controller.postpone()
    expect(t.controller.getState()).toMatchObject({ state: 'available', prompt: false })
    await t.controller.check(false)
    expect(t.controller.getState()).toMatchObject({ prompt: false })
    await t.controller.check(true)
    expect(t.controller.getState()).toMatchObject({ prompt: true })
  })

  it('Bỏ qua → lưu phiên bản, không nhắc nữa', async () => {
    const t = setup()
    await t.controller.check(false)
    t.controller.skip()
    expect(t.skipped()).toBe('0.4.0')
    await t.controller.check(false)
    expect(t.controller.getState()).toMatchObject({ state: 'available', prompt: false })
  })

  it('bản [critical]: không bỏ qua được, Để sau chỉ tới lần kiểm tra kế tiếp', async () => {
    const t = setup({ info: CRITICAL, skipped: '0.4.0' })
    await t.controller.check(false)
    expect(t.controller.getState()).toMatchObject({ state: 'available', prompt: true, info: { critical: true, title: 'MMC studio 0.4.0' } })
    t.controller.skip()
    expect(t.skipped()).toBe('0.4.0') // giữ nguyên giá trị cũ, skip() không có tác dụng
    expect(t.controller.getState()).toMatchObject({ prompt: true })
    t.controller.postpone()
    expect(t.controller.getState()).toMatchObject({ prompt: false })
    await t.controller.check(false)
    expect(t.controller.getState()).toMatchObject({ prompt: true })
  })

  it('tải: có tiến trình, xong thì hỏi khởi động lại; cài thì dừng việc đang chạy trước', async () => {
    const t = setup()
    await t.controller.check(false)
    const done = t.controller.download()
    expect(t.controller.getState()).toMatchObject({ state: 'downloading', percent: 0 })
    t.progress(42)
    expect(t.controller.getState()).toMatchObject({ state: 'downloading', percent: 42 })
    t.finishDownload()
    await done
    expect(t.controller.getState()).toMatchObject({ state: 'downloaded', prompt: true })
    await t.controller.install()
    expect(t.beforeInstall).toHaveBeenCalledOnce()
    expect(t.updater.install).toHaveBeenCalledOnce()
    expect(t.beforeInstall.mock.invocationCallOrder[0]).toBeLessThan(t.updater.install.mock.invocationCallOrder[0])
  })

  it('tải lỗi → báo lỗi, bấm lại thì tải lại được', async () => {
    const t = setup()
    await t.controller.check(false)
    const first = t.controller.download()
    t.failDownload()
    await first
    expect(t.controller.getState()).toMatchObject({ state: 'error', info: { version: '0.4.0' } })
    void t.controller.download()
    expect(t.updater.download).toHaveBeenCalledTimes(2)
  })

  it('không cài khi chưa tải xong; không tải hai lần song song', async () => {
    const t = setup()
    await t.controller.install()
    expect(t.updater.install).not.toHaveBeenCalled()
    await t.controller.check(false)
    void t.controller.download()
    void t.controller.download()
    expect(t.updater.download).toHaveBeenCalledOnce()
  })

  it('lỗi mạng khi kiểm tra nền → im lặng; khi bấm tay → báo lỗi', async () => {
    const t = setup()
    t.updater.check.mockRejectedValue(new Error('offline'))
    await t.controller.check(false)
    expect(t.states).toEqual([])
    await t.controller.check(true)
    expect(t.controller.getState()).toMatchObject({ state: 'error', message: 'offline', manual: true })
  })

  it('kênh beta bật allowPrerelease; tắt tự kiểm tra thì không kiểm tra định kỳ', async () => {
    vi.useFakeTimers()
    const t = setup({ settings: { autoCheck: false, channel: 'beta' } })
    t.controller.start()
    expect(t.updater.setAllowPrerelease).toHaveBeenLastCalledWith(true)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(t.updater.check).not.toHaveBeenCalled()
    t.setSettings({ autoCheck: true, channel: 'stable' })
    t.controller.settingsChanged({ autoCheck: false, channel: 'beta' })
    expect(t.updater.setAllowPrerelease).toHaveBeenLastCalledWith(false)
    expect(t.updater.check).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(t.updater.check).toHaveBeenCalledTimes(2)
    t.controller.stop()
  })
})
