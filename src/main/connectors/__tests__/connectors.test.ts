import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_GMAIL_SETTINGS,
  DEFAULT_TELEGRAM_SETTINGS,
  type DraftApprovalRequest,
  type GmailSettings,
  type TelegramSettings
} from '@shared/connectors'
import { RateLimiter } from '../../agents/rateLimiter'
import { AppToolRegistry, combineToolSets } from '../../tools/registry'
import { DraftApprovals } from '../approvals'
import {
  isChatAllowed,
  isMailHidden,
  isSenderBlocked,
  isSensitiveText,
  maskPhone
} from '../filters'
import { FakeGmailBackend } from '../gmail/fake'
import {
  buildAuthUrl,
  buildRawDraft,
  extractBody,
  GmailAuthExpired,
  GoogleGmailBackend,
  htmlToText,
  toMessage,
  type RawMessage
} from '../gmail/google'
import { GmailService } from '../gmail/service'
import { FakeTelegramBackend } from '../telegram/fake'
import { TelegramService } from '../telegram/service'

const log = { info: vi.fn(), warn: vi.fn() }
const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url')
const text = (r: { content: { type: string; text?: string }[] }): string =>
  r.content.map((c) => c.text ?? '').join('\n')

const memSecret = (initial: string | null = null) => {
  let v = initial
  return {
    get: () => v,
    set: (x: string) => void (v = x),
    clear: () => void (v = null),
    has: () => v !== null
  }
}

describe('lọc riêng tư', () => {
  const chat = (id: string, title = 'Nhóm bạn') => ({ id, title, kind: 'group' as const })

  it('allowlist: chỉ chat đã chọn; blocklist: mọi chat trừ chat chặn và chat nhạy cảm', () => {
    const allow = { mode: 'allowlist' as const, allow: ['1'], block: [] }
    expect(isChatAllowed(chat('1'), allow)).toBe(true)
    expect(isChatAllowed(chat('2'), allow)).toBe(false)
    const block = { mode: 'blocklist' as const, allow: [], block: ['2'] }
    expect(isChatAllowed(chat('1'), block)).toBe(true)
    expect(isChatAllowed(chat('2'), block)).toBe(false)
    expect(isChatAllowed(chat('3', 'VCB Digibank'), block)).toBe(false)
    expect(isChatAllowed(chat('3', 'VCB Digibank'), { ...block, allow: ['3'] })).toBe(true)
  })

  it('tin nhắn hệ thống Telegram (mã đăng nhập) luôn bị chặn, kể cả khi được chọn', () => {
    expect(
      isChatAllowed(chat('777000', 'Telegram'), { mode: 'allowlist', allow: ['777000'], block: [] })
    ).toBe(false)
    expect(
      isChatAllowed(chat('777000', 'Telegram'), { mode: 'blocklist', allow: ['777000'], block: [] })
    ).toBe(false)
  })

  it('nhận ra nội dung nhạy cảm (tiếng Việt + Anh), không bắt nhầm chữ thường', () => {
    for (const s of [
      'Mã OTP của bạn',
      'Your verification code',
      'Techcombank',
      'Đặt lại mật khẩu',
      'Sao kê tháng 10'
    ])
      expect(isSensitiveText(s), s).toBe(true)
    for (const s of ['Lịch họp review sprint', 'Facebook', 'Nhóm Dự án Game'])
      expect(isSensitiveText(s), s).toBe(false)
  })

  it('chặn người gửi theo địa chỉ hoặc tên miền (kể cả tên miền con)', () => {
    expect(isSenderBlocked('Sếp <Boss@Cty.com>', ['boss@cty.com'])).toBe(true)
    expect(isSenderBlocked('a@mail.bank.vn', ['bank.vn'])).toBe(true)
    expect(isSenderBlocked('a@notbank.vn', ['bank.vn'])).toBe(false)
    expect(isSenderBlocked('a@x.com', ['@x.com'])).toBe(true)
    expect(
      isMailHidden(
        { from: 'a@b.com', subject: 'Mã OTP 123' },
        { skipSensitive: true, blockedSenders: [] }
      )
    ).toBe(true)
    expect(
      isMailHidden(
        { from: 'a@b.com', subject: 'Mã OTP 123' },
        { skipSensitive: false, blockedSenders: [] }
      )
    ).toBe(false)
  })

  it('che số điện thoại', () => {
    expect(maskPhone('84912345678')).toBe('+84•••••678')
    expect(maskPhone(null)).toBeNull()
  })
})

