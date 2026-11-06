import { createHash, randomBytes } from 'node:crypto'
import { GMAIL_LEGACY_ACCOUNT_ID } from '@shared/connectors'
import type { OAuthResult } from '../../services/oauthLoopback'

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

/** Refresh token bị Google thu hồi / hết hạn (chế độ Testing: 7 ngày) → phải đăng nhập lại. */
export class GmailAuthExpired extends Error {
  constructor() {
    super('gmail_expired')
  }
}

export type GmailSummary = {
  id: string
  threadId: string
  from: string
  subject: string
  date: string
  snippet: string
  unread: boolean
}
export type GmailMessage = GmailSummary & {
  to: string
  body: string
  messageId: string | null
  references: string | null
  attachments: string[]
}
export type GmailDraftInput = {
  to: string[]
  subject: string
  body: string
  replyTo?: GmailMessage
}

/** Kết quả đăng nhập Google: biết email rồi service mới quyết định lưu token vào tài khoản nào. */
export type GmailAuthorization = {
  email: string
  /** Lưu refresh token (DPAPI) cho tài khoản `accountId`. */
  commit(accountId: string): void
  /** Không dùng (vd đăng nhập nhầm tài khoản) → thu hồi phía Google, không lưu gì. */
  discard(): Promise<void>
}

/** Phần Gmail mà service cần — bản thật gọi Google, bản giả cho test e2e. Mỗi tài khoản một token riêng. */
export interface GmailBackend {
  /** Mở trình duyệt đăng nhập Google (gợi ý sẵn email nếu có), chờ callback. */
  authorize(loginHint?: string): Promise<GmailAuthorization>
  cancelConnect(): void
  /** Thu hồi token ở Google (nếu được) và xoá trên máy. */
  disconnect(accountId: string): Promise<void>
  hasToken(accountId: string): boolean
  search(accountId: string, query: string, max: number): Promise<GmailSummary[]>
  read(accountId: string, id: string): Promise<GmailMessage>
  createDraft(accountId: string, draft: GmailDraftInput): Promise<{ id: string }>
}

/**
 * File refresh token (DPAPI) của từng tài khoản. Tài khoản chuyển từ bản một-tài-khoản dùng lại file cũ
 * → người dùng không phải đăng nhập lại sau khi cập nhật.
 */
export function gmailTokenFileName(accountId: string): string {
  return accountId === GMAIL_LEGACY_ACCOUNT_ID
    ? 'gmail-refresh-token.bin'
    : `gmail-refresh-token-${accountId}.bin`
}

export type TokenStore = {
  get(): string | null
  set(v: string): void
  clear(): void
  has(): boolean
}

export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  // compose = tạo bản nháp. App KHÔNG BAO GIỜ gọi API gửi thư.
  'https://www.googleapis.com/auth/gmail.compose'
]
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

const b64url = (buf: Buffer): string => buf.toString('base64url')

export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(48))
  return { verifier, challenge: b64url(createHash('sha256').update(verifier).digest()) }
}

export function buildAuthUrl(p: {
  clientId: string
  redirectUri: string
  challenge: string
  state: string
  /** Gợi ý tài khoản khi kết nối lại (Google chọn sẵn email đó). */
  loginHint?: string
}): string {
  const q = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES.join(' '),
    code_challenge: p.challenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    // Luôn hỏi lại để Google trả refresh token mới (kể cả lần kết nối lại sau 7 ngày).
    // Thêm tài khoản: select_account để không tự dùng lại tài khoản Google đang đăng nhập trong trình duyệt.
    prompt: p.loginHint ? 'consent' : 'consent select_account',
    state: p.state
  })
  if (p.loginHint) q.set('login_hint', p.loginHint)
  return `${AUTH_URL}?${q.toString()}`
}

type RawHeader = { name: string; value: string }
export type RawPart = {
  mimeType?: string
  filename?: string
  headers?: RawHeader[]
  body?: { data?: string; size?: number; attachmentId?: string }
  parts?: RawPart[]
}
export type RawMessage = {
  id: string
  threadId: string
  snippet?: string
  labelIds?: string[]
  payload?: RawPart
}

const header = (part: RawPart | undefined, name: string): string =>
  part?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''

const decode = (data: string): string => Buffer.from(data, 'base64url').toString('utf8')

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' '
}

