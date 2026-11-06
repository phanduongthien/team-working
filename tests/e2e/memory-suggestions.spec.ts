import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { goTo, waitForStartup } from './helpers'

// Trang "Mizuki nhớ gì về tôi" — đề xuất chờ duyệt dạng danh sách gọn: thu gọn mục, dòng một dòng, mở ra sửa,
// "Xem thêm", lọc theo loại, duyệt hàng loạt. Duyệt xong dòng biến mất + số cập nhật trong 1 GIÂY (đồng bộ chung).
// Chạy được khi KHÔNG có Claude CLI: trích ghi nhớ giả lập bằng MMC_FAKE_CHAT (FAKE_MEMORIES:<n>).
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
const FAST = { timeout: 1_000 }
let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-memory-e2e-'))
  app = await electron.launch({
    args: [ROOT],
    env: { ...process.env, TEAM_WORKING_USER_DATA: userData, MMC_FAKE_CHAT: '1' }
  })
  page = await app.firstWindow()
  await waitForStartup(page)
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const box = () => page.getByRole('textbox', { name: /Nhắn cho/ })
const section = () => page.getByTestId('suggestions-section')
const rows = () => section().getByTestId('memory-suggestion')
const count = () => section().getByTestId('section-count')
const row = (content: string) =>
  rows().filter({ has: page.getByTestId('suggestion-content').getByText(content, { exact: true }) })

test('trích 10 đề xuất từ cuộc trò chuyện', async () => {
  await goTo(page, '#/', box())
  await page.getByRole('button', { name: 'Cuộc trò chuyện mới' }).click()
  await box().fill('Mình đang làm đồ án FAKE_MEMORIES:10')
  await box().press('Enter')
  await expect(page.getByTestId('message-assistant').last()).toContainText('Mizuki (giả lập) đã nhận', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('suggest-memory').click()
  await page.getByRole('link', { name: /đề xuất/ }).click({ timeout: 20_000 })
  await expect(count()).toHaveText('10')
})

test('dòng gọn: một dòng (cắt …), nhãn loại, ✓ / ✕; chỉ hiện 5, "Xem thêm 5 đề xuất"', async () => {
  await expect(rows()).toHaveCount(5)
  const long = rows().filter({ hasText: 'Ghi nhớ dài số 2' })
  const content = long.getByTestId('suggestion-content')
  // Một dòng: cao bằng dòng ngắn, chữ bị cắt.
  expect(await content.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  const short = await rows().first().boundingBox()
  const tall = await long.boundingBox()
  expect(Math.abs(tall!.height - short!.height)).toBeLessThan(2)
  await expect(long).toContainText('Dự án')
  await expect(long.getByTestId('memory-suggestion-accept')).toBeVisible()
  await expect(long.getByTestId('memory-suggestion-reject')).toBeVisible()
  await page.screenshot({ path: 'test-results/memory-suggestions-compact.png' })

  await section().getByTestId('suggestions-show-more').click()
  await expect(section().getByTestId('suggestions-show-more')).toHaveCount(0)
  await expect(rows()).toHaveCount(10)
})

test('bấm vào dòng → ô sửa đầy đủ, tự giãn theo nội dung, không có thanh cuộn bên trong', async () => {
  const long = rows().filter({ hasText: 'Ghi nhớ dài số 2' })
  await long.getByTestId('suggestion-row').click()
  const editor = long.getByTestId('suggestion-editor').getByRole('textbox')
  await expect(editor).toBeVisible()
  const { scroll, client } = await editor.evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }))
  expect(scroll).toBeLessThanOrEqual(client + 1)
  expect(client).toBeGreaterThan(60) // nội dung dài → nhiều dòng
  await page.screenshot({ path: 'test-results/memory-suggestion-editor.png' })
  // Sửa rồi đồng ý → dòng biến mất ngay, số giảm.
  await editor.fill('Đang làm đồ án game Unity')
  await long.getByRole('button', { name: 'Đồng ý' }).last().click()
  await expect(rows().filter({ hasText: 'Ghi nhớ dài số 2' })).toHaveCount(0, FAST)
  await expect(count()).toHaveText('9', FAST)
  await expect(page.getByTestId('memory-item').filter({ hasText: 'Đang làm đồ án game Unity' })).toHaveCount(1)
})

test('✓ / ✕ trên dòng: biến mất ngay, số cập nhật', async () => {
  await row('Ghi nhớ số 1').getByTestId('memory-suggestion-reject').click()
  await expect(count()).toHaveText('8', FAST)
  await row('Ghi nhớ số 3').getByTestId('memory-suggestion-accept').click()
  await expect(count()).toHaveText('7', FAST)
  await expect(page.getByTestId('memory-item').filter({ hasText: 'Ghi nhớ số 3' })).toHaveCount(1)
})

test('lọc theo loại; chọn tất cả trong bộ lọc → Bỏ qua đã chọn', async () => {
  const filter = section().getByRole('tablist', { name: 'Lọc theo loại' })
  await filter.getByRole('tab', { name: /Kỹ năng/ }).click()
  // Còn lại: 5, 9 (kỹ năng)
  await expect(rows()).toHaveCount(2)
  await section().getByTestId('suggestions-select-all').check()
  await expect(section().getByTestId('suggestions-reject-selected')).toHaveText(/\(2\)/)
  await section().getByTestId('suggestions-reject-selected').click()
  await expect(count()).toHaveText('5', FAST)
  // Loại không còn đề xuất → về "Tất cả".
  await expect(rows()).toHaveCount(5)
})

test('tick từng dòng → Đồng ý đã chọn', async () => {
  await rows().nth(0).getByRole('checkbox').check()
  await rows().nth(1).getByRole('checkbox').check()
  await section().getByTestId('suggestions-accept-selected').click()
  await expect(count()).toHaveText('3', FAST)
})

test('"Đồng ý tất cả" phải bấm xác nhận lần hai', async () => {
  const all = section().getByTestId('suggestions-accept-all')
  await all.click()
  await expect(all).toHaveText(/Bấm lần nữa để ghi nhớ cả 3 đề xuất/)
  await expect(count()).toHaveText('3')
  await all.click()
  await expect(section()).toContainText('Không có đề xuất nào', FAST)
  await expect(count()).toHaveText('0', FAST)
})

test('thu gọn mục (bấm tiêu đề), nhớ trạng thái khi mở lại trang', async () => {
  const toggle = section().getByTestId('section-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(section()).not.toContainText('Không có đề xuất nào')
  await page.reload()
  await waitForStartup(page)
  await goTo(page, '#/memory', section())
  await expect(section().getByTestId('section-toggle')).toHaveAttribute('aria-expanded', 'false')
  await section().getByTestId('section-toggle').click()
  await expect(section()).toContainText('Không có đề xuất nào')
})
