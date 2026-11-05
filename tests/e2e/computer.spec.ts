import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

// Điều khiển máy tính — giai đoạn CHỈ XEM. Dùng màn hình giả (MMC_FAKE_SCREEN, chỉ có ở bản chưa đóng gói)
// để không chụp/gửi màn hình thật của người chạy test.

const ROOT = join(__dirname, '..', '..')
const FAKE_COLOR = '#1e3cdc' // xanh dương
const HOTKEY = 'Control+Alt+Q'

let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-computer-e2e-'))
  app = await electron.launch({
    args: [ROOT],
    env: { ...process.env, TEAM_WORKING_USER_DATA: userData, MMC_FAKE_SCREEN: FAKE_COLOR }
  })
  page = await app.firstWindow()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const go = (hash: string): Promise<string> => page.evaluate((h) => (window.location.hash = h), hash)
const hotkeyRegistered = (): Promise<boolean> =>
  app.evaluate(({ globalShortcut }, accel) => globalShortcut.isRegistered(accel), HOTKEY)

test('mặc định tắt: không có phím tắt toàn cục, không có nút xem màn hình trong chat', async () => {
  await go('#/')
  await expect(page.getByRole('textbox', { name: /Nhắn cho/ })).toBeVisible()
  await expect(page.getByTestId('screen-access-toggle')).toHaveCount(0)
  expect(await hotkeyRegistered()).toBe(false)
})

test('bật lần đầu phải qua cảnh báo; bật xong phím dừng khẩn cấp được đăng ký', async () => {
  await go('#/settings')
  await page.getByTestId('open-computer').click()
  await expect(page.getByRole('heading', { name: /Điều khiển máy tính/ })).toBeVisible()
  await expect(page.getByTestId('hotkey-status')).toContainText('Chưa bật')

  // Checkbox không tự đổi khi chưa chấp nhận cảnh báo → dùng click, không dùng check().
  await page.getByTestId('computer-enable').click()
  await expect(page.getByTestId('computer-enable')).not.toBeChecked()
  const warning = page.getByTestId('computer-warning')
  await expect(warning).toBeVisible()
  await expect(warning).toContainText('Ctrl + Alt + Q')
  const accept = warning.getByRole('button', { name: 'Bật tính năng' })
  await expect(accept).toBeDisabled()
  await warning.getByLabel('Tôi đã đọc và hiểu các điểm trên.').check()
  await accept.click()
  await expect(warning).toBeHidden()

  await expect(page.getByTestId('hotkey-status')).toContainText('Đã sẵn sàng')
  expect(await hotkeyRegistered()).toBe(true)
})

test('chụp thử: ảnh hiện tại máy, không gửi đi', async () => {
  await page.getByTestId('screen-preview').click()
  const img = page.getByTestId('screen-preview-image')
  await expect(img).toBeVisible()
  await expect(img).toHaveAttribute('width', '640')
  await expect(page.getByText(/Màn hình 1\/1 \(chính\)/)).toBeVisible()
})

test('cho xem màn hình từ khung chat → có dải nhắc; Dừng khẩn cấp → tắt quyền xem và báo', async () => {
  await go('#/')
  const toggle = page.getByTestId('screen-access-toggle')
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  const indicator = page.getByTestId('screen-access-indicator')
  await expect(indicator).toContainText('Ctrl + Alt + Q để dừng')

  await indicator.getByRole('button', { name: 'Dừng' }).click()
  await expect(page.getByTestId('emergency-stopped')).toBeVisible()
  await expect(indicator).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  // Phím tắt vẫn đăng ký để dùng tiếp lần sau.
  expect(await hotkeyRegistered()).toBe(true)
})

// Gọi Claude thật (tốn hạn mức) — kiểm chứng cả đường đi CLI → MCP mmc → app → ảnh → Claude.
test('chat thật: trợ lý chụp màn hình (giả) và nói đúng màu', async () => {
  test.skip(process.env.E2E_REAL_CLI !== '1', 'Đặt E2E_REAL_CLI=1 để gọi Claude thật')
  await go('#/')
  await page.getByTestId('screen-access-toggle').click()
  const box = page.getByRole('textbox', { name: /Nhắn cho/ })
  await box.fill('Hãy chụp màn hình của mình rồi cho biết màu chủ đạo của màn hình là màu gì. Trả lời ngắn gọn một câu.')
  await box.press('Enter')
  await expect(page.getByText('Đã dùng công cụ chụp màn hình').first()).toBeVisible({ timeout: 120_000 })
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 120_000 })
  const reply = await page.locator('.markdown').last().innerText()
  expect(reply.toLowerCase()).toMatch(/xanh|blue/)

  // Nhật ký có dòng chụp màn hình kèm file ảnh.
  const logRoot = join(userData, 'logs', 'computer-use')
  const day = readdirSync(logRoot)[0]
  const lines = readFileSync(join(logRoot, day, 'actions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  const shot = lines.find((l) => l.tool === 'screenshot')
  expect(shot).toMatchObject({ ok: true })
  expect(existsSync(join(logRoot, day, shot.image))).toBe(true)
})

test('tắt tính năng → gỡ phím tắt toàn cục, nút trong chat biến mất', async () => {
  await go('#/computer')
  await page.getByTestId('computer-enable').click()
  await expect(page.getByTestId('computer-enable')).not.toBeChecked()
  await expect(page.getByTestId('hotkey-status')).toContainText('Chưa bật')
  expect(await hotkeyRegistered()).toBe(false)
  await go('#/')
  await expect(page.getByTestId('screen-access-toggle')).toHaveCount(0)
})
