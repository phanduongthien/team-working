import type { UpdateSettings } from '@shared/schemas'
import type { UpdateState, UpdateSummary } from '@shared/update'
import { shouldPrompt, summarize, type RawUpdateInfo } from './policy'

/** Phần của electron-updater mà controller cần — tách ra để test bằng bản giả. */
export type UpdaterPort = {
  setAllowPrerelease(allow: boolean): void
  check(): Promise<{ available: boolean; info: RawUpdateInfo } | null>
  download(): Promise<void>
  /** Thoát app, chạy installer (im lặng) rồi mở lại app. */
  install(): void
  onProgress(listener: (p: { percent: number; transferred: number; total: number }) => void): void
}

export type UpdateControllerDeps = {
  /** null = bản không hỗ trợ tự cập nhật (dev, build cục bộ không có cấu hình publish). */
  updater: UpdaterPort | null
  getSettings(): UpdateSettings
  getSkipped(): string | null
  setSkipped(version: string): void
  emit(state: UpdateState): void
  /** Dừng việc đang chạy (chat…) để không mất dữ liệu trước khi thoát cài đặt. */
  beforeInstall(): Promise<void>
  log: { info(msg: string): void; warn(msg: string): void }
  intervalMs?: number
}

/** Mặc định kiểm tra mỗi 2 giờ (feed .atom của GitHub, không tính vào giới hạn REST API). */
export const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000
const PROGRESS_EMIT_MS = 250

/**
 * Luồng: kiểm tra → (hỏi) → tải nền có tiến trình → hỏi khởi động lại → cài.
 * Không tự tải khi chưa được người dùng đồng ý.
 */
export class UpdateController {
  private state: UpdateState
  /** "Để sau" trong phiên này — nhắc lại ở lần mở app tiếp theo. */
  private postponed = new Set<string>()
  private timer: ReturnType<typeof setInterval> | null = null
  private lastProgressEmit = 0

  constructor(private readonly deps: UpdateControllerDeps) {
    this.state = deps.updater ? { state: 'idle' } : { state: 'unsupported' }
    deps.updater?.onProgress((p) => this.onProgress(p))
  }

  getState(): UpdateState {
    return this.state
  }

  start(): void {
    if (!this.deps.updater) return
    this.applySettings()
    if (this.deps.getSettings().autoCheck) void this.check(false)
    this.timer = setInterval(() => {
      if (this.deps.getSettings().autoCheck) void this.check(false)
    }, this.deps.intervalMs ?? CHECK_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /** Gọi sau khi người dùng đổi cài đặt cập nhật. */
  settingsChanged(previous: UpdateSettings): void {
    if (!this.deps.updater) return
    const next = this.deps.getSettings()
    this.applySettings()
    const turnedOn = next.autoCheck && !previous.autoCheck
    if (turnedOn || (next.autoCheck && next.channel !== previous.channel)) void this.check(false)
  }

  async check(manual: boolean): Promise<void> {
    const { updater } = this.deps
    if (!updater) return this.set({ state: 'unsupported' })
    const s = this.state
    if (s.state === 'checking' || s.state === 'downloading') return
    if (s.state === 'downloaded') {
      // Đã tải xong: nhắc lại (bản bắt buộc nhắc mỗi lần kiểm tra; bản thường chỉ khi người dùng bấm).
      if (manual || s.info.critical) this.set({ ...s, prompt: true })
      return
    }
    // Kiểm tra nền không đổi giao diện (tránh banner/hộp thoại nháy); chỉ hiện "đang kiểm tra" khi người dùng bấm.
    if (manual) this.set({ state: 'checking', manual })

    try {
      const result = await updater.check()
      if (!result?.available) {
        this.set({ state: 'none', manual })
        return
      }
      const info = summarize(result.info)
      const prompt = shouldPrompt({
        version: info.version,
        critical: info.critical,
        manual,
        skippedVersion: this.deps.getSkipped(),
        postponed: this.postponed
      })
      this.set({ state: 'available', info, prompt })
    } catch (err) {
      const message = (err as Error).message
      this.deps.log.warn(`Không kiểm tra được bản mới: ${message}`)
      // Lỗi nền (mất mạng…) giữ nguyên trạng thái trước; chỉ báo lỗi khi người dùng tự bấm.
      if (manual) this.set({ state: 'error', message, manual })
      else if (this.state.state === 'checking') this.set({ state: 'idle' })
    }
  }

  async download(): Promise<void> {
    const { updater } = this.deps
    const info = this.currentInfo()
    if (!updater || !info || this.state.state === 'downloading' || this.state.state === 'downloaded') return
    this.set({ state: 'downloading', info, percent: 0, transferred: 0, total: 0 })
    try {
      await updater.download()
      this.deps.log.info(`Đã tải bản ${info.version}`)
      this.set({ state: 'downloaded', info, prompt: true })
    } catch (err) {
      const message = (err as Error).message
      this.deps.log.warn(`Tải bản cập nhật lỗi: ${message}`)
      this.set({ state: 'error', message, info, manual: true })
    }
  }

  /** "Để sau": ẩn hộp thoại. Bản thường không nhắc lại trong phiên này; bản bắt buộc nhắc ở lần kiểm tra sau. */
  postpone(): void {
    const s = this.state
    if (s.state !== 'available' && s.state !== 'downloaded') return
    if (!s.info.critical) this.postponed.add(s.info.version)
    this.set({ ...s, prompt: false })
  }

  /** "Bỏ qua phiên bản này" — không áp dụng cho bản bắt buộc. */
  skip(): void {
    const s = this.state
    if (s.state !== 'available' || s.info.critical) return
    this.deps.setSkipped(s.info.version)
    this.set({ ...s, prompt: false })
  }

  async install(): Promise<void> {
    if (this.state.state !== 'downloaded' || !this.deps.updater) return
    this.deps.log.info(`Khởi động lại để cài bản ${this.state.info.version}`)
    await this.deps.beforeInstall()
    this.deps.updater.install()
  }

  private applySettings(): void {
    this.deps.updater?.setAllowPrerelease(this.deps.getSettings().channel === 'beta')
  }

  private currentInfo(): UpdateSummary | null {
    const s = this.state
    if (s.state === 'available' || (s.state === 'error' && s.info)) return s.info ?? null
    return null
  }

  private onProgress(p: { percent: number; transferred: number; total: number }): void {
    const s = this.state
    if (s.state !== 'downloading') return
    const now = Date.now()
    const finished = p.percent >= 100
    // Cập nhật nội bộ mỗi lần, nhưng chỉ gửi sang renderer vài lần mỗi giây.
    this.state = { ...s, percent: Math.min(100, Math.max(0, p.percent)), transferred: p.transferred, total: p.total }
    if (finished || now - this.lastProgressEmit >= PROGRESS_EMIT_MS) {
      this.lastProgressEmit = now
      this.deps.emit(this.state)
    }
  }

  private set(state: UpdateState): void {
    this.state = state
    this.deps.emit(state)
  }
}