describe('Gmail — OAuth, MIME, bản nháp', () => {
  it('link đăng nhập có PKCE S256, offline, consent, đúng scope chỉ đọc + compose', () => {
    const url = new URL(
      buildAuthUrl({
        clientId: 'id.apps.googleusercontent.com',
        redirectUri: 'http://127.0.0.1:47823/auth/callback',
        challenge: 'ch',
        state: 'st'
      })
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('state')).toBe('st')
    expect(url.searchParams.get('scope')!.split(' ')).toEqual([
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose'
    ])
  })

  it('lấy nội dung: ưu tiên text/plain, không có thì chuyển HTML thành chữ; liệt kê file đính kèm', () => {
    const multi = {
      mimeType: 'multipart/mixed',
      parts: [
        {
          mimeType: 'multipart/alternative',
          parts: [
            { mimeType: 'text/plain', body: { data: b64('Xin chào\r\nbạn') } },
            { mimeType: 'text/html', body: { data: b64('<p>HTML</p>') } }
          ]
        },
        { mimeType: 'application/pdf', filename: 'bao-cao.pdf', body: { attachmentId: 'x' } }
      ]
    }
    expect(extractBody(multi)).toEqual({ text: 'Xin chào\nbạn', attachments: ['bao-cao.pdf'] })
    const html = {
      mimeType: 'text/html',
      body: { data: b64('<style>p{}</style><p>Dòng 1</p><p>A &amp; B&nbsp;&#273;</p>') }
    }
    expect(extractBody(html).text).toBe('Dòng 1\nA & B đ')
    expect(htmlToText('a<br>b<script>x()</script>')).toBe('a\nb')
  })

  it('bản nháp trả lời: tiêu đề Re:, In-Reply-To/References, UTF-8 base64, không cho chèn header', () => {
    const original = toMessage({
      id: 'm1',
      threadId: 't1',
      payload: {
        headers: [
          { name: 'From', value: 'Lan <lan@x.com>' },
          { name: 'Subject', value: 'Họp' },
          { name: 'Message-ID', value: '<a@x>' },
          { name: 'References', value: '<z@x>' }
        ]
      }
    } as RawMessage)
    const raw = Buffer.from(
      buildRawDraft({
        to: ['lan@x.com'],
        subject: 'Họp\r\nBcc: evil@x.com',
        body: 'Dạ vâng\nhẹn mai',
        replyTo: original
      }),
      'base64url'
    ).toString('utf8')
    const [head, body] = raw.split('\r\n\r\n')
    expect(head).toContain('To: lan@x.com')
    expect(head).not.toMatch(/^Bcc:/m)
    expect(head).toContain('In-Reply-To: <a@x>')
    expect(head).toContain('References: <z@x> <a@x>')
    const subject = /Subject: =\?UTF-8\?B\?(.+)\?=/.exec(head)![1]
    expect(Buffer.from(subject, 'base64').toString('utf8')).toBe('Re: Họp Bcc: evil@x.com')
    expect(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe(
      'Dạ vâng\r\nhẹn mai'
    )
  })

  const json = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status })

  function google(
    fetchImpl: (url: string, init?: RequestInit) => Response,
    opts: { state?: string } = {}
  ) {
    const tokens = memSecret()
    const calls: string[] = []
    const backend = new GoogleGmailBackend({
      fetch: async (url, init) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        return fetchImpl(url, init)
      },
      openExternal: vi.fn(async () => undefined),
      waitForCode: async (open) => {
        await open()
        return { code: 'CODE', state: opts.state }
      },
      cancelWait: vi.fn(),
      redirectUri: 'http://127.0.0.1:47823/auth/callback',
      clientId: () => 'id.apps.googleusercontent.com',
      clientSecret: () => 'secret',
      tokens
    })
    return { backend, tokens, calls }
  }

  it('state không khớp → từ chối, không đổi code lấy token', async () => {
    const { backend, calls } = google(() => json(200, {}), { state: 'khac' })
    await expect(backend.connect()).rejects.toThrow('state_mismatch')
    expect(calls).toEqual([])
  })

  it('kết nối: đổi code (kèm code_verifier) lấy refresh token, lưu DPAPI, đọc email', async () => {
    let tokenBody = ''
    let sentState = ''
    const tokens = memSecret()
    const backend = new GoogleGmailBackend({
      fetch: async (url, init) => {
        if (url.includes('oauth2.googleapis.com/token')) {
          tokenBody = String(init?.body)
          return json(200, { access_token: 'AT', expires_in: 3600, refresh_token: 'RT' })
        }
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer AT')
        return json(200, { emailAddress: 'ban@gmail.com' })
      },
      // Trình duyệt mở link → Google trả lại đúng state trong link.
      openExternal: async (u) => void (sentState = new URL(u).searchParams.get('state')!),
      waitForCode: async (open) => {
        await open()
        return { code: 'CODE', state: sentState }
      },
      cancelWait: () => undefined,
      redirectUri: 'http://127.0.0.1:47823/auth/callback',
      clientId: () => 'id.apps.googleusercontent.com',
      clientSecret: () => 'secret',
      tokens
    })
    await expect(backend.connect()).resolves.toEqual({ email: 'ban@gmail.com' })
    expect(tokens.get()).toBe('RT')
    const params = new URLSearchParams(tokenBody)
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('code_verifier')).toMatch(/^[\w-]{43,128}$/)
  })

  it('refresh token hết hạn (invalid_grant) → GmailAuthExpired và xoá token trên máy', async () => {
    const { backend, tokens } = google(() => json(400, { error: 'invalid_grant' }))
    tokens.set('RT-cu')
    await expect(backend.search('', 5)).rejects.toBeInstanceOf(GmailAuthExpired)
    expect(tokens.has()).toBe(false)
  })

  it('ngắt kết nối: xoá token trên máy dù thu hồi phía Google lỗi mạng', async () => {
    const tokens = memSecret('RT')
    const backend = new GoogleGmailBackend({
      fetch: async () => {
        throw new Error('offline')
      },
      openExternal: async () => undefined,
      waitForCode: async () => ({ error: 'x' }),
      cancelWait: () => undefined,
      redirectUri: '',
      clientId: () => null,
      clientSecret: () => null,
      tokens
    })
    await backend.disconnect()
    expect(tokens.has()).toBe(false)
  })
})

