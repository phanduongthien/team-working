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

// Giọng nói — chạy được khi KHÔNG có Claude CLI và KHÔNG có Python: MMC_FAKE_CHAT + MMC_FAKE_VOICE
// (micro giả của Chromium, chép lời / đọc giả lập; chỉ bản chưa đóng gói).
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-voice-e2e-'))
  app = await electron.launch({
    args: [ROOT],
    env: {
      ...process.env,
      TEAM_WORKING_USER_DATA: userData,
      MMC_FAKE_CHAT: '1',
      MMC_FAKE_VOICE: '1'
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

test('mặc định tắt: không có nút micro / loa', async () => {
  await goTo(page, '#/', box())
  await expect(page.getByTestId('mic-button')).toHaveCount(0)
})

test('cài đặt: bật giọng nói, báo dung lượng tải, mặc định "điền vào ô nhập"', async () => {
  await goTo(page, '#/settings', page.getByTestId('voice-settings'))
  await page.getByTestId('voice-enable').check()
  await expect(page.getByLabel('Nói xong', { exact: true })).toHaveValue('fill')
  await expect(page.getByLabel('Model nhận giọng nói', { exact: true })).toHaveValue('auto')
  await expect(page.getByTestId('voice-settings')).toContainText('Không khoá ngôn ngữ')
  await expect(page.getByTestId('voice-settings')).toContainText('dịch vụ đọc của Microsoft')
  // Micro giả phát bíp liên tục → sẽ bị coi là bạn đang nói và ngắt lời; tắt ngắt lời cho test.
  await page.getByLabel('Đang đọc mà bạn bắt đầu nói thì dừng đọc và nghe bạn').uncheck()
  await page.getByLabel('Từ vựng riêng').fill('Houdini, Substance')
  await page.getByLabel('Nói xong', { exact: true }).focus() // blur → lưu
})

test('nói → chữ điền vào ô nhập để sửa; gửi đi có nhãn "🎤 nói"; Mizuki biết là giọng nói', async () => {
  await goTo(page, '#/', box())
  const mic = page.getByTestId('mic-button')
  await mic.click()
  await expect(mic).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(800) // micro giả của Chromium phát tiếng bíp
  await mic.click()
  await expect(box()).toHaveValue('xin chào Mizuki, giọng nói giả lập', { timeout: 15_000 })
  await box().press('End')
  await box().pressSequentially(' nha')
  await box().press('Enter')
  const sent = page.getByTestId('message-user').last()
  await expect(sent).toContainText('giọng nói giả lập nha')
  await expect(sent.getByTestId('voice-badge')).toContainText('🎤 nói')
  await expect(page.getByTestId('message-assistant').last()).toContainText(
    '🎤 nói — chữ do máy chép lại',
    { timeout: 20_000 }
  )
  // Hỏi bằng giọng → tự đọc câu trả lời; Esc dừng đọc.
  const speak = page.getByTestId('message-assistant').last().getByTestId('speak-button')
  await expect(speak).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })
  await page.keyboard.press('Escape')
  await expect(speak).toHaveAttribute('aria-pressed', 'false')
})

test('chế độ "Gửi luôn": nói xong là gửi', async () => {
  await goTo(page, '#/settings', page.getByTestId('voice-settings'))
  await page.getByLabel('Nói xong', { exact: true }).selectOption('send')
  await goTo(page, '#/', box())
  const before = await page.getByTestId('message-user').count()
  await page.getByTestId('mic-button').click()
  await page.waitForTimeout(800)
  await page.getByTestId('mic-button').click()
  await expect(page.getByTestId('message-user')).toHaveCount(before + 1, { timeout: 15_000 })
  await expect(page.getByTestId('message-user').last().getByTestId('voice-badge')).toBeVisible()
  await expect(box()).toHaveValue('')
})

test('nút loa trên câu trả lời: bấm đọc, bấm lại dừng', async () => {
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('Escape')
  const speak = page.getByTestId('message-assistant').first().getByTestId('speak-button')
  await speak.click()
  await expect(speak).toHaveAttribute('aria-pressed', 'true')
  await speak.click()
  await expect(speak).toHaveAttribute('aria-pressed', 'false')
})
