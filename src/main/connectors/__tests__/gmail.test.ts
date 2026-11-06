import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_GMAIL_SETTINGS,
  defaultAccountLabel,
  GMAIL_LEGACY_ACCOUNT_ID,
  gmailAccountUpdateSchema,
  gmailSettingsSchema,
  type DraftApprovalRequest,
  type GmailSettings
} from '@shared/connectors'
import { RateLimiter } from '../../agents/rateLimiter'
import { AppToolRegistry } from '../../tools/registry'
import { DraftApprovals } from '../approvals'
import { FakeGmailBackend } from '../gmail/fake'
import {
  buildAuthUrl,
  buildRawDraft,
  extractBody,
  GmailAuthExpired,
  gmailTokenFileName,
  GoogleGmailBackend,
  htmlToText,
  toMessage,
  type RawMessage
} from '../gmail/google'
import { GmailService, normalizeLabel } from '../gmail/service'

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
    expect(url.searchParams.get('prompt')).toBe('consent select_account')
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

  /** Token theo tài khoản: mỗi accountId một kho riêng (như file DPAPI riêng). */
  const tokenStores = () => {
    const stores = new Map<string, ReturnType<typeof memSecret>>()
    const of = (id: string) => {
      if (!stores.has(id)) stores.set(id, memSecret())
      return stores.get(id)!
    }
    return { of, stores }
  }

  function google(
    fetchImpl: (url: string, init?: RequestInit) => Response,
    opts: { state?: string } = {}
  ) {
    const tokens = tokenStores()
    const calls: string[] = []
    let sentState = ''
    let sentUrl = ''
    const backend = new GoogleGmailBackend({
      fetch: async (url, init) => {
        calls.push(`${init?.method ?? 'GET'} ${url}`)
        return fetchImpl(url, init)
      },
      // Trình duyệt mở link → Google trả lại đúng state trong link (trừ khi test muốn sai).
      openExternal: async (u) => {
        sentUrl = u
        sentState = new URL(u).searchParams.get('state')!
      },
      waitForCode: async (open) => {
        await open()
        return { code: 'CODE', state: opts.state ?? sentState }
      },
      cancelWait: vi.fn(),
      redirectUri: 'http://127.0.0.1:47823/auth/callback',
      clientId: () => 'id.apps.googleusercontent.com',
      clientSecret: () => 'secret',
      tokens: tokens.of
    })
    return { backend, tokens, calls, url: () => new URL(sentUrl) }
  }

  it('state không khớp → từ chối, không đổi code lấy token', async () => {
    const { backend, calls } = google(() => json(200, {}), { state: 'khac' })
    await expect(backend.authorize()).rejects.toThrow('state_mismatch')
    expect(calls.filter((c) => c.includes('token'))).toEqual([])
  })

  it('đăng nhập: đổi code (kèm code_verifier), biết email rồi mới lưu token vào đúng tài khoản', async () => {
    let tokenBody = ''
    const { backend, tokens, url } = google((u, init) => {
      if (u.includes('oauth2.googleapis.com/token')) {
        tokenBody = String(init?.body)
        return json(200, { access_token: 'AT', expires_in: 3600, refresh_token: 'RT' })
      }
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer AT')
      return json(200, { emailAddress: 'ban@gmail.com' })
    })
    const auth = await backend.authorize()
    expect(auth.email).toBe('ban@gmail.com')
    // Thêm tài khoản → Google cho chọn tài khoản, không tự dùng tài khoản đang đăng nhập.
    expect(url().searchParams.get('prompt')).toBe('consent select_account')
    expect(tokens.stores.size).toBe(0)
    auth.commit('acc1')
    expect(tokens.of('acc1').get()).toBe('RT')
    expect(backend.hasToken('acc1')).toBe(true)
    expect(backend.hasToken('acc2')).toBe(false)
    const params = new URLSearchParams(tokenBody)
    expect(params.get('grant_type')).toBe('authorization_code')
    expect(params.get('code_verifier')).toMatch(/^[\w-]{43,128}$/)
  })

  it('kết nối lại: gợi ý sẵn email (login_hint)', async () => {
    const { backend, url } = google((u) =>
      u.includes('token')
        ? json(200, { access_token: 'AT', expires_in: 3600, refresh_token: 'RT' })
        : json(200, { emailAddress: 'sv@truong.edu.vn' })
    )
    await backend.authorize('sv@truong.edu.vn')
    expect(url().searchParams.get('login_hint')).toBe('sv@truong.edu.vn')
    expect(url().searchParams.get('prompt')).toBe('consent')
  })

  it('mỗi tài khoản dùng refresh token của chính nó; một tài khoản hết hạn không ảnh hưởng tài khoản khác', async () => {
    const used: string[] = []
    const { backend, tokens } = google((u, init) => {
      if (u.includes('oauth2.googleapis.com/token')) {
        const rt = new URLSearchParams(String(init?.body)).get('refresh_token')!
        used.push(rt)
        return rt === 'RT-het'
          ? json(400, { error: 'invalid_grant' })
          : json(200, { access_token: `AT-${rt}`, expires_in: 3600 })
      }
      return json(200, { messages: [] })
    })
    tokens.of('a').set('RT-a')
    tokens.of('b').set('RT-het')
    await expect(backend.search('a', '', 5)).resolves.toEqual([])
    await expect(backend.search('b', '', 5)).rejects.toBeInstanceOf(GmailAuthExpired)
    expect(used).toEqual(['RT-a', 'RT-het'])
    expect(tokens.of('b').has()).toBe(false)
    expect(tokens.of('a').get()).toBe('RT-a')
    // access token của "a" vẫn còn trong bộ nhớ → không xin lại.
    await backend.search('a', '', 5)
    expect(used).toHaveLength(2)
  })

  it('ngắt một tài khoản: xoá token của riêng nó dù thu hồi phía Google lỗi mạng', async () => {
    const { backend, tokens } = google(() => {
      throw new Error('offline')
    })
    tokens.of('a').set('RT-a')
    tokens.of('b').set('RT-b')
    await backend.disconnect('a')
    expect(tokens.of('a').has()).toBe(false)
    expect(tokens.of('b').get()).toBe('RT-b')
  })
})

