import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page
} from '@playwright/test'

// Luồng cập nhật chạy với server giả lập cục bộ (không đụng GitHub Releases thật).
// Không bấm "Khởi động lại" — bước cài thật chỉ thử thủ công (docs/release.md).

const ROOT = join(__dirname, '..', '..')
const PORT = 8790

let dir: string
let cacheName: string
let server: ChildProcess | null = null
/** Các request server giả lập nhận được (để biết app có kiểm tra lại không). */
let requests: string[] = []
let app: ElectronApplication
let page: Page

async function startServer(args: string[]): Promise<void> {
  server = spawn(process.execPath, [
    join(ROOT, 'scripts', 'mock-update-server.mjs'),
    '--port',
    String(PORT),
    '--cache',
    cacheName,
    '--config',
    join(dir, 'update.yml'),
    ...args
  ])
  requests = []
  await new Promise<void>((resolve, reject) => {
    server!.stdout!.on('data', (d: Buffer) => {
      const text = d.toString()
      requests.push(...text.split(/\r?\n/).filter((l) => l.startsWith('GET ')))
      if (text.includes('Mock update server')) resolve()
    })
    server!.on('exit', (code) => reject(new Error(`mock server exited ${code}`)))
  })
}

async function launch(): Promise<void> {
  app = await electron.launch({
    args: [ROOT],
    env: {
      ...process.env,
      TEAM_WORKING_USER_DATA: join(dir, 'userData'),
      MMC_UPDATE_CONFIG: join(dir, 'update.yml')
    }
  })
  page = await app.firstWindow()
}

async function stopAll(): Promise<void> {
  await app?.close()
  server?.kill()
  server = null
}

test.beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mmc-update-e2e-'))
  // Mỗi test một cache riêng: electron-updater dùng lại file đã tải nếu khớp sha512.
  cacheName = `mmc-studio-updater-e2e-${basename(dir)}`
})

test.afterEach(async () => {
  await stopAll()
  rmSync(dir, { recursive: true, force: true })
  if (process.env.LOCALAPPDATA) {
    rmSync(join(process.env.LOCALAPPDATA, cacheName), { recursive: true, force: true })
  }
})

