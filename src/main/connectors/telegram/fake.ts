import type { TelegramAccount } from '@shared/connectors'
import type { RawDialog, RawTgMessage, TelegramBackend } from './backend'

const NOW = Date.UTC(2026, 10, 5, 3, 0, 0)

const DIALOGS: RawDialog[] = [
  { id: '1001', title: 'Nhóm Dự án Game', username: null, kind: 'group', unread: 3, lastAt: NOW },
  {
    id: '1002',
    title: 'Lan Nguyễn',
    username: 'lan_ng',
    kind: 'user',
    unread: 1,
    lastAt: NOW - 60_000
  },
  {
    id: '1003',
    title: 'VCB Digibank',
    username: 'vcb_bot',
    kind: 'bot',
    unread: 2,
    lastAt: NOW - 120_000
  },
  {
    id: '777000',
    title: 'Telegram',
    username: null,
    kind: 'user',
    unread: 1,
    lastAt: NOW - 180_000
  }
]

const MESSAGES: Record<string, RawTgMessage[]> = {
  '1001': [
    {
      id: 3,
      date: NOW,
      sender: 'Minh',
      out: false,
      text: 'Build mới đã lên, mọi người test giúp nhé',
      media: null
    },
    { id: 2, date: NOW - 30_000, sender: 'Tôi', out: true, text: 'Ok để mình xem', media: null },
    { id: 1, date: NOW - 60_000, sender: 'Minh', out: false, text: '', media: 'ảnh' }
  ],
  '1002': [
    {
      id: 1,
      date: NOW - 60_000,
      sender: 'Lan Nguyễn',
      out: false,
      text: 'Mai họp lúc mấy giờ vậy?',
      media: null
    }
  ],
  '1003': [
    {
      id: 1,
      date: NOW - 120_000,
      sender: 'VCB Digibank',
      out: false,
      text: 'Số dư TK thay đổi +5.000.000',
      media: null
    }
  ],
  '777000': [
    {
      id: 1,
      date: NOW - 180_000,
      sender: 'Telegram',
      out: false,
      text: 'Login code: 12345',
      media: null
    }
  ]
}

/** CHỈ cho test e2e ở bản chưa đóng gói (MMC_FAKE_TELEGRAM=1). Mã đăng nhập: 12345; số kết thúc bằng 2 → cần mật khẩu "pw". */
export class FakeTelegramBackend implements TelegramBackend {
  private session = false
  private pending: { phone: string; needPassword: boolean } | null = null
  readonly drafts: { chatId: string; text: string }[] = []

  async sendCode(phone: string): Promise<void> {
    this.pending = { phone, needPassword: phone.trim().endsWith('2') }
  }

  async signIn(code: string): Promise<'ok' | 'password_needed'> {
    if (!this.pending) throw new Error('no_login')
    if (code !== '12345') throw new Error('code_invalid')
    if (this.pending.needPassword) return 'password_needed'
    this.done()
    return 'ok'
  }

  async checkPassword(password: string): Promise<void> {
    if (!this.pending) throw new Error('no_login')
    if (password !== 'pw') throw new Error('password_invalid')
    this.done()
  }

  async restore(): Promise<boolean> {
    return this.session
  }

  async me(): Promise<TelegramAccount> {
    return { name: 'Bạn Thử Nghiệm', username: 'ban_test', phone: '+84•••••678' }
  }

  async dialogs(limit: number): Promise<RawDialog[]> {
    return DIALOGS.slice(0, limit)
  }

  async messages(chatId: string, limit: number): Promise<RawTgMessage[]> {
    return (MESSAGES[chatId] ?? []).slice(0, limit)
  }

  async saveDraft(chatId: string, text: string): Promise<void> {
    this.drafts.push({ chatId, text })
  }

  async logout(): Promise<void> {
    this.session = false
    this.pending = null
  }

  async cancelLogin(): Promise<void> {
    this.pending = null
  }

  hasSession(): boolean {
    return this.session
  }

  private done(): void {
    this.pending = null
    this.session = true
  }
}