describe('chuyển cài đặt Gmail một-tài-khoản → danh sách', () => {
  const v1 = {
    enabled: true,
    clientId: 'id.apps.googleusercontent.com',
    testingMode: true,
    email: 'ban@gmail.com',
    connectedAt: 123,
    skipSensitive: false,
    blockedSenders: ['sep@x.com']
  }

  it('tài khoản đang kết nối → một dòng id "primary" (dùng lại file token cũ), giữ lọc riêng tư', () => {
    const s = gmailSettingsSchema.parse(v1)
    expect(s).toEqual({
      enabled: true,
      clientId: 'id.apps.googleusercontent.com',
      testingMode: true,
      accounts: [
        {
          id: GMAIL_LEGACY_ACCOUNT_ID,
          email: 'ban@gmail.com',
          label: 'ban',
          enabled: true,
          connectedAt: 123,
          skipSensitive: false,
          blockedSenders: ['sep@x.com']
        }
      ]
    })
    // Đọc lại bản đã chuyển → giữ nguyên.
    expect(gmailSettingsSchema.parse(s)).toEqual(s)
  })

  it('chưa kết nối → danh sách rỗng; mặc định hợp lệ', () => {
    expect(
      gmailSettingsSchema.parse({ ...v1, email: null, connectedAt: null }).accounts
    ).toEqual([])
    expect(gmailSettingsSchema.parse(DEFAULT_GMAIL_SETTINGS)).toEqual(DEFAULT_GMAIL_SETTINGS)
    expect(defaultAccountLabel('nguyen.van-a+x@gmail.com')).toBe('nguyen.van-ax')
  })

  it('tài khoản chuyển sang dùng lại file token cũ; tài khoản mới mỗi cái một file', () => {
    expect(gmailTokenFileName(GMAIL_LEGACY_ACCOUNT_ID)).toBe('gmail-refresh-token.bin')
    expect(gmailTokenFileName('a1b2c3')).toBe('gmail-refresh-token-a1b2c3.bin')
  })

  it('service: tài khoản chuyển sang vẫn "Đã kết nối" với token cũ, không phải đăng nhập lại', () => {
    const g = gmailService(gmailSettingsSchema.parse(v1))
    g.backend.seed(GMAIL_LEGACY_ACCOUNT_ID, 'ban@example.com')
    expect(g.service.status().accounts).toMatchObject([
      { id: 'primary', email: 'ban@gmail.com', connection: 'connected' }
    ])
  })
})

function approvalsWithLog() {
  const events: (DraftApprovalRequest | { id: string; closed: true })[] = []
  const approvals = new DraftApprovals({ emit: (e) => events.push(e), log })
  const lastRequest = (): DraftApprovalRequest =>
    events.filter((e): e is DraftApprovalRequest => !('closed' in e)).at(-1)!
  return { approvals, events, lastRequest }
}

