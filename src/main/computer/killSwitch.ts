/** Phần của Electron `globalShortcut` mà ta cần — tách ra để test được. */
export type ShortcutPort = {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
  isRegistered(accelerator: string): boolean
}

/** Phím dừng khẩn cấp toàn hệ thống (kể cả khi app không được focus). */
export const EMERGENCY_HOTKEY = 'Control+Alt+Q'

export type StopSource = 'hotkey' | 'button'

/**
 * Dừng khẩn cấp dùng chung cho cả app: phím tắt toàn cục + nút trong app. Mỗi tính năng nguy hiểm
 * (điều khiển máy tính, kết nối agent) "giữ" phím khi được bật (`arm(holder)`); phím chỉ được gỡ khi
 * không còn tính năng nào giữ. Nhấn phím → gọi MỌI listener (dừng tất cả cùng lúc).
 *
 * Tính năng chỉ được bật khi phím đăng ký thành công — nếu app khác đã chiếm phím, tính năng không
 * chạy chứ không chạy mà thiếu phanh.
 */
export class KillSwitch {
  private holders = new Set<string>()
  private listeners = new Set<(source: StopSource) => void>()
  private registered = false

  constructor(
    private readonly shortcuts: ShortcutPort,
    onStop?: (source: StopSource) => void
  ) {
    if (onStop) this.listeners.add(onStop)
  }

  /** Phím đang hoạt động (có ít nhất một tính năng giữ và Windows vẫn giữ đăng ký). */
  get armed(): boolean {
    return this.registered && this.holders.size > 0 && this.shortcuts.isRegistered(EMERGENCY_HOTKEY)
  }

  isHeldBy(holder: string): boolean {
    return this.holders.has(holder) && this.armed
  }

  onStop(listener: (source: StopSource) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Tính năng `holder` cần phím dừng; trả false nếu không đăng ký được (app khác đang dùng). */
  arm(holder = 'default'): boolean {
    if (!this.registered || !this.shortcuts.isRegistered(EMERGENCY_HOTKEY)) {
      this.registered = this.shortcuts.register(EMERGENCY_HOTKEY, () => this.fire('hotkey'))
    }
    if (!this.registered) return false
    this.holders.add(holder)
    return true
  }

  disarm(holder = 'default'): void {
    this.holders.delete(holder)
    if (this.holders.size === 0 && this.registered) {
      this.shortcuts.unregister(EMERGENCY_HOTKEY)
      this.registered = false
    }
  }

  /** Nút "Dừng khẩn cấp" trong app. */
  trigger(): void {
    this.fire('button')
  }

  private fire(source: StopSource): void {
    for (const listener of [...this.listeners]) listener(source)
  }
}
