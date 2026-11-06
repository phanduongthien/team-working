import {
  GmailAuthExpired,
  type GmailAuthorization,
  type GmailBackend,
  type GmailDraftInput,
  type GmailMessage,
  type GmailSummary
} from './google'

const mail = (
  m: Omit<GmailMessage, 'references' | 'attachments' | 'to'> & { to: string }
): GmailMessage => ({ ...m, references: null, attachments: [] })

/** Hộp thư giả theo email. Không có gợi ý email → lần lượt "đăng nhập" tài khoản chưa nối. */
const MAILBOXES: Record<string, GmailMessage[]> = {
  'ban@example.com': [
    mail({
      id: 'fake-msg-1',
      threadId: 'fake-thread-1',
      from: 'Lan Nguyễn <lan@example.com>',
      to: 'ban@example.com',
      subject: 'Lịch họp review sprint',
      date: 'Thu, 5 Nov 2026 09:12:00 +0700',
      snippet: 'Chiều thứ Sáu 15h họp review sprint nhé',
      unread: true,
      body: 'Chào bạn,\n\nChiều thứ Sáu 15h họp review sprint nhé. Nhớ chuẩn bị demo.\n\nLan',
      messageId: '<fake-1@example.com>'
    }),
    mail({
      id: 'fake-msg-2',
      threadId: 'fake-thread-2',
      from: 'Ngân hàng ABC <no-reply@abcbank.example>',
      to: 'ban@example.com',
      subject: 'Mã OTP của bạn là 482913',
      date: 'Thu, 5 Nov 2026 08:00:00 +0700',
      snippet: 'Mã OTP 482913, không chia sẻ cho ai',
      unread: false,
      body: 'Mã OTP 482913, không chia sẻ cho ai.',
      messageId: '<fake-2@example.com>'
    })
  ],
  'sv@truong.example.edu': [
    mail({
      id: 'fake-sch-1',
      threadId: 'fake-sch-thread-1',
      from: 'Phòng Đào tạo <daotao@truong.example.edu>',
      to: 'sv@truong.example.edu',
      subject: 'Lịch thi cuối kỳ',
      date: 'Thu, 5 Nov 2026 10:00:00 +0700',
      snippet: 'Lịch thi cuối kỳ học kỳ 1 đã có trên cổng sinh viên',
      unread: true,
      body: 'Lịch thi cuối kỳ học kỳ 1 đã có trên cổng sinh viên. Thi môn Lập trình web ngày 20/12.',
      messageId: '<fake-sch-1@truong.example.edu>'
    }),
    mail({
      id: 'fake-sch-2',
      threadId: 'fake-sch-thread-2',
      from: 'Câu lạc bộ <clb@truong.example.edu>',
      to: 'sv@truong.example.edu',
      subject: 'Mời họp câu lạc bộ',
      date: 'Wed, 4 Nov 2026 18:00:00 +0700',
      snippet: 'Tối thứ Bảy họp CLB ở phòng A1',
      unread: true,
      body: 'Tối thứ Bảy họp CLB ở phòng A1.',
      messageId: '<fake-sch-2@truong.example.edu>'
    })
  ],
  'cv@congty.example.com': [
    mail({
      id: 'fake-job-1',
      threadId: 'fake-job-thread-1',
      from: 'Sếp <sep@congty.example.com>',
      to: 'cv@congty.example.com',
      subject: 'Báo cáo tuần',
      date: 'Thu, 5 Nov 2026 11:00:00 +0700',
      snippet: 'Gửi anh báo cáo tuần trước thứ Sáu',
      unread: true,
      body: 'Gửi anh báo cáo tuần trước thứ Sáu nhé.',
      messageId: '<fake-job-1@congty.example.com>'
    })
  ]
}

/** CHỈ cho test e2e ở bản chưa đóng gói (MMC_FAKE_GMAIL=1): hộp thư giả, không gọi Google. */
export class FakeGmailBackend implements GmailBackend {
  /** accountId → email. */
  private tokens = new Map<string, string>()
  readonly drafts: (GmailDraftInput & { accountId: string; email: string })[] = []

  async authorize(loginHint?: string): Promise<GmailAuthorization> {
    await new Promise((r) => setTimeout(r, 50))
    const used = new Set(this.tokens.values())
    const email = loginHint ?? Object.keys(MAILBOXES).find((e) => !used.has(e))
    if (!email) throw new Error('access_denied')
    return {
      email,
      commit: (accountId) => void this.tokens.set(accountId, email),
      discard: async () => undefined
    }
  }

  cancelConnect(): void {}

  async disconnect(accountId: string): Promise<void> {
    this.tokens.delete(accountId)
  }

  hasToken(accountId: string): boolean {
    return this.tokens.has(accountId)
  }

  /** Test: giả lập token đã có sẵn trên máy (vd tài khoản chuyển từ bản cũ). */
  seed(accountId: string, email: string): void {
    this.tokens.set(accountId, email)
  }

  async search(accountId: string, query: string, max: number): Promise<GmailSummary[]> {
    const unreadOnly = /is:unread/.test(query)
    return this.box(accountId)
      .filter((m) => !unreadOnly || m.unread)
      .slice(0, max)
      .map(({ id, threadId, from, subject, date, snippet, unread }) => ({
        id,
        threadId,
        from,
        subject,
        date,
        snippet,
        unread
      }))
  }

  async read(accountId: string, id: string): Promise<GmailMessage> {
    const m = this.box(accountId).find((x) => x.id === id)
    if (!m) throw new Error('gmail_404: not found')
    return m
  }

  async createDraft(accountId: string, draft: GmailDraftInput): Promise<{ id: string }> {
    this.drafts.push({ ...draft, accountId, email: this.tokens.get(accountId) ?? '' })
    return { id: `fake-draft-${this.drafts.length}` }
  }

  private box(accountId: string): GmailMessage[] {
    const email = this.tokens.get(accountId)
    if (!email) throw new GmailAuthExpired()
    return MAILBOXES[email] ?? []
  }
}
