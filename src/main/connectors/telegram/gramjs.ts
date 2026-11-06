import type { Api, TelegramClient } from 'telegram'
import type { LogLevel } from 'telegram/extensions/Logger'
import type { TelegramAccount } from '@shared/connectors'
import { maskPhone } from '../filters'
import {
  TelegramFloodWait,
  type RawDialog,
  type RawTgMessage,
  type TelegramBackend
} from './backend'

export type GramJsDeps = {
  apiId(): number | null
  apiHash(): string | null
  /** Session GramJS (StringSession) — lưu bằng DPAPI. */
  session: { get(): string | null; set(v: string): void; clear(): void; has(): boolean }
  appVersion: string
  log: { info(msg: string): void; warn(msg: string): void }
}

// GramJS chỉ nạp khi người dùng bật Telegram (không làm chậm lúc mở app).
let loaded: Promise<typeof import('telegram')> | null = null
const load = async (): Promise<{ tg: typeof import('telegram') }> => {
  loaded ??= import('telegram')
  return { tg: await loaded }
}

type Rpc = { errorMessage?: string; seconds?: number }

/** Đổi lỗi GramJS thành lỗi app hiểu: chờ flood, mã sai, mật khẩu sai… */
function mapError(err: unknown): Error {
  const e = err as Rpc & Error
  if (typeof e.seconds === 'number' && /FLOOD/.test(e.errorMessage ?? e.message))
    return new TelegramFloodWait(e.seconds)
  const code = e.errorMessage ?? ''
  if (code === 'PHONE_CODE_INVALID' || code === 'PHONE_CODE_EMPTY') return new Error('code_invalid')
  if (code === 'PHONE_CODE_EXPIRED') return new Error('code_expired')
  if (code === 'PASSWORD_HASH_INVALID') return new Error('password_invalid')
  if (code === 'PHONE_NUMBER_INVALID') return new Error('phone_invalid')
  if (code === 'PHONE_NUMBER_UNOCCUPIED') return new Error('no_account')
  if (code === 'API_ID_INVALID') return new Error('api_invalid')
  if (code === 'AUTH_KEY_UNREGISTERED' || code === 'SESSION_REVOKED' || code === 'USER_DEACTIVATED')
    return new Error('session_revoked')
  return e instanceof Error ? e : new Error(String(err))
}

const MEDIA: Record<string, string> = {
  MessageMediaPhoto: 'ảnh',
  MessageMediaDocument: 'file',
  MessageMediaGeo: 'vị trí',
  MessageMediaContact: 'danh bạ',
  MessageMediaPoll: 'bình chọn',
  MessageMediaWebPage: 'link'
}

/** Telegram thật qua GramJS (MTProto) bằng tài khoản cá nhân. Chỉ đọc + lưu nháp — không có hàm gửi tin. */
export class GramJsBackend implements TelegramBackend {
  private client: TelegramClient | null = null
  private login: { phone: string; phoneCodeHash: string } | null = null

  constructor(private readonly deps: GramJsDeps) {}

  hasSession(): boolean {
    return this.deps.session.has()
  }

  async sendCode(phone: string): Promise<void> {
    await this.drop()
    const client = await this.newClient('')
    try {
      const { phoneCodeHash } = await client.sendCode(this.creds(), phone)
      this.login = { phone, phoneCodeHash }
    } catch (err) {
      await this.drop()
      throw mapError(err)
    }
  }

  async signIn(code: string): Promise<'ok' | 'password_needed'> {
    const { tg } = await load()
    const client = this.client
    if (!client || !this.login) throw new Error('no_login')
    try {
      const r = await client.invoke(
        new tg.Api.auth.SignIn({
          phoneNumber: this.login.phone,
          phoneCodeHash: this.login.phoneCodeHash,
          phoneCode: code
        })
      )
      if (r instanceof tg.Api.auth.AuthorizationSignUpRequired) throw new Error('no_account')
    } catch (err) {
      if ((err as Rpc).errorMessage === 'SESSION_PASSWORD_NEEDED') return 'password_needed'
      throw mapError(err)
    }
    this.finishLogin()
    return 'ok'
  }

  async checkPassword(password: string): Promise<void> {
    const { tg } = await load()
    const client = this.client
    if (!client || !this.login) throw new Error('no_login')
    try {
      const info = await client.invoke(new tg.Api.account.GetPassword())
      const check = await tg.password.computeCheck(info, password)
      await client.invoke(new tg.Api.auth.CheckPassword({ password: check }))
    } catch (err) {
      throw mapError(err)
    }
    this.finishLogin()
  }

  async restore(): Promise<boolean> {
    if (this.client && !this.login) return true
    const saved = this.deps.session.get()
    if (!saved) return false
    try {
      const client = await this.newClient(saved)
      if (!(await client.checkAuthorization())) throw new Error('session_revoked')
      return true
    } catch (err) {
      const e = mapError(err)
      this.deps.log.warn(`Telegram: không khôi phục được phiên (${e.message})`)
      await this.drop()
      if (e.message === 'session_revoked') this.deps.session.clear()
      return false
    }
  }

