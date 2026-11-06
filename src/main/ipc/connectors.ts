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
  handle(IPC.gmailStatus, none, () => gmail.status())
  handle(IPC.gmailSetEnabled, gmailSetEnabledSchema, (on) => gmail.setEnabled(on))
  handle(IPC.gmailSetCredentials, gmailCredentialsSchema, ({ clientId, clientSecret }) =>
    safe(() => gmail.setCredentials(clientId, clientSecret || undefined))
  )
  handle(IPC.gmailSetOptions, gmailOptionsSchema, (o) => gmail.setOptions(o))
  handle(IPC.gmailUpdateAccount, gmailAccountUpdateSchema, (u) => safe(() => gmail.updateAccount(u)))
  // Chờ người dùng đăng nhập trong trình duyệt (tối đa 5 phút). Không id = thêm tài khoản mới.
  handle(IPC.gmailConnect, gmailConnectSchema, (id) => safe(() => gmail.connect(id)))
  handle(IPC.gmailCancelConnect, none, () => gmail.cancelConnect())
  handle(IPC.gmailDisconnect, gmailAccountIdSchema, (id) => safe(() => gmail.disconnect(id)))
  handle(IPC.gmailPreview, gmailAccountIdSchema, (id) => safe(() => gmail.preview(id)))

  handle(IPC.telegramStatus, none, () => telegram.status())
  handle(IPC.telegramSetEnabled, z.boolean(), (on) => telegram.setEnabled(on))
  handle(IPC.telegramSetCredentials, telegramCredentialsSchema, ({ apiId, apiHash }) =>
    safe(() => telegram.setCredentials(apiId, apiHash || undefined))
  )
  handle(IPC.telegramSendCode, telegramPhoneSchema, (phone) => safe(() => telegram.sendCode(phone)))
  handle(IPC.telegramSignIn, telegramCodeSchema, (code) => safe(() => telegram.signIn(code)))
  handle(IPC.telegramPassword, telegramPasswordSchema, (pw) =>
    safe(() => telegram.checkPassword(pw))
  )
  handle(IPC.telegramCancelLogin, none, () => safe(() => telegram.cancelLogin()))
  handle(IPC.telegramLogout, none, () => safe(() => telegram.logout()))
  handle(IPC.telegramChats, z.boolean().optional(), (force) =>
    safe(() => telegram.chats(force ?? false))
  )
  handle(IPC.telegramSetLists, telegramListsSchema, (lists) => telegram.setLists(lists))

  handle(IPC.draftRespond, draftDecisionSchema, (d) => approvals.respond(d))
}
