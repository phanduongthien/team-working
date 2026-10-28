import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'team-working-e2e-'))
  app = await electron.launch({
    // Chạy như `electron .` (package.json main → out/main/index.js) để app path là gốc dự án.
    args: [join(__dirname, '..', '..')],
    env: { ...process.env, TEAM_WORKING_USER_DATA: userData }
  })
  page = await app.firstWindow()
})

/** Điều hướng trong app (đổi hash) — app chặn mọi điều hướng từ bên ngoài. */
const go = (hash: string): Promise<string> => page.evaluate((h) => (window.location.hash = h), hash)

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

test('mở app, bảo mật cửa sổ đúng cấu hình', async () => {
  await expect(page).toHaveTitle('Team Working')
  const prefs = await app.evaluate(({ BrowserWindow }) => {
    // Có lúc runtime nhưng không có trong typings của Electron.
    type WithPrefs = { getLastWebPreferences(): Electron.WebPreferences | null }
    const wp = (BrowserWindow.getAllWindows()[0].webContents as unknown as WithPrefs).getLastWebPreferences()
    return { contextIsolation: wp?.contextIsolation, nodeIntegration: wp?.nodeIntegration, sandbox: wp?.sandbox }
  })
  expect(prefs).toEqual({ contextIsolation: true, nodeIntegration: false, sandbox: true })
  expect(await page.evaluate(() => typeof (window as unknown as { require?: unknown }).require)).toBe('undefined')
})

test('kiểm tra Claude CLI và hiện kết quả', async () => {
  await go('#/claude')
  await expect(page.getByTestId('cli-status')).not.toContainText(/Đang kiểm tra/, { timeout: 30_000 })
  await page.screenshot({ path: 'test-results/claude-check.png' })
})

test('đổi tên trợ lý trong Cài đặt và thấy ở màn hình chat', async () => {
  await go('#/settings')
  await page.getByLabel('Tên trợ lý').fill('Bông')
  // Nút Lưu đầu tiên thuộc mục "Trợ lý của bạn" (mục Kết nối AI có nút lưu API key riêng).
  await page.getByRole('button', { name: 'Lưu' }).first().click()
  await expect(page.getByText('Đã lưu')).toBeVisible()
  await go('#/')
  await expect(page.getByRole('heading', { name: 'Xin chào, mình là Bông!' })).toBeVisible()
})

test('các trang team yêu cầu đăng nhập GitHub; hiện nhãn DEV khi trỏ project dev', async () => {
  await expect(page.getByTestId('env-badge')).toHaveText('DEV')
  for (const hash of ['#/team', '#/projects', '#/dashboard', '#/feedback', '#/notifications', '#/learning', '#/today']) {
    await go(hash)
    await expect(page.getByRole('button', { name: 'Đăng nhập bằng GitHub' }), hash).toBeVisible()
  }
  await page.screenshot({ path: 'test-results/team-signin.png' })
})

test('Thời gian (offline): bấm giờ, chấm đỏ trên menu, dừng, thêm giờ tay, xuất CSV', async () => {
  await go('#/time')
  await page.getByLabel('Đang làm việc gì?').first().fill('Đọc tài liệu React')
  await page.getByRole('button', { name: 'Bắt đầu', exact: true }).click()
  await expect(page.getByTestId('timer-running')).toContainText('Đọc tài liệu React')
  await expect(page.getByTestId('dot-time')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: 'Dừng', exact: true }).click()
  await expect(page.getByTestId('time-entry')).toHaveCount(1)
  await expect(page.getByTestId('dot-time')).toHaveCount(0)

  await page.getByRole('button', { name: 'Thêm giờ thủ công' }).click()
  await page.getByLabel('Việc', { exact: true }).fill('Họp nhóm, sprint "A"')
  await page.getByLabel('Bắt đầu', { exact: true }).fill('09:00')
  await page.getByLabel('Kết thúc', { exact: true }).fill('10:30')
  await page.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByTestId('time-entry')).toHaveCount(2)
  await expect(page.getByTestId('week-total')).toContainText('1h 30m')

  const csvPath = join(userData, 'tuan.csv')
  await app.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = (async () => ({ canceled: false, filePath: file })) as typeof dialog.showSaveDialog
  }, csvPath)
  await page.getByRole('button', { name: 'Xuất CSV' }).click()
  await expect(page.getByText(/Đã xuất/)).toBeVisible()
  const csv = readFileSync(csvPath, 'utf8')
  expect(csv).toContain('Ngày,Bắt đầu,Kết thúc,Số giờ,Việc,Dự án,Loại,Ghi chú')
  expect(csv).toContain('09:00,10:30,1.50,"Họp nhóm, sprint ""A""",,Nhập tay,')
  await page.screenshot({ path: 'test-results/time.png' })
})

test('nút sáng/tối ở thanh bên đổi giao diện và lưu vào Cài đặt', async () => {
  const isDark = (): Promise<boolean> => page.evaluate(() => document.documentElement.classList.contains('dark'))
  const before = await isDark()
  await page.getByTestId('theme-toggle').click()
  await expect.poll(isDark).toBe(!before)
  await go('#/settings')
  await expect(page.getByText('Chế độ sáng / tối')).toBeVisible()
  await expect(page.getByRole('button', { name: before ? 'Sáng' : 'Tối', exact: true })).toHaveClass(/bg-primary/)
  await page.getByTestId('theme-toggle').click()
  await expect.poll(isDark).toBe(before)
})

