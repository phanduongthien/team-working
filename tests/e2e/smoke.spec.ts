import { mkdtempSync, rmSync } from 'node:fs'
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
  await page.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByText('Đã lưu')).toBeVisible()
  await go('#/')
  await expect(page.getByRole('heading', { name: 'Xin chào, mình là Bông!' })).toBeVisible()
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