  async me(): Promise<TelegramAccount> {
    const me = await this.call((c) => c.getMe())
    const name = [me.firstName, me.lastName].filter(Boolean).join(' ') || me.username || 'Telegram'
    return { name, username: me.username ?? null, phone: maskPhone(me.phone) }
  }

  async dialogs(limit: number): Promise<RawDialog[]> {
    const list = await this.call((c) => c.getDialogs({ limit }))
    return list.map((d) => {
      const entity = d.entity as { bot?: boolean; username?: string } | undefined
      const kind: RawDialog['kind'] = d.isUser
        ? entity?.bot
          ? 'bot'
          : 'user'
        : d.isGroup
          ? 'group'
          : 'channel'
      return {
        id: String(d.id),
        title: d.title ?? d.name ?? '',
        username: entity?.username ?? null,
        kind,
        unread: d.unreadCount,
        lastAt: d.date ? d.date * 1000 : null
      }
    })
  }

  async messages(chatId: string, limit: number): Promise<RawTgMessage[]> {
    const list = await this.call(async (c) =>
      c.getMessages(await this.entity(c, chatId), { limit })
    )
    return list.map((m) => {
      const sender = m.sender as
        { firstName?: string; lastName?: string; title?: string; username?: string } | undefined
      const name = sender
        ? [sender.firstName, sender.lastName].filter(Boolean).join(' ') ||
          sender.title ||
          sender.username ||
          ''
        : ''
      return {
        id: m.id,
        date: m.date * 1000,
        sender: m.out ? 'Tôi' : name || '?',
        out: !!m.out,
        text: m.message ?? '',
        media: m.media ? (MEDIA[m.media.className] ?? 'đính kèm') : null
      }
    })
  }

  async saveDraft(chatId: string, text: string): Promise<void> {
    const { tg } = await load()
    await this.call(async (c) =>
      c.invoke(new tg.Api.messages.SaveDraft({ peer: await this.entity(c, chatId), message: text }))
    )
  }

  async logout(): Promise<void> {
    const { tg } = await load()
    try {
      if (this.client || (await this.restore())) await this.client?.invoke(new tg.Api.auth.LogOut())
    } catch (err) {
      this.deps.log.warn(
        `Telegram: đăng xuất phía server lỗi (${(err as Error).message}) — vẫn xoá session trên máy`
      )
    }
    await this.drop()
    this.deps.session.clear()
  }

  async cancelLogin(): Promise<void> {
    if (this.login) await this.drop()
  }

  private creds(): { apiId: number; apiHash: string } {
    const apiId = this.deps.apiId()
    const apiHash = this.deps.apiHash()
    if (!apiId || !apiHash) throw new Error('not_configured')
    return { apiId, apiHash }
  }

  private async newClient(session: string): Promise<TelegramClient> {
    const { tg } = await load()
    const { apiId, apiHash } = this.creds()
    const client = new tg.TelegramClient(new tg.sessions.StringSession(session), apiId, apiHash, {
      connectionRetries: 3,
      // Không tự ngủ khi bị FLOOD_WAIT — báo lại cho trợ lý/người dùng.
      floodSleepThreshold: 0,
      deviceModel: 'MMC studio',
      appVersion: this.deps.appVersion,
      systemVersion: 'Windows'
    })
    client.setLogLevel('error' as LogLevel)
    await client.connect()
    this.client = client
    return client
  }

  private finishLogin(): void {
    this.login = null
    this.deps.session.set(String(this.client!.session.save()))
    this.deps.log.info('Telegram: đăng nhập xong, đã lưu phiên (DPAPI)')
  }

  /** getEntity theo id đã đánh dấu (-100… cho kênh). Chưa có trong cache → nạp danh sách chat rồi thử lại. */
  private async entity(c: TelegramClient, chatId: string): Promise<Api.TypeInputPeer> {
    const { tg } = await load()
    const id = tg.helpers.returnBigInt(chatId)
    try {
      return await c.getInputEntity(id)
    } catch {
      await c.getDialogs({ limit: 200 })
      return c.getInputEntity(id)
    }
  }

  private async call<T>(fn: (c: TelegramClient) => Promise<T>): Promise<T> {
    if (!this.client || this.login) {
      if (!(await this.restore())) throw new Error('not_connected')
    }
    try {
      return await fn(this.client!)
    } catch (err) {
      const e = mapError(err)
      if (e.message === 'session_revoked') {
        await this.drop()
        this.deps.session.clear()
      }
      throw e
    }
  }

  private async drop(): Promise<void> {
    const c = this.client
    this.client = null
    this.login = null
    if (c) await c.destroy().catch(() => undefined)
  }
}