function gmailService(initial?: GmailSettings) {
  let settings: GmailSettings = initial ?? {
    ...DEFAULT_GMAIL_SETTINGS,
    enabled: true,
    clientId: 'id.apps.googleusercontent.com'
  }
  const backend = new FakeGmailBackend()
  const { approvals, events, lastRequest } = approvalsWithLog()
  let n = 0
  const service = new GmailService({
    getSettings: () => settings,
    setSettings: (s) => void (settings = s),
    backend,
    clientSecret: memSecret('secret'),
    approvals,
    limiter: new RateLimiter(() => 60),
    emit: () => undefined,
    log,
    now: () => 1_000_000,
    newId: () => `acc${++n}`
  })
  const registry = new AppToolRegistry()
  service.registerTools(registry)
  const call = (name: string, input: unknown) =>
    registry.call(name, input, { conversationId: 'c1' })
  /** Thêm 3 tài khoản giả (cá nhân, trường, công việc) và đặt tên gọi. */
  const addThree = async () => {
    for (let i = 0; i < 3; i++) await service.connect()
    const names = ['Cá nhân', 'Trường', 'Công việc']
    for (const [i, a] of service.status().accounts.entries())
      service.updateAccount({ ...a, label: names[i] })
  }
  const account = (label: string) => service.status().accounts.find((a) => a.label === label)!
  return {
    service,
    backend,
    registry,
    call,
    approvals,
    events,
    lastRequest,
    addThree,
    account,
    settings: () => settings
  }
}