function approvalsWithLog() {
  const events: (DraftApprovalRequest | { id: string; closed: true })[] = []
  const approvals = new DraftApprovals({ emit: (e) => events.push(e), log })
  const lastRequest = (): DraftApprovalRequest =>
    events.filter((e): e is DraftApprovalRequest => !('closed' in e)).at(-1)!
  return { approvals, events, lastRequest }
}

function gmailService(patch: Partial<GmailSettings> = {}) {
  let settings: GmailSettings = {
    ...DEFAULT_GMAIL_SETTINGS,
    enabled: true,
    clientId: 'id.apps.googleusercontent.com',
    ...patch
  }
  const backend = new FakeGmailBackend()
  const { approvals, events, lastRequest } = approvalsWithLog()
  const service = new GmailService({
    getSettings: () => settings,
    setSettings: (s) => void (settings = s),
    backend,
    clientSecret: memSecret('secret'),
    approvals,
    limiter: new RateLimiter(() => 60),
    emit: () => undefined,
    log,
    now: () => 1_000_000
  })
  const registry = new AppToolRegistry()
  service.registerTools(registry)
  const call = (name: string, input: unknown) =>
    registry.call(name, input, { conversationId: 'c1' })
  return {
    service,
    backend,
    registry,
    call,
    approvals,
    events,
    lastRequest,
    settings: () => settings
  }
}

