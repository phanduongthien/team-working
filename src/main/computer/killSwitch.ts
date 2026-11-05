/** Phần của Electron `globalShortcut` mà ta cần — tách ra để test được. */
export type ShortcutPort = {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
  isRegistered(accelerator: string): boolean
}

/** Phím dừng khẩn cấp toàn hệ thống (kể cả khi app không được focus). */
export const EMERGENCY_HOTKEY = 'Control+Alt+Q'

/**
 * Dừng khẩn cấp: phím tắt toàn cục + nút trong app cùng gọi `onStop`.
 * Điều khiển máy tính CHỈ được bật khi phím tắt đăng ký thành công (`armed`) — nếu app khác đã
 * chiếm phím, tính năng không chạy chứ không chạy mà thiếu phanh.
 */
export class KillSwitch {
  private isArmed = false

  constructor(
    private readonly shortcuts: ShortcutPort,
    private readonly onStop: (source: 'hotkey' | 'button') => void
  ) {}

  get armed(): boolean {
    return this.isArmed && this.shortcuts.isRegistered(EMERGENCY_HOTKEY)
  }

  /** Đăng ký phím tắt; trả false nếu không đăng ký được (app khác đang dùng). */
  arm(): boolean {
    if (this.armed) return true
    this.isArmed = this.shortcuts.register(EMERGENCY_HOTKEY, () => this.onStop('hotkey'))
    return this.isArmed
  }

  disarm(): void {
    if (this.isArmed) this.shortcuts.unregister(EMERGENCY_HOTKEY)
    this.isArmed = false
  }

  /** Nút "Dừng khẩn cấp" trong app. */
  trigger(): void {
    this.onStop('button')
  }
}
