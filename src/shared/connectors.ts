import { z } from 'zod'

// ---- Kết nối Gmail / Telegram (GĐ 4) — CHỈ ĐỌC + SOẠN NHÁP, mặc định tắt ----

/** Google OAuth ở chế độ Testing: refresh token hết hạn sau 7 ngày. */
export const GMAIL_TESTING_TOKEN_DAYS = 7
export const DAY_MS = 24 * 60 * 60 * 1000

const chatIds = z.array(z.string().min(1).max(40)).max(500)

/** id nội bộ của một tài khoản Gmail trong app (tên file token, khoá giới hạn tần suất). */
export const GMAIL_ACCOUNT_ID = /^[a-z0-9]{4,16}$/
/** Tài khoản chuyển từ bản một-tài-khoản: giữ nguyên file token cũ `gmail-refresh-token.bin`. */
export const GMAIL_LEGACY_ACCOUNT_ID = 'primary'
/** Tên gọi hiện trong hướng dẫn cho trợ lý → không cho ký tự điều khiển / ngoặc kép. */
const accountLabel = z
  .string()
  .trim()
  .min(1, 'label_invalid')
  .max(40, 'label_invalid')
  .regex(/^[^\p{Cc}"<>]+$/u, 'label_invalid')
const blockedSenders = z.array(z.string().min(1).max(200)).max(200)

export const gmailAccountSchema = z.object({
  id: z.string().regex(GMAIL_ACCOUNT_ID),
  email: z.string().max(200),
  /** Tên gọi do người dùng đặt ("Cá nhân", "Trường"…). */
  label: z.string().max(40),
  /** Trợ lý được đọc tài khoản này. */
  enabled: z.boolean(),
  connectedAt: z.number().int().nullable(),
  /** Ẩn thư mã xác minh / đặt lại mật khẩu / ngân hàng khỏi trợ lý. */
  skipSensitive: z.boolean(),
  /** Người gửi bị chặn: địa chỉ đầy đủ hoặc tên miền (vd `bank.com`). */
  blockedSenders
})
export type GmailAccount = z.infer<typeof gmailAccountSchema>

const gmailSettingsV2 = z.object({
  enabled: z.boolean(),
  /** OAuth client (loại Desktop app) người dùng tự tạo trên Google Cloud — dùng chung mọi tài khoản. Secret nằm ở DPAPI. */
  clientId: z.string().max(200).nullable(),
  /** App OAuth đang ở chế độ Testing → refresh token hết hạn sau 7 ngày. */
  testingMode: z.boolean(),
  accounts: z.array(gmailAccountSchema).max(20)
})
export type GmailSettings = z.infer<typeof gmailSettingsV2>

/** Bản một-tài-khoản (GĐ 4). Đọc vào → tự chuyển thành danh sách, token cũ giữ nguyên, không phải đăng nhập lại. */
const gmailSettingsV1 = z.object({
  enabled: z.boolean(),
  clientId: z.string().max(200).nullable(),
  testingMode: z.boolean(),
  email: z.string().max(200).nullable(),
  connectedAt: z.number().int().nullable(),
  skipSensitive: z.boolean(),
  blockedSenders
})

export function defaultAccountLabel(email: string): string {
  return email.split('@')[0]?.replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 40) || 'Gmail'
}

export function migrateGmailSettings(v1: z.infer<typeof gmailSettingsV1>): GmailSettings {
  const { email, connectedAt, skipSensitive, blockedSenders: blocked, ...rest } = v1
  return {
    ...rest,
    accounts:
      email && connectedAt
        ? [
            {
              id: GMAIL_LEGACY_ACCOUNT_ID,
              email,
              label: defaultAccountLabel(email),
              enabled: true,
              connectedAt,
              skipSensitive,
              blockedSenders: blocked
            }
          ]
        : []
  }
}

export const gmailSettingsSchema: z.ZodType<GmailSettings, unknown> = z.union([
  gmailSettingsV2,
  gmailSettingsV1.transform(migrateGmailSettings)
])
export const DEFAULT_GMAIL_SETTINGS: GmailSettings = {
  enabled: false,
  clientId: null,
  testingMode: true,
  accounts: []
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

/** Tài khoản đang kết nối lại có trạng thái 'connecting'; ngắt kết nối = bỏ khỏi danh sách. */
export type GmailConnection = 'connecting' | 'connected' | 'expired'

export type GmailAccountStatus = {
  id: string
  email: string
  label: string
  /** Trợ lý được đọc tài khoản này. */
  enabled: boolean
  connection: GmailConnection
  connectedAt: number | null
  /** Thời điểm (ước tính) phải đăng nhập lại — chỉ khi testingMode. */
  expiresAt: number | null
  skipSensitive: boolean
  blockedSenders: string[]
}

export type GmailStatus = {
  enabled: boolean
  /** Đã nhập client ID + secret. */
  configured: boolean
  /** Đang chờ đăng nhập để THÊM tài khoản mới. */
  adding: boolean
  testingMode: boolean
  clientId: string | null
  accounts: GmailAccountStatus[]
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
  /** Gmail: nháp sẽ lưu trong tài khoản nào (đúng tài khoản chứa thư gốc). */
  account?: { id: string; email: string; label: string }
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
export const gmailOptionsSchema = z.object({ testingMode: z.boolean() })
export const gmailAccountIdSchema = z.string().regex(GMAIL_ACCOUNT_ID)
/** Bỏ trống = thêm tài khoản mới; có id = kết nối lại tài khoản đó. */
export const gmailConnectSchema = gmailAccountIdSchema.optional()
export const gmailAccountUpdateSchema = z.object({
  id: gmailAccountIdSchema,
  label: accountLabel,
  enabled: z.boolean(),
  skipSensitive: z.boolean(),
  blockedSenders: z.array(z.string().trim().toLowerCase().min(1).max(200)).max(200)
})
export type GmailAccountUpdate = z.infer<typeof gmailAccountUpdateSchema>

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