describe('GmailService', () => {
  it('tắt / chưa kết nối → không có tool; kết nối xong → có 3 tool + hướng dẫn', async () => {
    const g = gmailService({ enabled: false })
    expect(g.service.toolsFor()).toBeNull()
    g.service.setEnabled(true)
    expect(g.service.toolsFor()).toBeNull()
    expect(g.registry.available({ conversationId: 'c1' })).toEqual([])
    await g.service.connect()
    expect(g.service.status()).toMatchObject({
      connection: 'connected',
      email: 'ban@example.com',
      connectedAt: 1_000_000
    })
    expect(g.service.status().expiresAt).toBe(1_000_000 + 7 * 24 * 60 * 60 * 1000)
    expect(g.service.toolsFor()?.names).toEqual(['gmail_search', 'gmail_read', 'gmail_draft'])
  })

  it('tìm thư: ẩn thư OTP, báo số thư bị ẩn; đọc thư bị ẩn → lỗi', async () => {
    const g = gmailService()
    await g.service.connect()
    const r = await g.call('gmail_search', {})
    expect(text(r)).toContain('Lịch họp review sprint')
    expect(text(r)).not.toContain('482913')
    expect(text(r)).toContain('1 thư bị ẩn')
    const hidden = await g.call('gmail_read', { id: 'fake-msg-2' })
    expect(hidden.isError).toBe(true)
    const ok = await g.call('gmail_read', { id: 'fake-msg-1' })
    expect(text(ok)).toContain('--- BẮT ĐẦU THƯ ---')
    expect(text(ok)).toContain('DỮ LIỆU')
  })

  it('nháp: chờ người dùng duyệt, dùng nội dung họ sửa; trả lời thư → gửi lại người gửi, đúng luồng', async () => {
    const g = gmailService()
    await g.service.connect()
    const pending = g.call('gmail_draft', { body: 'Dạ em sẽ có mặt', reply_to_id: 'fake-msg-1' })
    await vi.waitFor(() => expect(g.events.length).toBe(1))
    expect(g.lastRequest()).toMatchObject({
      service: 'gmail',
      target: 'lan@example.com',
      subject: 'Re: Lịch họp review sprint'
    })
    expect(g.backend.drafts).toEqual([])
    g.approvals.respond({ id: g.lastRequest().id, approve: true, body: 'Dạ em sẽ có mặt lúc 15h' })
    const r = await pending
    expect(r.isError).toBeFalsy()
    expect(text(r)).toContain('CHƯA gửi')
    expect(g.backend.drafts).toHaveLength(1)
    expect(g.backend.drafts[0]).toMatchObject({
      to: ['lan@example.com'],
      body: 'Dạ em sẽ có mặt lúc 15h'
    })
    expect(g.backend.drafts[0].replyTo?.threadId).toBe('fake-thread-1')
  })

  it('nháp bị từ chối hoặc Gmail bị tắt trong lúc chờ → không tạo', async () => {
    const g = gmailService()
    await g.service.connect()
    const rejected = g.call('gmail_draft', { to: ['a@b.com'], subject: 'x', body: 'y' })
    await vi.waitFor(() => expect(g.events.length).toBe(1))
    g.approvals.respond({ id: g.lastRequest().id, approve: false })
    expect((await rejected).isError).toBe(true)
    const cancelled = g.call('gmail_draft', { to: ['a@b.com'], subject: 'x', body: 'y' })
    await vi.waitFor(() => expect(g.events.length).toBe(3))
    g.service.setEnabled(false)
    expect((await cancelled).isError).toBe(true)
    expect(g.backend.drafts).toEqual([])
  })

  it('hết hạn đăng nhập → trạng thái expired, chỉ còn hướng dẫn nhắc kết nối lại (không tool)', async () => {
    const g = gmailService()
    await g.service.connect()
    await g.backend.disconnect() // giả lập Google thu hồi token
    expect(g.service.status().connection).toBe('expired')
    expect(g.service.toolsFor()).toMatchObject({ names: [] })
    expect(g.service.toolsFor()?.context).toContain('kết nối lại')
    await g.service.disconnect()
    expect(g.service.status().connection).toBe('disconnected')
    expect(g.service.toolsFor()).toBeNull()
  })

  it('giới hạn 60 lần/giờ', async () => {
    const g = gmailService()
    await g.service.connect()
    for (let i = 0; i < 60; i++) await g.call('gmail_search', { max: 1 })
    const r = await g.call('gmail_search', { max: 1 })
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('quá nhiều')
  })

  it('đổi client ID khi đang kết nối → ngắt kết nối (token thuộc client cũ)', async () => {
    const g = gmailService()
    await g.service.connect()
    await g.service.setCredentials('khac.apps.googleusercontent.com')
    expect(g.service.status().connection).toBe('disconnected')
  })
})

