import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_TELEGRAM_SETTINGS,
  type DraftApprovalRequest,
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
import { FakeTelegramBackend } from '../telegram/fake'
import { TelegramService } from '../telegram/service'

const log = { info: vi.fn(), warn: vi.fn() }
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

function approvalsWithLog() {
  const events: (DraftApprovalRequest | { id: string; closed: true })[] = []
  const approvals = new DraftApprovals({ emit: (e) => events.push(e), log })
  const lastRequest = (): DraftApprovalRequest =>
    events.filter((e): e is DraftApprovalRequest => !('closed' in e)).at(-1)!
  return { approvals, events, lastRequest }
}


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