describe('GmailService — nhiều tài khoản', () => {
  it('tắt / chưa có tài khoản → không có tool; thêm tài khoản → có 3 tool + danh sách tài khoản', async () => {
    const g = gmailService({ ...DEFAULT_GMAIL_SETTINGS, clientId: 'id.apps.googleusercontent.com' })
    expect(g.service.toolsFor()).toBeNull()
    g.service.setEnabled(true)
    expect(g.service.toolsFor()).toBeNull()
    expect(g.registry.available({ conversationId: 'c1' })).toEqual([])
    await g.service.connect()
    expect(g.service.status().accounts).toEqual([
      expect.objectContaining({
        id: 'acc1',
        email: 'ban@example.com',
        label: 'ban',
        enabled: true,
        connection: 'connected',
        connectedAt: 1_000_000,
        expiresAt: 1_000_000 + 7 * 24 * 60 * 60 * 1000
      })
    ])
    const tools = g.service.toolsFor()!
    expect(tools.names).toEqual(['gmail_search', 'gmail_read', 'gmail_draft'])
    expect(tools.context).toContain('"ban" (ban@example.com)')
  })

  it('thêm 3 tài khoản cùng một OAuth client, mỗi tài khoản token riêng; thêm trùng email = kết nối lại, không nhân đôi', async () => {
    const g = gmailService()
    await g.addThree()
    expect(g.service.status().accounts.map((a) => [a.id, a.email, a.label])).toEqual([
      ['acc1', 'ban@example.com', 'Cá nhân'],
      ['acc2', 'sv@truong.example.edu', 'Trường'],
      ['acc3', 'cv@congty.example.com', 'Công việc']
    ])
    expect(['acc1', 'acc2', 'acc3'].every((id) => g.backend.hasToken(id))).toBe(true)
    // Kết nối lại "Trường": giữ tên gọi + cài đặt.
    await g.service.connect('acc2')
    expect(g.service.status().accounts).toHaveLength(3)
    expect(g.account('Trường').id).toBe('acc2')
  })

  it('kết nối lại nhưng đăng nhập nhầm tài khoản khác → báo lỗi, không lưu token', async () => {
    const g = gmailService()
    await g.service.connect()
    await g.backend.disconnect('acc1')
    const authorize = vi.spyOn(g.backend, 'authorize')
    authorize.mockImplementationOnce(async () => ({
      email: 'khac@example.com',
      commit: () => {
        throw new Error('không được lưu')
      },
      discard: async () => undefined
    }))
    await expect(g.service.connect('acc1')).rejects.toThrow('wrong_account')
    expect(authorize).toHaveBeenCalledWith('ban@example.com')
    expect(g.service.status().accounts).toMatchObject([{ id: 'acc1', connection: 'expired' }])
  })

  it('tóm tắt chưa đọc: gộp mọi tài khoản đang bật, ghi rõ tài khoản; tài khoản tắt không đọc', async () => {
    const g = gmailService()
    await g.addThree()
    g.service.updateAccount({ ...g.account('Công việc'), enabled: false })
    const r = await g.call('gmail_search', { query: 'is:unread' })
    const out = text(r)
    expect(r.isError).toBeFalsy()
    expect(out).toContain('Tài khoản "Cá nhân" (ban@example.com): 1 thư.')
    expect(out).toContain('Tài khoản "Trường" (sv@truong.example.edu): 2 thư.')
    expect(out).toContain('id=acc2:fake-sch-1')
    expect(out).not.toContain('Công việc')
    expect(out).not.toContain('Báo cáo tuần')
    expect(g.service.toolsFor()!.context).not.toContain('cv@congty')
  })

  it('hỏi đích danh "Trường" (không dấu / hoa thường cũng được) → chỉ đọc tài khoản đó', async () => {
    const g = gmailService()
    await g.addThree()
    const search = vi.spyOn(g.backend, 'search')
    for (const name of ['Trường', 'truong', 'sv@truong.example.edu']) {
      const out = text(await g.call('gmail_search', { account: name }))
      expect(out).toContain('Lịch thi cuối kỳ')
      expect(out).not.toContain('Lịch họp review sprint')
    }
    expect(new Set(search.mock.calls.map((c) => c[0]))).toEqual(new Set(['acc2']))
    const missing = await g.call('gmail_search', { account: 'Không có' })
    expect(missing.isError).toBe(true)
    expect(text(missing)).toContain('"Trường"')
  })

  it('đọc thư: id gắn tài khoản; thư của tài khoản bị tắt → từ chối; lọc riêng tư theo từng tài khoản', async () => {
    const g = gmailService()
    await g.addThree()
    expect(text(await g.call('gmail_read', { id: 'acc2:fake-sch-1' }))).toContain(
      'Tài khoản: "Trường"'
    )
    // Thư OTP: tài khoản "Cá nhân" ẩn (mặc định), cùng thư ở tài khoản tắt lọc → đọc được.
    expect((await g.call('gmail_read', { id: 'acc1:fake-msg-2' })).isError).toBe(true)
    // Chặn người gửi chỉ ở "Trường".
    g.service.updateAccount({ ...g.account('Trường'), blockedSenders: ['truong.example.edu'] })
    expect((await g.call('gmail_read', { id: 'acc2:fake-sch-1' })).isError).toBe(true)
    expect(text(await g.call('gmail_search', { account: 'Trường' }))).toContain('2 thư bị ẩn')
    expect(text(await g.call('gmail_search', { account: 'Cá nhân' }))).toContain('1 thư bị ẩn')
    g.service.updateAccount({ ...g.account('Cá nhân'), skipSensitive: false })
    expect(text(await g.call('gmail_read', { id: 'acc1:fake-msg-2' }))).toContain('482913')
    g.service.updateAccount({ ...g.account('Cá nhân'), enabled: false })
    expect((await g.call('gmail_read', { id: 'acc1:fake-msg-1' })).isError).toBe(true)
    // id thiếu tài khoản → zod từ chối.
    expect((await g.call('gmail_read', { id: 'fake-msg-1' })).isError).toBe(true)
  })

  it('nháp trả lời: lưu ĐÚNG tài khoản chứa thư gốc (bỏ qua account khác), hộp duyệt ghi rõ tài khoản', async () => {
    const g = gmailService()
    await g.addThree()
    const pending = g.call('gmail_draft', {
      body: 'Dạ em đã xem lịch thi',
      reply_to_id: 'acc2:fake-sch-1',
      account: 'Cá nhân'
    })
    await vi.waitFor(() => expect(g.lastRequest()).toBeTruthy())
    expect(g.lastRequest()).toMatchObject({
      service: 'gmail',
      target: 'daotao@truong.example.edu',
      subject: 'Re: Lịch thi cuối kỳ',
      account: { id: 'acc2', email: 'sv@truong.example.edu', label: 'Trường' }
    })
    g.approvals.respond({ id: g.lastRequest().id, approve: true, body: 'Dạ em cảm ơn' })
    const r = await pending
    expect(text(r)).toContain('CHƯA gửi')
    expect(text(r)).toContain('sv@truong.example.edu')
    expect(g.backend.drafts).toHaveLength(1)
    expect(g.backend.drafts[0]).toMatchObject({
      accountId: 'acc2',
      email: 'sv@truong.example.edu',
      body: 'Dạ em cảm ơn'
    })
    expect(g.backend.drafts[0].replyTo?.threadId).toBe('fake-sch-thread-1')
  })

  it('nháp thư mới: nhiều tài khoản mà không nói tài khoản nào → hỏi lại; có account → đúng tài khoản', async () => {
    const g = gmailService()
    await g.addThree()
    const ask = await g.call('gmail_draft', { to: ['a@b.com'], subject: 'x', body: 'y' })
    expect(ask.isError).toBe(true)
    expect(text(ask)).toContain('Hỏi người dùng')
    expect(g.events).toEqual([])
    const pending = g.call('gmail_draft', {
      to: ['a@b.com'],
      subject: 'x',
      body: 'y',
      account: 'Công việc'
    })
    await vi.waitFor(() => expect(g.events.length).toBe(1))
    expect(g.lastRequest().account?.email).toBe('cv@congty.example.com')
    g.approvals.respond({ id: g.lastRequest().id, approve: true })
    await pending
    expect(g.backend.drafts[0].accountId).toBe('acc3')
  })

  it('tắt / ngắt một tài khoản trong lúc chờ duyệt → huỷ nháp của riêng tài khoản đó', async () => {
    const g = gmailService()
    await g.addThree()
    const school = g.call('gmail_draft', { body: 'a', reply_to_id: 'acc2:fake-sch-1' })
    const work = g.call('gmail_draft', { body: 'b', reply_to_id: 'acc3:fake-job-1' })
    await vi.waitFor(() => expect(g.events.length).toBe(2))
    const workReq = g.lastRequest()
    await g.service.disconnect('acc2')
    expect((await school).isError).toBe(true)
    g.approvals.respond({ id: workReq.id, approve: true })
    expect((await work).isError).toBeFalsy()
    expect(g.backend.drafts.map((d) => d.accountId)).toEqual(['acc3'])
    expect(g.service.status().accounts.map((a) => a.label)).toEqual(['Cá nhân', 'Công việc'])
    expect(g.backend.hasToken('acc2')).toBe(false)
  })

  it('giới hạn 60 lần/giờ tính riêng từng tài khoản', async () => {
    const g = gmailService()
    await g.addThree()
    for (let i = 0; i < 60; i++) await g.call('gmail_search', { account: 'Trường', max: 1 })
    const r = await g.call('gmail_search', { account: 'Trường', max: 1 })
    expect(r.isError).toBe(true)
    expect(text(r)).toContain('quá nhiều')
    expect((await g.call('gmail_read', { id: 'acc2:fake-sch-1' })).isError).toBe(true)
    // Tài khoản khác vẫn đọc được; tìm gộp vẫn trả thư của tài khoản còn hạn mức.
    expect((await g.call('gmail_search', { account: 'Cá nhân', max: 1 })).isError).toBeFalsy()
    const all = text(await g.call('gmail_search', {}))
    expect(all).toContain('Tài khoản "Trường" (sv@truong.example.edu): đã đọc quá nhiều')
    expect(all).toContain('Báo cáo tuần')
  })

  it('một tài khoản hết hạn: vẫn đọc tài khoản khác, hướng dẫn nhắc kết nối lại; hết cả → chỉ còn lời nhắc', async () => {
    const g = gmailService()
    await g.addThree()
    await g.backend.disconnect('acc2') // giả lập Google thu hồi token
    expect(g.account('Trường').connection).toBe('expired')
    expect(g.service.toolsFor()!.context).toMatch(/"Trường".*HẾT HẠN/)
    const all = text(await g.call('gmail_search', {}))
    expect(all).toContain('Lịch họp review sprint')
    expect(all).toMatch(/"Trường".*hết hạn đăng nhập/)
    expect((await g.call('gmail_search', { account: 'Trường' })).isError).toBe(true)
    await g.backend.disconnect('acc1')
    await g.backend.disconnect('acc3')
    expect(g.service.toolsFor()).toMatchObject({ names: [] })
    expect(g.service.toolsFor()!.context).toContain('kết nối lại')
  })

  it('tên gọi: không trùng (bỏ qua dấu / hoa thường); id lạ → lỗi', async () => {
    const g = gmailService()
    await g.addThree()
    expect(() => g.service.updateAccount({ ...g.account('Công việc'), label: 'truong' })).toThrow(
      'label_taken'
    )
    expect(() =>
      g.service.updateAccount({ ...g.account('Công việc'), id: 'khongco' })
    ).toThrow('account_not_found')
    expect(gmailAccountUpdateSchema.safeParse({ ...g.account('Trường'), label: 'a"b' }).success).toBe(
      false
    )
    expect(normalizeLabel('  Trường  Đại học ')).toBe('truong dai hoc')
  })

  it('đổi client ID → ngắt mọi tài khoản (token thuộc client cũ)', async () => {
    const g = gmailService()
    await g.addThree()
    await g.service.setCredentials('khac.apps.googleusercontent.com')
    expect(g.service.status().accounts).toEqual([])
    expect(g.backend.hasToken('acc1')).toBe(false)
  })
})