/** HTML → chữ thường: bỏ style/script, xuống dòng ở thẻ khối, bỏ thẻ, giải mã entity cơ bản. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') {
        const code =
          e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m
      }
      return ENTITIES[e.toLowerCase()] ?? m
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Lấy nội dung chữ của thư: ưu tiên text/plain, không có thì text/html chuyển thành chữ. Kèm tên file đính kèm. */
export function extractBody(payload: RawPart | undefined): { text: string; attachments: string[] } {
  let plain: string | null = null
  let html: string | null = null
  const attachments: string[] = []
  const walk = (part: RawPart): void => {
    if (part.filename) {
      attachments.push(part.filename)
      return
    }
    const data = part.body?.data
    if (data && part.mimeType === 'text/plain' && plain === null) plain = decode(data)
    else if (data && part.mimeType === 'text/html' && html === null) html = decode(data)
    for (const p of part.parts ?? []) walk(p)
  }
  if (payload) walk(payload)
  const text = plain ?? (html !== null ? htmlToText(html) : '')
  return { text: text.replace(/\r\n/g, '\n').trim(), attachments }
}

export function toSummary(m: RawMessage): GmailSummary {
  return {
    id: m.id,
    threadId: m.threadId,
    from: header(m.payload, 'From'),
    subject: header(m.payload, 'Subject'),
    date: header(m.payload, 'Date'),
    snippet: decodeSnippet(m.snippet ?? ''),
    unread: m.labelIds?.includes('UNREAD') ?? false
  }
}

const decodeSnippet = (s: string): string => htmlToText(s)

export function toMessage(m: RawMessage): GmailMessage {
  const { text, attachments } = extractBody(m.payload)
  return {
    ...toSummary(m),
    to: header(m.payload, 'To'),
    body: text,
    messageId: header(m.payload, 'Message-ID') || null,
    references: header(m.payload, 'References') || null,
    attachments
  }
}

