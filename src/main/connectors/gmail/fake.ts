import type { GmailBackend, GmailDraftInput, GmailMessage, GmailSummary } from './google'

const MAIL: GmailMessage[] = [
  {
    id: 'fake-msg-1',
    threadId: 'fake-thread-1',
    from: 'Lan Nguyễn <lan@example.com>',
    to: 'ban@example.com',
    subject: 'Lịch họp review sprint',
    date: 'Thu, 5 Nov 2026 09:12:00 +0700',
    snippet: 'Chiều thứ Sáu 15h họp review sprint nhé',
    unread: true,
    body: 'Chào bạn,\n\nChiều thứ Sáu 15h họp review sprint nhé. Nhớ chuẩn bị demo.\n\nLan',
    messageId: '<fake-1@example.com>',
    references: null,
    attachments: []
  },
  {
    id: 'fake-msg-2',
    threadId: 'fake-thread-2',
    from: 'Ngân hàng ABC <no-reply@abcbank.example>',
    to: 'ban@example.com',
    subject: 'Mã OTP của bạn là 482913',
    date: 'Thu, 5 Nov 2026 08:00:00 +0700',
    snippet: 'Mã OTP 482913, không chia sẻ cho ai',
    unread: false,
    body: 'Mã OTP 482913, không chia sẻ cho ai.',
    messageId: '<fake-2@example.com>',
    references: null,
    attachments: []
  }
]

/** CHỈ cho test e2e ở bản chưa đóng gói (MMC_FAKE_GMAIL=1): hộp thư giả, không gọi Google. */
export class FakeGmailBackend implements GmailBackend {
  private token = false
  readonly drafts: GmailDraftInput[] = []

  async connect(): Promise<{ email: string }> {
    await new Promise((r) => setTimeout(r, 50))
    this.token = true
    return { email: 'ban@example.com' }
  }

  cancelConnect(): void {}

  async disconnect(): Promise<void> {
    this.token = false
  }

  hasToken(): boolean {
    return this.token
  }

  async search(_query: string, max: number): Promise<GmailSummary[]> {
    return MAIL.slice(0, max).map(({ id, threadId, from, subject, date, snippet, unread }) => ({
      id,
      threadId,
      from,
      subject,
      date,
      snippet,
      unread
    }))
  }

  async read(id: string): Promise<GmailMessage> {
    const m = MAIL.find((x) => x.id === id)
    if (!m) throw new Error('gmail_404: not found')
    return m
  }

  async createDraft(draft: GmailDraftInput): Promise<{ id: string }> {
    this.drafts.push(draft)
    return { id: `fake-draft-${this.drafts.length}` }
  }
}