function telegramService(patch: Partial<TelegramSettings> = {}) {
  let settings: TelegramSettings = {
    ...DEFAULT_TELEGRAM_SETTINGS,
    enabled: true,
    apiId: 123,
    ...patch
  }
  const backend = new FakeTelegramBackend()
  const dialogs = vi.spyOn(backend, 'dialogs')
  const { approvals, events, lastRequest } = approvalsWithLog()
  let now = 0
  const service = new TelegramService({
    getSettings: () => settings,
    setSettings: (s) => void (settings = s),
    backend,
    apiHash: memSecret('0123456789abcdef0123456789abcdef'),
    approvals,
    limiter: new RateLimiter(() => 60),
    emit: () => undefined,
    log,
    now: () => now
  })
  const registry = new AppToolRegistry()
  service.registerTools(registry)
  const call = (name: string, input: unknown) =>
    registry.call(name, input, { conversationId: 'c1' })
  const login = async (): Promise<void> => {
    await service.sendCode('+84 912 345 678')
    await service.signIn('12345')
  }
  return {
    service,
    backend,
    dialogs,
    call,
    approvals,
    events,
    lastRequest,
    login,
    settings: () => settings,
    tick: (ms: number) => void (now += ms)
  }
}

describe('TelegramService', () => {
  it('đăng nhập: số → mã → (mật khẩu 2 bước); xong mới có tool', async () => {
    const t = telegramService()
    expect(t.service.toolsFor()).toBeNull()
    await t.service.sendCode('+84 912 345 672')
    expect(t.service.status().connection).toBe('code_sent')
    await expect(t.service.signIn('00000')).rejects.toThrow('code_invalid')
    expect((await t.service.signIn('12345')).connection).toBe('password_needed')
    expect(t.service.toolsFor()).toBeNull()
    await expect(t.service.checkPassword('sai')).rejects.toThrow('password_invalid')
    const s = await t.service.checkPassword('pw')
    expect(s).toMatchObject({ connection: 'connected', account: { name: 'Bạn Thử Nghiệm' } })
    expect(t.service.toolsFor()?.names).toEqual([
      'telegram_chats',
      'telegram_read',
      'telegram_draft'
    ])
  })

  it('mặc định allowlist rỗng: trợ lý không đọc được chat nào; chọn chat → đọc được, không đọc chat khác', async () => {
    const t = telegramService()
    await t.login()
    expect(text(await t.call('telegram_chats', {}))).toContain('chưa cho phép')
    expect((await t.call('telegram_read', { chat: '1001' })).isError).toBe(true)
    t.service.setLists({ mode: 'allowlist', allow: ['1001'], block: [] })
    const list = text(await t.call('telegram_chats', {}))
    expect(list).toContain('id=1001')
    expect(list).toContain('3 chat bị ẩn')
    const read = text(await t.call('telegram_read', { chat: '1001' }))
    expect(read).toContain('Minh: Build mới đã lên')
    expect(read).toContain('[ảnh]')
    // cũ → mới
    expect(read.indexOf('[ảnh]')).toBeLessThan(read.indexOf('Build mới'))
    expect((await t.call('telegram_read', { chat: '1002' })).isError).toBe(true)
  })

  it('blocklist: chat nhạy cảm + hệ thống bị chặn sẵn; không thể cho phép 777000', async () => {
    const t = telegramService({ mode: 'blocklist' })
    await t.login()
    const chats = await t.service.chats()
    expect(chats.find((c) => c.id === '1002')).toMatchObject({ allowed: true, sensitive: false })
    expect(chats.find((c) => c.id === '1003')).toMatchObject({ allowed: false, sensitive: true })
    expect(chats.find((c) => c.id === '777000')).toMatchObject({ allowed: false, locked: true })
    const s = t.service.setLists({ mode: 'blocklist', allow: ['777000', '1003'], block: ['1003'] })
    expect(s.allow).toEqual(['1003'])
    expect(s.block).toEqual([])
    expect((await t.call('telegram_read', { chat: '777000' })).isError).toBe(true)
  })

  it('nháp phải duyệt; lưu đúng nội dung người dùng sửa; không có hàm gửi', async () => {
    const t = telegramService({ allow: ['1002'] })
    await t.login()
    const pending = t.call('telegram_draft', { chat: '1002', text: 'Mai 9h nhé' })
    await vi.waitFor(() => expect(t.events.length).toBe(1))
    expect(t.lastRequest()).toMatchObject({
      service: 'telegram',
      target: 'Lan Nguyễn',
      subject: null
    })
    t.approvals.respond({ id: t.lastRequest().id, approve: true, body: 'Mai 9h30 nhé' })
    expect(text(await pending)).toContain('CHƯA gửi')
    expect(t.backend.drafts).toEqual([{ chatId: '1002', text: 'Mai 9h30 nhé' }])
    expect('sendMessage' in t.backend).toBe(false)
  })

  it('danh sách chat lưu tạm 15 phút; Làm mới tối đa 1 lần/phút', async () => {
    const t = telegramService()
    await t.login()
    await t.service.chats()
    await t.service.chats(true)
    expect(t.dialogs).toHaveBeenCalledTimes(1)
    t.tick(61_000)
    await t.service.chats()
    expect(t.dialogs).toHaveBeenCalledTimes(1)
    await t.service.chats(true)
    expect(t.dialogs).toHaveBeenCalledTimes(2)
    t.tick(16 * 60_000)
    await t.service.chats()
    expect(t.dialogs).toHaveBeenCalledTimes(3)
  })

  it('đăng xuất: xoá phiên + danh sách chat đã chọn, không còn tool', async () => {
    const t = telegramService({ allow: ['1001'] })
    await t.login()
    const s = await t.service.logout()
    expect(s).toMatchObject({ connection: 'disconnected', account: null, allow: [], block: [] })
    expect(t.backend.hasSession()).toBe(false)
    expect(t.service.toolsFor()).toBeNull()
  })

  it('đang đăng nhập dở thì không đổi api_id được khi còn phiên', async () => {
    const t = telegramService()
    await t.login()
    expect(() => t.service.setCredentials(999)).toThrow('logout_first')
  })
})