const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim()
const encodeHeader = (s: string): string =>
  /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`

/** Thư RFC 2822 (UTF-8, base64) cho bản nháp. Trả lời thư → gắn In-Reply-To / References để vào đúng luồng. */
export function buildRawDraft(d: GmailDraftInput): string {
  let subject = oneLine(d.subject)
  if (d.replyTo && !/^re:/i.test(subject)) subject = `Re: ${subject || oneLine(d.replyTo.subject)}`
  const lines = [`To: ${d.to.map(oneLine).join(', ')}`, `Subject: ${encodeHeader(subject)}`]
  if (d.replyTo?.messageId) {
    lines.push(`In-Reply-To: ${oneLine(d.replyTo.messageId)}`)
    lines.push(
      `References: ${oneLine([d.replyTo.references, d.replyTo.messageId].filter(Boolean).join(' '))}`
    )
  }
  const body = Buffer.from(d.body.replace(/\r?\n/g, '\r\n'), 'utf8')
    .toString('base64')
    .replace(/.{76}/g, '$&\r\n')
  lines.push(
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    body
  )
  return b64url(Buffer.from(lines.join('\r\n'), 'utf8'))
}

export type GoogleGmailDeps = {
  fetch: FetchFn
  openExternal(url: string): Promise<void>
  /** Mở cổng loopback, gọi `open` (mở trình duyệt), chờ callback. */
  waitForCode(open: () => Promise<void>): Promise<OAuthResult & { state?: string }>
  cancelWait(): void
  redirectUri: string
  clientId(): string | null
  clientSecret(): string | null
  /** Refresh token (DPAPI) của từng tài khoản. */
  tokens(accountId: string): TokenStore
  now?: () => number
}

type AccessToken = { token: string; expiresAt: number }

/** Access token bị Google từ chối (401) → lấy token mới một lần rồi thử lại. */
class AccessRejected extends Error {
  constructor() {
    super('gmail_401')
  }
}

/** Gmail thật: OAuth 2.0 + PKCE qua loopback, REST API bằng fetch (không cần thư viện Google). */
export class GoogleGmailBackend implements GmailBackend {
  private access = new Map<string, AccessToken>()

  constructor(private readonly deps: GoogleGmailDeps) {}

  hasToken(accountId: string): boolean {
    return this.deps.tokens(accountId).has()
  }

  async authorize(loginHint?: string): Promise<GmailAuthorization> {
    const clientId = this.deps.clientId()
    const secret = this.deps.clientSecret()
    if (!clientId || !secret) throw new Error('not_configured')
    const { verifier, challenge } = pkcePair()
    const state = b64url(randomBytes(16))
    const url = buildAuthUrl({
      clientId,
      redirectUri: this.deps.redirectUri,
      challenge,
      state,
      loginHint
    })
    const result = await this.deps.waitForCode(() => this.deps.openExternal(url))
    if ('error' in result)
      throw new Error(result.error === 'access_denied' ? 'access_denied' : result.error)
    if (result.state !== state) throw new Error('state_mismatch')
    const token = await this.tokenRequest({
      grant_type: 'authorization_code',
      code: result.code,
      code_verifier: verifier,
      redirect_uri: this.deps.redirectUri,
      client_id: clientId,
      client_secret: secret
    })
    const refresh = token.refresh_token
    if (!refresh) throw new Error('no_refresh_token')
    const access: AccessToken = {
      token: token.access_token,
      expiresAt: this.now() + (token.expires_in - 60) * 1000
    }
    const profile = await this.request<{ emailAddress: string }>(access.token, '/profile')
    return {
      email: profile.emailAddress,
      commit: (accountId) => {
        this.deps.tokens(accountId).set(refresh)
        this.access.set(accountId, access)
      },
      discard: () => this.revoke(refresh)
    }
  }

  cancelConnect(): void {
    this.deps.cancelWait()
  }

  async disconnect(accountId: string): Promise<void> {
    const store = this.deps.tokens(accountId)
    const refresh = store.get()
    this.access.delete(accountId)
    store.clear()
    if (refresh) await this.revoke(refresh)
  }

  async search(accountId: string, query: string, max: number): Promise<GmailSummary[]> {
    const q = new URLSearchParams({ maxResults: String(max) })
    if (query.trim()) q.set('q', query.trim())
    const list = await this.api<{ messages?: { id: string }[] }>(
      accountId,
      `/messages?${q.toString()}`
    )
    const ids = (list.messages ?? []).map((m) => m.id)
    const meta = new URLSearchParams({ format: 'metadata' })
    for (const h of ['From', 'Subject', 'Date']) meta.append('metadataHeaders', h)
    const out: GmailSummary[] = []
    for (const id of ids)
      out.push(
        toSummary(
          await this.api<RawMessage>(
            accountId,
            `/messages/${encodeURIComponent(id)}?${meta.toString()}`
          )
        )
      )
    return out
  }

  async read(accountId: string, id: string): Promise<GmailMessage> {
    return toMessage(
      await this.api<RawMessage>(accountId, `/messages/${encodeURIComponent(id)}?format=full`)
    )
  }

  async createDraft(accountId: string, draft: GmailDraftInput): Promise<{ id: string }> {
    const message: Record<string, string> = { raw: buildRawDraft(draft) }
    if (draft.replyTo) message.threadId = draft.replyTo.threadId
    const r = await this.api<{ id: string }>(accountId, '/drafts', {
      method: 'POST',
      body: JSON.stringify({ message })
    })
    return { id: r.id }
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  /** Thu hồi phía Google; mất mạng cũng không sao — token trên máy đã xoá / chưa lưu. */
  private async revoke(refresh: string): Promise<void> {
    await this.deps
      .fetch(`${REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: 'POST' })
      .catch(() => undefined)
  }

  private async tokenRequest(
    body: Record<string, string>
  ): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
    const res = await this.deps.fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString()
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      // invalid_grant = refresh token hết hạn / bị thu hồi (Testing: sau 7 ngày).
      if (json.error === 'invalid_grant') throw new GmailAuthExpired()
      throw new Error(`google_token_${String(json.error ?? res.status)}`)
    }
    return json as { access_token: string; expires_in: number; refresh_token?: string }
  }

  private async accessToken(accountId: string): Promise<string> {
    const cached = this.access.get(accountId)
    if (cached && cached.expiresAt > this.now()) return cached.token
    const store = this.deps.tokens(accountId)
    const refresh = store.get()
    const clientId = this.deps.clientId()
    const secret = this.deps.clientSecret()
    if (!refresh || !clientId || !secret) throw new GmailAuthExpired()
    try {
      const t = await this.tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: refresh,
        client_id: clientId,
        client_secret: secret
      })
      this.access.set(accountId, {
        token: t.access_token,
        expiresAt: this.now() + (t.expires_in - 60) * 1000
      })
      return t.access_token
    } catch (err) {
      // Chỉ tài khoản này hết hạn; tài khoản khác vẫn dùng được.
      if (err instanceof GmailAuthExpired) store.clear()
      throw err
    }
  }

  private async api<T>(accountId: string, path: string, init?: RequestInit): Promise<T> {
    try {
      return await this.request<T>(await this.accessToken(accountId), path, init)
    } catch (err) {
      if (!(err instanceof AccessRejected)) throw err
      this.access.delete(accountId)
      return this.request<T>(await this.accessToken(accountId), path, init)
    }
  }

  private async request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
    const res = await this.deps.fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {})
      }
    })
    if (res.status === 401) throw new AccessRejected()
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; status?: string }
      }
      throw new Error(
        `gmail_${res.status}: ${json.error?.message ?? json.error?.status ?? 'error'}`
      )
    }
    return (await res.json()) as T
  }
}
