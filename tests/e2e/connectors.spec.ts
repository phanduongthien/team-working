import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'
import { goTo, waitForStartup } from './helpers'

// Gmail / Telegram — chạy được khi KHÔNG có Claude CLI và không có tài khoản thật:
// MMC_FAKE_GMAIL / MMC_FAKE_TELEGRAM (hộp thư + Telegram giả, chỉ ở bản chưa đóng gói),
// MMC_FAKE_CHAT (Claude giả; tin nhắn "FAKE_TOOL:<tên> {json}" gọi tool của app như CLI thật).
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-connectors-e2e-'))
  app = await electron.launch({
    args: [ROOT],
    env: {
      ...process.env,
      TEAM_WORKING_USER_DATA: userData,
      MMC_FAKE_CHAT: '1',
      MMC_FAKE_GMAIL: '1',
      MMC_FAKE_TELEGRAM: '1'
    }
  })
  page = await app.firstWindow()
  await waitForStartup(page)
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const box = (): ReturnType<Page['getByRole']> => page.getByRole('textbox', { name: /Nhắn cho/ })
/** Gửi tin và chờ có tin trả lời MỚI — tránh khẳng định nhầm trên câu trả lời của lượt trước. */
const ask = async (text: string): Promise<void> => {
  await goTo(page, '#/', box())
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })
  const replies = page.getByTestId('message-assistant')
  const before = await replies.count()
  await box().fill(text)
  await box().press('Enter')
  await expect(replies).toHaveCount(before + 1, { timeout: 20_000 })
}
const lastReply = (): ReturnType<Page['getByTestId']> =>
  page.getByTestId('message-assistant').last()

test('mặc định tắt: trợ lý không có tool Gmail / Telegram', async () => {
  await goTo(page, '#/settings', page.getByTestId('open-connectors'))
  await page.getByTestId('open-connectors').click()
  await expect(page.getByTestId('gmail-enable')).not.toBeChecked()
  await expect(page.getByTestId('tg-enable')).not.toBeChecked()

  await ask('FAKE_TOOL:gmail_search {}')
  const reply = lastReply()
  await expect(reply).toContainText('Mizuki (giả lập) đã nhận', { timeout: 20_000 })
  await expect(reply).not.toContainText('KẾT QUẢ TOOL')
})

test('Gmail: nhập OAuth client, kết nối, thư OTP bị ẩn, nháp phải duyệt và sửa được', async () => {
  await goTo(page, '#/connectors', page.getByTestId('gmail-enable'))
  await page.getByTestId('gmail-enable').check()
  await expect(page.getByTestId('gmail-connect')).toBeDisabled()

  await page.getByTestId('gmail-client-id').fill('sai-dinh-dang')
  await page.getByTestId('gmail-save').click()
  await expect(page.getByTestId('gmail-section').getByRole('alert')).toContainText('apps.googleusercontent.com')

  await page.getByTestId('gmail-client-id').fill('123-abc.apps.googleusercontent.com')
  await page.getByTestId('gmail-client-secret').fill('GOCSPX-test')
  await page.getByTestId('gmail-save').click()
  await expect(page.getByTestId('gmail-client-secret')).toHaveAttribute('placeholder', /Đã lưu/)
  await page.getByTestId('gmail-connect').click()
  await expect(page.getByTestId('gmail-connection')).toHaveAttribute('data-state', 'connected')
  await expect(page.getByTestId('gmail-email')).toContainText('ban@example.com')
  await expect(page.getByTestId('gmail-expiry')).toContainText('7 ngày')

  // Thử đọc tại máy: thư OTP hiện gạch ngang (trợ lý không thấy).
  await page.getByTestId('gmail-preview').click()
  const list = page.getByTestId('gmail-preview-list')
  await expect(list).toContainText('Lịch họp review sprint')
  await expect(list.locator('li.line-through')).toContainText('Mã OTP')

  await ask('FAKE_TOOL:gmail_search {}')
  await expect(lastReply()).toContainText('KẾT QUẢ TOOL', { timeout: 20_000 })
  await expect(lastReply()).toContainText('Lịch họp review sprint')
  await expect(lastReply()).toContainText('1 thư bị ẩn')
  await expect(lastReply()).not.toContainText('482913')

  await ask('FAKE_TOOL:gmail_draft {"reply_to_id":"fake-msg-1","body":"Dạ em sẽ có mặt"}')
  const dialog = page.getByTestId('draft-approval')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('draft-target')).toHaveText('lan@example.com')
  await expect(page.getByTestId('draft-body')).toHaveValue('Dạ em sẽ có mặt')
  await page.getByTestId('draft-body').fill('Dạ em sẽ có mặt lúc 15h')
  await page.getByTestId('draft-approve').click()
  await expect(dialog).toBeHidden()
  await expect(lastReply()).toContainText('CHƯA gửi', { timeout: 20_000 })
  await expect(lastReply()).toContainText('Người dùng đã sửa')

  await ask('FAKE_TOOL:gmail_draft {"to":["a@b.com"],"subject":"x","body":"y"}')
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('draft-reject').click()
  await expect(lastReply()).toContainText('LỖI TOOL', { timeout: 20_000 })
  await expect(lastReply()).toContainText('từ chối')
})

