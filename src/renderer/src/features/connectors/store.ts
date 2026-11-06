import type { z } from 'zod'
import { create } from 'zustand'
import type {
  DraftApprovalRequest,
  GmailStatus,
  TelegramChatInfo,
  TelegramStatus
} from '@shared/connectors'
import { api } from '@renderer/lib/api'

type ConnectorsStore = {
  gmail: GmailStatus | null
  telegram: TelegramStatus | null
  chats: TelegramChatInfo[] | null
  /** Bản nháp chờ duyệt (hiện lần lượt). */
  drafts: DraftApprovalRequest[]
  loadChats(force?: boolean): Promise<string | null>
  respondDraft(id: string, approve: boolean, body?: string): Promise<void>
  /** Hỏi lại main trạng thái Gmail + Telegram (mở trang, quay lại cửa sổ sau khi đăng nhập trên trình duyệt). */
  refresh(): Promise<void>
}

/**
 * Đếm sự kiện trạng thái đã nhận: kết quả status() chỉ ghi vào store nếu không có sự kiện nào đến
 * trong lúc chờ — tránh bản cũ đè lên bản mới hơn.
 */
const seen = { gmail: 0, telegram: 0 }

const applyTelegram = (telegram: TelegramStatus): void =>
  // Đăng xuất → bỏ danh sách chat đang hiện.
  useConnectors.setState((s) => ({
    telegram,
    chats: telegram.connection === 'connected' ? s.chats : null
  }))

export const isError = (r: unknown): r is { error: string } =>
  typeof r === 'object' && r !== null && 'error' in r

/** Kiểm tra trước ở renderer bằng đúng schema của main → báo lỗi dễ hiểu thay vì IPC từ chối. */
export function invalid(schema: z.ZodType, value: unknown): string | null {
  const r = schema.safeParse(value)
  if (r.success) return null
  const msg = r.error.issues[0]?.message ?? ''
  return /^[a-z_]+$/.test(msg) ? msg : 'invalid_input'
}

/** Gọi IPC; bị từ chối (input sai, lỗi bất ngờ) → { error } thay vì promise lỗi không ai bắt. */
export async function safeCall<T>(p: Promise<T>): Promise<T | { error: string }> {
  try {
    return await p
  } catch (err) {
    return { error: /invalid_input/.test(String(err)) ? 'invalid_input' : (err as Error).message }
  }
}

export const useConnectors = create<ConnectorsStore>((set) => ({
  gmail: null,
  telegram: null,
  chats: null,
  drafts: [],
  async loadChats(force) {
    const r = await api.telegram.chats(force)
    if (isError(r)) return r.error
    set({ chats: r })
    return null
  },
  async respondDraft(id, approve, body) {
    set((s) => ({ drafts: s.drafts.filter((d) => d.id !== id) }))
    await api.drafts.respond({ id, approve, body })
  },
  async refresh() {
    const at = { ...seen }
    const [gmail, telegram] = await Promise.all([api.gmail.status(), api.telegram.status()])
    if (seen.gmail === at.gmail) set({ gmail })
    if (seen.telegram === at.telegram) applyTelegram(telegram)
  }
}))

/** Trạng thái + hộp duyệt nháp có thể đến bất cứ lúc nào (trợ lý đang trả lời ở trang Chat). */
export function setupConnectors(): () => void {
  const stops = [
    api.gmail.onStatus((gmail) => {
      seen.gmail++
      useConnectors.setState({ gmail })
    }),
    api.telegram.onStatus((telegram) => {
      seen.telegram++
      applyTelegram(telegram)
    }),
    api.drafts.onApproval((req) =>
      useConnectors.setState((s) =>
        'closed' in req
          ? { drafts: s.drafts.filter((d) => d.id !== req.id) }
          : { drafts: [...s.drafts.filter((d) => d.id !== req.id), req] }
      )
    )
  ]
  void useConnectors.getState().refresh()
  return () => stops.forEach((stop) => stop())
}

/** Allow / block sau khi người dùng bật/tắt một chat, theo chế độ hiện tại. */
export function toggleChat(
  status: Pick<TelegramStatus, 'mode' | 'allow' | 'block'>,
  chat: Pick<TelegramChatInfo, 'id' | 'allowed' | 'sensitive'>,
  on: boolean
): { allow: string[]; block: string[] } {
  const allow = status.allow.filter((id) => id !== chat.id)
  const block = status.block.filter((id) => id !== chat.id)
  if (status.mode === 'allowlist') {
    if (on) allow.push(chat.id)
    return { allow, block }
  }
  // blocklist: tắt → chặn; bật chat nhạy cảm → phải cho phép rõ.
  if (!on) block.push(chat.id)
  else if (chat.sensitive) allow.push(chat.id)
  return { allow, block }
}

/** Số ngày còn lại trước khi Google buộc đăng nhập lại (chế độ Testing). */
export function daysLeft(expiresAt: number | null, now = Date.now()): number | null {
  if (expiresAt === null) return null
  return Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)))
}

/** Ô "Người gửi bị chặn": mỗi dòng / dấu phẩy / chấm phẩy một mục, chữ thường, bỏ trùng + rỗng. */
export function parseBlocked(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\n,;]+/)
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    )
  ]
}
