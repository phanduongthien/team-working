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

/**
 * Thao tác làm đổi trạng thái: lỗi → { error }, và LUÔN phát trạng thái mới sau khi xong — kể cả khi lỗi
 * (vd đăng nhập Google bị huỷ / hết giờ: không phát thì trang cài đặt kẹt ở "Đang chờ đăng nhập").
 * Gom ở đây để thao tác mới không quên phát.
 */
const mutation =
  (service: { publish(): unknown }) =>
  async <T>(fn: () => T | Promise<T>): Promise<T | { error: string }> => {
    try {
      return await safe(fn)
    } finally {
      service.publish()
    }
  }

/** IPC kết nối Gmail / Telegram. Lỗi nghiệp vụ trả { error } để UI hiện thông báo; secret không bao giờ trả về renderer. */
export function registerConnectorsIpc({
  handle,
  gmail,
  telegram,
  approvals
}: ConnectorsIpcDeps): void {
  const g = mutation(gmail)
  const tg = mutation(telegram)

  handle(IPC.gmailStatus, none, () => gmail.status())
  handle(IPC.gmailSetEnabled, gmailSetEnabledSchema, (on) => g(() => gmail.setEnabled(on)))
  handle(IPC.gmailSetCredentials, gmailCredentialsSchema, ({ clientId, clientSecret }) =>
    g(() => gmail.setCredentials(clientId, clientSecret || undefined))
  )
  handle(IPC.gmailSetOptions, gmailOptionsSchema, (o) => g(() => gmail.setOptions(o)))
  handle(IPC.gmailUpdateAccount, gmailAccountUpdateSchema, (u) => g(() => gmail.updateAccount(u)))
  // Chờ người dùng đăng nhập trong trình duyệt (tối đa 5 phút). Không id = thêm tài khoản mới.
  handle(IPC.gmailConnect, gmailConnectSchema, (id) => g(() => gmail.connect(id)))
  handle(IPC.gmailCancelConnect, none, () => g(() => gmail.cancelConnect()))
  handle(IPC.gmailDisconnect, gmailAccountIdSchema, (id) => g(() => gmail.disconnect(id)))
  // Thử đọc có thể phát hiện token hết hạn → cũng phát trạng thái.
  handle(IPC.gmailPreview, gmailAccountIdSchema, (id) => g(() => gmail.preview(id)))

  handle(IPC.telegramStatus, none, () => telegram.status())
  handle(IPC.telegramSetEnabled, z.boolean(), (on) => tg(() => telegram.setEnabled(on)))
  handle(IPC.telegramSetCredentials, telegramCredentialsSchema, ({ apiId, apiHash }) =>
    tg(() => telegram.setCredentials(apiId, apiHash || undefined))
  )
  handle(IPC.telegramSendCode, telegramPhoneSchema, (phone) => tg(() => telegram.sendCode(phone)))
  handle(IPC.telegramSignIn, telegramCodeSchema, (code) => tg(() => telegram.signIn(code)))
  handle(IPC.telegramPassword, telegramPasswordSchema, (pw) =>
    tg(() => telegram.checkPassword(pw))
  )
  handle(IPC.telegramCancelLogin, none, () => tg(() => telegram.cancelLogin()))
  handle(IPC.telegramLogout, none, () => tg(() => telegram.logout()))
  // Tải danh sách chat có thể phát hiện phiên bị thu hồi → cũng phát trạng thái.
  handle(IPC.telegramChats, z.boolean().optional(), (force) =>
    tg(() => telegram.chats(force ?? false))
  )
  handle(IPC.telegramSetLists, telegramListsSchema, (lists) => tg(() => telegram.setLists(lists)))

  handle(IPC.draftRespond, draftDecisionSchema, (d) => approvals.respond(d))
}