test('Telegram: đăng nhập có mật khẩu 2 bước, chỉ đọc chat đã chọn, chat hệ thống luôn chặn', async () => {
  await goTo(page, '#/connectors', page.getByTestId('tg-enable'))
  await page.getByTestId('tg-enable').check()
  await page.getByTestId('tg-api-id').fill('12345')
  await page.getByTestId('tg-api-hash').fill('0123456789abcdef0123456789abcdef')
  await page.getByTestId('tg-save').click()

  const input = page.getByTestId('tg-login-input')
  await input.fill('+84 912 345 672')
  await page.getByTestId('tg-login-submit').click()
  await expect(page.getByTestId('tg-connection')).toHaveAttribute('data-state', 'code_sent')
  await input.fill('00000')
  await page.getByTestId('tg-login-submit').click()
  await expect(page.getByTestId('telegram-section').getByRole('alert')).toContainText('Mã không đúng')
  await input.fill('12345')
  await page.getByTestId('tg-login-submit').click()
  await expect(page.getByTestId('tg-connection')).toHaveAttribute('data-state', 'password_needed')
  await expect(input).toHaveAttribute('type', 'password')
  await input.fill('pw')
  await page.getByTestId('tg-login-submit').click()
  await expect(page.getByTestId('tg-connection')).toHaveAttribute('data-state', 'connected')
  await expect(page.getByTestId('tg-account')).toContainText('Bạn Thử Nghiệm')

  // Mặc định: chỉ chat tôi chọn, chưa chọn chat nào; chat hệ thống bị khoá.
  await expect(page.getByTestId('tg-mode')).toHaveValue('allowlist')
  await expect(page.getByTestId('tg-chat-1001').getByRole('checkbox')).not.toBeChecked()
  await expect(page.getByTestId('tg-chat-777000').getByRole('checkbox')).toBeDisabled()
  await expect(page.getByTestId('tg-chat-1003')).toContainText('nhạy cảm')

  await ask('FAKE_TOOL:telegram_read {"chat":"1001"}')
  await expect(lastReply()).toContainText('LỖI TOOL', { timeout: 20_000 })

  await goTo(page, '#/connectors', page.getByTestId('tg-chat-1001'))
  await page.getByTestId('tg-chat-1001').getByRole('checkbox').check()
  await expect(page.getByTestId('tg-chat-1001').getByRole('checkbox')).toBeChecked()

  await ask('FAKE_TOOL:telegram_read {"chat":"1001"}')
  await expect(lastReply()).toContainText('Build mới đã lên', { timeout: 20_000 })
  await ask('FAKE_TOOL:telegram_read {"chat":"777000"}')
  await expect(lastReply()).toContainText('LỖI TOOL', { timeout: 20_000 })
  await expect(lastReply()).not.toContainText('Login code')

  await ask('FAKE_TOOL:telegram_draft {"chat":"1001","text":"Ok mình test chiều nay"}')
  await expect(page.getByTestId('draft-approval')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('draft-target')).toHaveText('Nhóm Dự án Game')
  await page.getByTestId('draft-approve').click()
  await expect(lastReply()).toContainText('Đã lưu nháp', { timeout: 20_000 })
})

test('đăng xuất Telegram + ngắt Gmail: xoá phiên, trợ lý mất tool', async () => {
  await goTo(page, '#/connectors', page.getByTestId('tg-logout'))
  await page.getByTestId('tg-logout').click()
  await expect(page.getByTestId('tg-connection')).toHaveAttribute('data-state', 'disconnected')
  await expect(page.getByTestId('tg-chats')).toBeHidden()
  await page.getByTestId('gmail-disconnect').click()
  await expect(page.getByTestId('gmail-connection')).toHaveAttribute('data-state', 'disconnected')

  await ask('FAKE_TOOL:telegram_chats {}')
  await expect(lastReply()).toContainText('Mizuki (giả lập) đã nhận', { timeout: 20_000 })
  await expect(lastReply()).not.toContainText('KẾT QUẢ TOOL')
})
