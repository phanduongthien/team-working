import type { TelegramAccount, TelegramChatKind } from '@shared/connectors'

export type RawDialog = {
  id: string
  title: string
  username: string | null
  kind: TelegramChatKind
  unread: number
  /** epoch ms của tin cuối. */
  lastAt: number | null
}

export type RawTgMessage = {
  id: number
  /** epoch ms */
  date: number
  sender: string
  out: boolean
  text: string
  /** Loại đính kèm (ảnh, file…) — không tải nội dung. */
  media: string | null
}

/** Lỗi Telegram bắt phải chờ (FLOOD_WAIT). */
export class TelegramFloodWait extends Error {
  constructor(readonly seconds: number) {
    super(`flood_wait_${seconds}`)
  }
}

/** Phần Telegram mà service cần — GramJS ở app thật, bản giả cho test e2e. */
export interface TelegramBackend {
  /** Bắt đầu đăng nhập: Telegram gửi mã tới app Telegram / SMS. */
  sendCode(phone: string): Promise<void>
  /** 'password_needed' = tài khoản bật xác minh 2 bước. */
  signIn(code: string): Promise<'ok' | 'password_needed'>
  checkPassword(password: string): Promise<void>
  /** Kết nối lại bằng session đã lưu; false = không có / hết hiệu lực. */
  restore(): Promise<boolean>
  me(): Promise<TelegramAccount>
  dialogs(limit: number): Promise<RawDialog[]>
  messages(chatId: string, limit: number): Promise<RawTgMessage[]>
  /** Lưu bản nháp vào ô soạn tin của chat (không gửi). */
  saveDraft(chatId: string, text: string): Promise<void>
  /** Đăng xuất phía Telegram (huỷ phiên) + xoá session trên máy. */
  logout(): Promise<void>
  /** Huỷ lượt đăng nhập đang dở. */
  cancelLogin(): Promise<void>
  hasSession(): boolean
}
