import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { waitForStartup } from './helpers'

// Cài Python sidecar THẬT (tải ~50 MB từ GitHub/PyPI) — chỉ chạy khi đặt E2E_SIDECAR=1.
// Dùng thư mục dữ liệu tạm, không đụng dữ liệu thật của người dùng.
test.skip(process.env.E2E_SIDECAR !== '1', 'Đặt E2E_SIDECAR=1 để thử tải và cài Python sidecar thật')
test.describe.configure({ mode: 'serial', timeout: 10 * 60_000 })

const ROOT = join(__dirname, '..', '..')
let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-sidecar-e2e-'))
  app = await electron.launch({ args: [ROOT], env: { ...process.env, TEAM_WORKING_USER_DATA: userData } })
  page = await app.firstWindow()
  // Máy không có Claude CLI bị chuyển tới /claude sau lần kiểm tra lúc mở app — chờ xong rồi mới điều hướng.
  await waitForStartup(page)
  await page.evaluate(() => (window.location.hash = '#/computer'))
  await page.getByTestId('computer-enable').click()
  await page.getByLabel('Tôi đã đọc và hiểu các điểm trên.').check()
  await page.getByRole('button', { name: 'Bật tính năng' }).click()
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const sidecarDir = (): string => join(userData, 'sidecar')

test('huỷ giữa chừng → về trạng thái chưa cài, xoá sạch', async () => {
  await page.getByTestId('sidecar-install').click()
  const progress = page.getByTestId('sidecar-progress')
  await expect(progress).toBeVisible()
  // Mạng nhanh tải xong uv (15 MB) dưới 1 giây → có thể đã sang bước 2 (bước này không hiện MB).
  await expect(progress).toContainText(/Bước [12]\/3/)
  await page.getByTestId('sidecar-cancel').click()
  await expect(page.getByTestId('sidecar-install')).toBeVisible({ timeout: 30_000 })
  await expect.poll(() => existsSync(sidecarDir())).toBe(false)
})

test('cài đủ 3 bước → kiểm tra đọc được cửa sổ → gỡ sạch', async () => {
  await page.getByTestId('sidecar-install').click()
  const progress = page.getByTestId('sidecar-progress')
  await expect(progress).toContainText('Bước 2/3', { timeout: 120_000 })
  await expect(progress).toContainText('Bước 3/3', { timeout: 300_000 })
  await expect(page.getByTestId('sidecar-installed')).toContainText('Python 3.12', { timeout: 300_000 })

  await page.getByTestId('sidecar-check').click()
  await expect(page.getByTestId('sidecar-check-result')).toContainText(/đọc được \d+ cửa sổ/, { timeout: 60_000 })

  await page.getByTestId('sidecar-remove').click()
  await page.getByTestId('sidecar-remove-confirm').click()
  await expect(page.getByTestId('sidecar-install')).toBeVisible({ timeout: 60_000 })
  expect(existsSync(sidecarDir())).toBe(false)
})