test('bản thường: hiện phiên bản + changelog; Bỏ qua thì không nhắc lại ở lần mở sau', async () => {
  await startServer(['--version', '9.9.9', '--notes', '<ul><li>Thêm thông báo cập nhật</li></ul>'])
  await launch()

  const dialog = page.getByTestId('update-dialog')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('update-version')).toHaveText('Phiên bản 9.9.9')
  await expect(page.getByTestId('update-notes')).toContainText('• Thêm thông báo cập nhật')
  await expect(dialog.getByRole('button', { name: 'Cập nhật ngay' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Để sau' })).toBeVisible()
  await expect(page.getByTestId('critical-update-banner')).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Bỏ qua phiên bản này' }).click()
  await expect(dialog).toBeHidden()

  // Mở lại app: phiên bản đã bỏ qua không hiện nữa, nhưng Cài đặt vẫn thấy có bản mới.
  await app.close()
  await launch()
  await page.evaluate(() => (window.location.hash = '#/settings'))
  await expect(page.getByTestId('update-status')).toContainText('Có bản mới 9.9.9', {
    timeout: 30_000
  })
  await expect(page.getByTestId('update-dialog')).toHaveCount(0)
})

test('bản [critical]: không có Bỏ qua; Để sau → banner cam; tải có tiến trình rồi hỏi khởi động lại', async () => {
  await startServer([
    '--version',
    '9.9.9',
    '--title',
    'MMC studio 9.9.9 [critical]',
    '--kbps',
    '2048'
  ])
  await launch()

  const dialog = page.getByTestId('update-dialog')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(dialog).toContainText('Bắt buộc')
  await expect(dialog.getByRole('button', { name: 'Bỏ qua phiên bản này' })).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Để sau' }).click()
  const banner = page.getByTestId('critical-update-banner')
  await expect(banner).toBeVisible()
  await expect(banner).toContainText('9.9.9')

  // Bấm banner = cập nhật ngay.
  await banner.click()
  await expect(page.getByTestId('update-progress')).toBeVisible()
  await expect(page.getByRole('progressbar')).toBeVisible()
  await expect(page.getByTestId('update-ready')).toBeVisible({ timeout: 30_000 })
  await expect(
    page.getByTestId('update-ready').getByRole('button', { name: 'Khởi động lại' })
  ).toBeVisible()
  await page.screenshot({ path: 'test-results/update-ready.png' })
})

test('bản thường: Để sau → không hiện lại trong phiên, mở lại app thì nhắc lại', async () => {
  await startServer(['--version', '9.9.9'])
  await launch()
  const dialog = page.getByTestId('update-dialog')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await dialog.getByRole('button', { name: 'Để sau' }).click()
  await expect(dialog).toBeHidden()
  // Trong phiên: vào Cài đặt vẫn thấy có bản mới nhưng không bật hộp thoại.
  await page.evaluate(() => (window.location.hash = '#/settings'))
  await expect(page.getByTestId('update-status')).toContainText('Có bản mới 9.9.9')
  await expect(page.getByTestId('update-dialog')).toHaveCount(0)

  await app.close()
  await launch()
  await expect(page.getByTestId('update-dialog')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('update-version')).toHaveText('Phiên bản 9.9.9')
})

test('Cài đặt → Cập nhật: tắt tự kiểm tra → mở app không hỏi; Kiểm tra ngay → hiện hộp thoại', async () => {
  await startServer(['--version', '9.9.9'])
  await launch()
  await expect(page.getByTestId('update-dialog')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('update-dialog').getByRole('button', { name: 'Để sau' }).click()
  await page.evaluate(() => (window.location.hash = '#/settings'))
  await expect(page.getByText('Đang dùng phiên bản 0.3.0')).toBeVisible()
  const auto = page.getByLabel('Tự động kiểm tra bản mới')
  await expect(auto).toBeChecked()
  await auto.uncheck()

  await app.close()
  const before = requests.length
  await launch()
  await page.evaluate(() => (window.location.hash = '#/settings'))
  await expect(page.getByLabel('Tự động kiểm tra bản mới')).not.toBeChecked()
  // Chờ đủ lâu để lần kiểm tra lúc mở app (nếu có) chạy xong — không được có request nào.
  await page.waitForTimeout(3_000)
  expect(requests.length).toBe(before)
  await expect(page.getByTestId('update-dialog')).toHaveCount(0)

  await page.getByRole('button', { name: 'Kiểm tra ngay' }).click()
  await expect(page.getByTestId('update-dialog')).toBeVisible({ timeout: 30_000 })
})

test('Kiểm tra ngay khi không có bản mới → "đang dùng phiên bản mới nhất"', async () => {
  await startServer(['--version', '0.0.1'])
  await launch()
  await page.evaluate(() => (window.location.hash = '#/settings'))
  await page.getByRole('button', { name: 'Kiểm tra ngay' }).click()
  await expect(page.getByTestId('update-status')).toContainText('Bạn đang dùng phiên bản mới nhất', { timeout: 30_000 })
  await expect(page.getByTestId('update-dialog')).toHaveCount(0)
})

test('đổi kênh sang beta → lưu lại sau khi mở lại app, app kiểm tra lại ngay', async () => {
  await startServer(['--version', '0.0.1'])
  await launch()
  await page.evaluate(() => (window.location.hash = '#/settings'))
  const beta = page.getByRole('radio', { name: /beta/ })
  await expect(page.getByRole('radio', { name: /stable/ })).toBeChecked()
  await expect.poll(() => requests.length, { timeout: 30_000 }).toBeGreaterThan(0)
  const before = requests.length
  await beta.check()
  await expect.poll(() => requests.length, { timeout: 30_000 }).toBeGreaterThan(before)

  await app.close()
  await launch()
  await page.evaluate(() => (window.location.hash = '#/settings'))
  await expect(page.getByRole('radio', { name: /beta/ })).toBeChecked()
})
