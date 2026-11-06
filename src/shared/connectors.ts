import { z } from 'zod'

// ---- Kết nối Gmail / Telegram (GĐ 4) — CHỈ ĐỌC + SOẠN NHÁP, mặc định tắt ----

/** Google OAuth ở chế độ Testing: refresh token hết hạn sau 7 ngày. */
export const GMAIL_TESTING_TOKEN_DAYS = 7
export const DAY_MS = 24 * 60 * 60 * 1000

const chatIds = z.array(z.string().min(1).max(40)).max(500)

export const gmailSettingsSchema = z.object({
  enabled: z.boolean(),
  /** OAuth client (loại Desktop app) người dùng tự tạo trên Google Cloud. Secret nằm ở DPAPI. */
  clientId: z.string().max(200).nullable(),
  /** App OAuth đang ở chế độ Testing → refresh token hết hạn sau 7 ngày. */
  testingMode: z.boolean(),
  email: z.string().max(200).nullable(),
  connectedAt: z.number().int().nullable(),
  /** Ẩn thư mã xác minh / đặt lại mật khẩu / ngân hàng khỏi trợ lý. */
  skipSensitive: z.boolean(),
  /** Người gửi bị chặn: địa chỉ đầy đủ hoặc tên miền (vd `bank.com`). */
  blockedSenders: z.array(z.string().min(1).max(200)).max(200)
})
export type GmailSettings = z.infer<typeof gmailSettingsSchema>
export const DEFAULT_GMAIL_SETTINGS: GmailSettings = {
  enabled: false,
  clientId: null,
  testingMode: true,
  email: null,
  connectedAt: null,
  skipSensitive: true,
  blockedSenders: []
}

export const TELEGRAM_MODES = ['allowlist', 'blocklist'] as const
export type TelegramMode = (typeof TELEGRAM_MODES)[number]

export const telegramAccountSchema = z.object({
  name: z.string().max(200),
  username: z.string().max(100).nullable(),
  /** Số điện thoại đã che (chỉ để người dùng nhận ra tài khoản). */
  phone: z.string().max(40).nullable()
})
export type TelegramAccount = z.infer<typeof telegramAccountSchema>

export const telegramSettingsSchema = z.object({
  enabled: z.boolean(),
  /** api_id từ my.telegram.org (api_hash nằm ở DPAPI). */
  apiId: z.number().int().positive().nullable(),
  /** allowlist: chỉ đọc chat đã chọn. blocklist: đọc mọi chat trừ chat bị chặn và chat nhạy cảm. */
  mode: z.enum(TELEGRAM_MODES),
  allow: chatIds,
  block: chatIds,
  account: telegramAccountSchema.nullable(),
  connectedAt: z.number().int().nullable()
})
export type TelegramSettings = z.infer<typeof telegramSettingsSchema>
export const DEFAULT_TELEGRAM_SETTINGS: TelegramSettings = {
  enabled: false,
  apiId: null,
  mode: 'allowlist',
  allow: [],
  block: [],
  account: null,
  connectedAt: null
}

export type GmailConnection = 'disconnected' | 'connecting' | 'connected' | 'expired'

export type GmailStatus = {
  enabled: boolean
  /** Đã nhập client ID + secret. */
  configured: boolean
  connection: GmailConnection
  email: string | null
  connectedAt: number | null
  /** Thời điểm (ước tính) phải đăng nhập lại — chỉ khi testingMode. */
  expiresAt: number | null
  testingMode: boolean
  skipSensitive: boolean
  blockedSenders: string[]
  clientId: string | null
}

export type TelegramConnection = 'disconnected' | 'code_sent' | 'password_needed' | 'connected'

export type TelegramStatus = {
  enabled: boolean
  /** Đã nhập api_id + api_hash. */
  configured: boolean
  connection: TelegramConnection
  account: TelegramAccount | null
  connectedAt: number | null
  mode: TelegramMode
  allow: string[]
  block: string[]
  apiId: number | null
}

export type TelegramChatKind = 'user' | 'bot' | 'group' | 'channel'

/** Một cuộc trò chuyện Telegram như trang cài đặt nhìn thấy (không có nội dung tin nhắn). */
export type TelegramChatInfo = {
  id: string
  title: string
  kind: TelegramChatKind
  unread: number
  lastAt: number | null
  /** Chat nhạy cảm (mã đăng nhập, ngân hàng, ví…) — chế độ blocklist tự bỏ qua. */
  sensitive: boolean
  /** Luôn chặn (tin nhắn hệ thống Telegram chứa mã đăng nhập). */
  locked: boolean
  /** Trợ lý có được đọc chat này không (theo chế độ + danh sách hiện tại). */
  allowed: boolean
}

export type GmailPreviewItem = { from: string; subject: string; date: string; hidden: boolean }

/** Trợ lý muốn tạo bản nháp — người dùng xem / sửa rồi mới tạo. Không bao giờ gửi. */
export type DraftApprovalRequest = {
  id: string
  service: 'gmail' | 'telegram'
  /** Người nhận (Gmail) hoặc tên chat (Telegram). */
  target: string
  subject: string | null
  body: string
  /** Trả lời thư nào (tiêu đề thư gốc). */
  replyTo: string | null
}

// ---- schema IPC ----

export const gmailSetEnabledSchema = z.boolean()
export const gmailCredentialsSchema = z.object({
  clientId: z
    .string()
    .trim()
    .max(200)
    .regex(/^[\w.-]+\.apps\.googleusercontent\.com$/, 'client_id_invalid'),
  /** Bỏ trống = giữ secret đã lưu. */
  clientSecret: z.string().trim().max(200).optional()
})
export const gmailOptionsSchema = z.object({
  testingMode: z.boolean(),
  skipSensitive: z.boolean(),
  blockedSenders: z.array(z.string().trim().toLowerCase().min(1).max(200)).max(200)
})

export const telegramCredentialsSchema = z.object({
  apiId: z.number().int().positive().max(2_147_483_647),
  /** Bỏ trống = giữ api_hash đã lưu. */
  apiHash: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{32}$/i, 'api_hash_invalid')
    .optional()
})
export const telegramPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ]{6,20}$/, 'phone_invalid')
export const telegramCodeSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{4,8}$/, 'code_invalid')
export const telegramPasswordSchema = z.string().min(1).max(256)
export const telegramListsSchema = z.object({
  mode: z.enum(TELEGRAM_MODES),
  allow: chatIds,
  block: chatIds
})

export const draftDecisionSchema = z.object({
  id: z.string().min(1).max(100),
  approve: z.boolean(),
  /** Nội dung người dùng đã sửa. */
  body: z.string().max(20_000).optional()
})
export type DraftDecision = z.infer<typeof draftDecisionSchema>