test('trang Trí nhớ: hồ sơ, thêm/sửa/xóa memory thủ công', async () => {
  await go('#/memory')
  await expect(page.getByRole('heading', { name: 'Bông nhớ gì về tôi' })).toBeVisible()
  await expect(page.getByTestId('memory-account')).toContainText('Chưa đăng nhập')

  await page.getByLabel('Tên', { exact: true }).fill('An')
  await page.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByText('Đã lưu')).toBeVisible()

  await page.getByLabel('Thêm điều trợ lý nên nhớ…').fill('Thích ví dụ bằng TypeScript')
  await page.getByRole('button', { name: 'Thêm' }).click()
  await expect(page.getByTestId('memory-item')).toHaveCount(1)

  await page.getByLabel('Thêm điều trợ lý nên nhớ…').fill('Ghi chú tạm')
  await page.getByRole('button', { name: 'Thêm' }).click()
  await expect(page.getByTestId('memory-item')).toHaveCount(2)
  await page.getByTestId('memory-item').filter({ hasText: 'Ghi chú tạm' }).hover()
  await page.getByTestId('memory-item').filter({ hasText: 'Ghi chú tạm' }).getByTitle('Xóa').click()
  await expect(page.getByTestId('memory-item')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/memory.png' })
})

test('Cài đặt → Gửi báo lỗi: bản nháp tự viết kèm phiên bản và log đã che', async () => {
  await go('#/settings')
  await page.getByTestId('report-bug').click()
  await expect(page.getByRole('tab', { name: 'Báo lỗi' })).toHaveAttribute('aria-selected', 'true')
  await page.getByLabel('Tiêu đề').fill('Không lưu được flashcard')
  await page.getByLabel('Mô tả').fill('Bấm Lưu nhưng thẻ biến mất')
  await page.getByRole('button', { name: 'Tự viết, không cần trợ lý' }).click()
  await expect(page.getByTestId('issue-draft')).toBeVisible()
  await expect(page.getByTestId('bug-info')).toContainText('Team Working')
  await expect(page.getByTestId('bug-info')).not.toContainText(/C:\\Users\\[^%]/)
  await page.screenshot({ path: 'test-results/ideas.png' })
})

// Gọi Claude thật (tốn hạn mức subscription) — chỉ chạy khi bật E2E_REAL_CLI=1.
test('chat thật qua Claude Code CLI: stream, lưu lịch sử, resume', async () => {
  test.skip(process.env.E2E_REAL_CLI !== '1', 'Đặt E2E_REAL_CLI=1 để gọi Claude thật')
  const box = page.getByRole('textbox', { name: /Nhắn cho/ })
  await box.fill('Nhớ giúp mình con số 7391. Chỉ trả lời "OK".')
  await box.press('Enter')
  await expect(page.getByText('OK', { exact: false }).last()).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 90_000 })

  await box.fill('Con số mình nhờ nhớ là gì? Chỉ trả lời con số.')
  await box.press('Enter')
  await expect(page.locator('.markdown').last()).toContainText('7391', { timeout: 90_000 })
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 90_000 })
  await page.screenshot({ path: 'test-results/chat.png' })
})

test('đính kèm file, gợi ý ghi nhớ → duyệt → trợ lý dùng memory ở cuộc trò chuyện mới', async () => {
  test.skip(process.env.E2E_REAL_CLI !== '1', 'Đặt E2E_REAL_CLI=1 để gọi Claude thật')
  test.setTimeout(300_000)

  // Giả lập hộp thoại chọn file của hệ điều hành.
  const notes = join(userData, 'ke-hoach.md')
  writeFileSync(notes, '# Kế hoạch\nMã dự án bí mật: ORCHID-58\n')
  await app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [file] })) as typeof dialog.showOpenDialog
  }, notes)

  await go('#/')
  await page.getByRole('button', { name: 'Cuộc trò chuyện mới' }).click()
  await page.getByRole('button', { name: /Đính kèm file/ }).click()
  await expect(page.getByTitle('ke-hoach.md')).toBeVisible()
  const box = page.getByRole('textbox', { name: /Nhắn cho/ })
  await box.fill('Mình tên là Minh, đang học Rust để làm đồ án tốt nghiệp. Đọc file đính kèm và cho mình biết mã dự án.')
  await box.press('Enter')
  await expect(page.locator('.markdown').last()).toContainText('ORCHID-58', { timeout: 120_000 })
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 120_000 })

  await page.getByRole('button', { name: 'Gợi ý ghi nhớ' }).click()
  await page.getByRole('link', { name: /đề xuất/ }).click({ timeout: 120_000 })
  await expect(page.getByTestId('memory-suggestion').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/memory-suggestions.png' })
  const count = await page.getByTestId('memory-suggestion').count()
  for (let i = 0; i < count; i++) {
    await page.getByTestId('memory-suggestion').first().getByRole('button', { name: 'Đồng ý' }).click()
  }
  await expect(page.getByTestId('memory-suggestion')).toHaveCount(0)
  await expect(page.getByTestId('memory-item').filter({ hasText: /Rust/ })).toHaveCount(1)

  // Cuộc trò chuyện mới (session mới) vẫn biết nhờ memory trong system prompt.
  await go('#/')
  await page.getByRole('button', { name: 'Cuộc trò chuyện mới' }).click()
  await box.fill('Mình đang học ngôn ngữ lập trình nào? Trả lời đúng một từ.')
  await box.press('Enter')
  await expect(page.locator('.markdown').last()).toContainText('Rust', { timeout: 120_000 })
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 120_000 })
  await page.screenshot({ path: 'test-results/chat-memory.png' })
})
