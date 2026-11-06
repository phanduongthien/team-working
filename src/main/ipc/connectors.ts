import { z } from 'zod'
import {
  draftDecisionSchema,
  gmailAccountIdSchema,
  gmailAccountUpdateSchema,
  gmailConnectSchema,
  gmailCredentialsSchema,
  gmailOptionsSchema,
  gmailSetEnabledSchema,
  telegramCodeSchema,
  telegramCredentialsSchema,
  telegramListsSchema,
  telegramPasswordSchema,
  telegramPhoneSchema
} from '@shared/connectors'
import { IPC } from '@shared/ipc'
import type { DraftApprovals } from '../connectors/approvals'
import type { GmailService } from '../connectors/gmail/service'
import type { TelegramService } from '../connectors/telegram/service'
import type { HandleFn } from './register'

export type ConnectorsIpcDeps = {
  handle: HandleFn
  gmail: GmailService
  telegram: TelegramService
  approvals: DraftApprovals
}

const none = z.undefined()
const errorOf = (err: unknown): { error: string } => ({ error: (err as Error).message })
const safe = async <T>(fn: () => T | Promise<T>): Promise<T | { error: string }> => {
  try {
    return await fn()
  } catch (err) {
    return errorOf(err)
  }
}

/** IPC kết nối Gmail / Telegram. Lỗi nghiệp vụ trả { error } để UI hiện thông báo; secret không bao giờ trả về renderer. */
export function registerConnectorsIpc({
  handle,
  gmail,
  telegram,
  approvals
}: ConnectorsIpcDeps): void {
  // Thao tác đổi trạng thái: lỗi → { error }; `changes` → luôn báo đồng bộ sau khi xong, kể cả khi lỗi
  // (vd đăng nhập Google bị huỷ / hết giờ: không báo thì trang cài đặt kẹt ở "Đang chờ đăng nhập").
  const G = { changes: 'gmail' } as const
  const T = { changes: 'telegram' } as const

  handle(IPC.gmailStatus, none, () => gmail.status())
  handle(IPC.gmailSetEnabled, gmailSetEnabledSchema, (on) => safe(() => gmail.setEnabled(on)), G)
  handle(
    IPC.gmailSetCredentials,
    gmailCredentialsSchema,
    ({ clientId, clientSecret }) => safe(() => gmail.setCredentials(clientId, clientSecret || undefined)),
    G
  )
  handle(IPC.gmailSetOptions, gmailOptionsSchema, (o) => safe(() => gmail.setOptions(o)), G)
  handle(IPC.gmailUpdateAccount, gmailAccountUpdateSchema, (u) => safe(() => gmail.updateAccount(u)), G)
  // Chờ người dùng đăng nhập trong trình duyệt (tối đa 5 phút). Không id = thêm tài khoản mới.
  handle(IPC.gmailConnect, gmailConnectSchema, (id) => safe(() => gmail.connect(id)), G)
  handle(IPC.gmailCancelConnect, none, () => safe(() => gmail.cancelConnect()), G)
  handle(IPC.gmailDisconnect, gmailAccountIdSchema, (id) => safe(() => gmail.disconnect(id)), G)
  // Thử đọc có thể phát hiện token hết hạn → cũng báo đồng bộ.
  handle(IPC.gmailPreview, gmailAccountIdSchema, (id) => safe(() => gmail.preview(id)), G)

  handle(IPC.telegramStatus, none, () => telegram.status())
  handle(IPC.telegramSetEnabled, z.boolean(), (on) => safe(() => telegram.setEnabled(on)), T)
  handle(
    IPC.telegramSetCredentials,
    telegramCredentialsSchema,
    ({ apiId, apiHash }) => safe(() => telegram.setCredentials(apiId, apiHash || undefined)),
    T
  )
  handle(IPC.telegramSendCode, telegramPhoneSchema, (phone) => safe(() => telegram.sendCode(phone)), T)
  handle(IPC.telegramSignIn, telegramCodeSchema, (code) => safe(() => telegram.signIn(code)), T)
  handle(IPC.telegramPassword, telegramPasswordSchema, (pw) => safe(() => telegram.checkPassword(pw)), T)
  handle(IPC.telegramCancelLogin, none, () => safe(() => telegram.cancelLogin()), T)
  handle(IPC.telegramLogout, none, () => safe(() => telegram.logout()), T)
  // Tải danh sách chat có thể phát hiện phiên bị thu hồi → cũng báo đồng bộ.
  handle(IPC.telegramChats, z.boolean().optional(), (force) => safe(() => telegram.chats(force ?? false)), T)
  handle(IPC.telegramSetLists, telegramListsSchema, (lists) => safe(() => telegram.setLists(lists)), T)

  handle(IPC.draftRespond, draftDecisionSchema, (d) => approvals.respond(d))
}