describe('DraftApprovals', () => {
  it('hết giờ / dừng lượt chat → từ chối và báo renderer đóng hộp thoại', async () => {
    vi.useFakeTimers()
    try {
      const events: unknown[] = []
      const a = new DraftApprovals({ emit: (e) => events.push(e), log, timeoutMs: 1000 })
      const draft = {
        service: 'gmail' as const,
        target: 'x',
        subject: 's',
        body: 'b',
        replyTo: null
      }
      const p1 = a.request('c1', draft)
      vi.advanceTimersByTime(1001)
      await expect(p1).resolves.toMatchObject({ approve: false })
      const p2 = a.request('c2', draft)
      a.cancelConversation('c2')
      await expect(p2).resolves.toMatchObject({ approve: false, reason: 'Đã dừng.' })
      expect(events.filter((e) => (e as { closed?: boolean }).closed)).toHaveLength(2)
      expect(a.respond({ id: 'khong-co', approve: true })).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('combineToolSets', () => {
  it('gộp tool + hướng dẫn, bỏ phần rỗng', () => {
    expect(combineToolSets([null, null])).toBeNull()
    expect(
      combineToolSets([{ names: ['a'], context: 'A' }, null, { names: [], context: 'B' }])
    ).toEqual({ names: ['a'], context: 'A\n\nB' })
  })
})
