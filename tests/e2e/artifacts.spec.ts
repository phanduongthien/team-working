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

// Artifact — chạy được khi KHÔNG có Claude CLI (MMC_FAKE_CHAT: trợ lý giả trả khối artifact theo FAKE_ARTIFACT:<tên>).
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-artifacts-e2e-'))
  app = await electron.launch({
    args: [ROOT],
    env: { ...process.env, TEAM_WORKING_USER_DATA: userData, MMC_FAKE_CHAT: '1' }
  })
  page = await app.firstWindow()
  await waitForStartup(page)
  await goTo(page, '#/', page.getByRole('textbox', { name: /Nhắn cho/ }))
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const box = (): ReturnType<Page['getByRole']> => page.getByRole('textbox', { name: /Nhắn cho/ })
const frame = (): ReturnType<Page['frameLocator']> =>
  page.frameLocator('[data-testid=artifact-frame]')
async function ask(text: string): Promise<void> {
  await box().fill(text)
  await box().press('Enter')
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })
}

test('mở panel: có 4 mẫu cho làm game', async () => {
  await page.getByTestId('artifacts-toggle').click()
  const panel = page.getByTestId('artifact-panel')
  for (const id of ['gdd', 'balance', 'roadmap', 'pitch'])
    await expect(panel.getByTestId(`template-${id}`)).toBeVisible()
})

test('bảng cân bằng: khối artifact vào panel (không hiện trong chat), công thức tự tính, tô ô bất thường', async () => {
  await ask('tạo bảng FAKE_ARTIFACT:sheet')
  const reply = page.getByTestId('message-assistant').last()
  await expect(reply).not.toContainText('<artifact')
  await expect(reply.getByTestId('artifact-chip')).toContainText('Cân bằng')
  await reply.getByTestId('artifact-chip').click()
  const giant = frame().locator('tr', { hasText: 'Giant' })
  await expect(giant.locator('td').nth(3)).toHaveText('800') // DPS = 400 * 2
  await expect(giant.locator('td.outlier, td.outlier-high').first()).toBeVisible()
})

test('sửa ô trong panel → phiên bản mới do bạn sửa', async () => {
  const cell = frame().locator('tr', { hasText: 'Warrior' }).locator('td').nth(1)
  await cell.click()
  await cell.press('Control+A')
  await cell.pressSequentially('90')
  await cell.press('Enter')
  await expect(page.getByTestId('artifact-version')).toContainText('v2 (bạn sửa)')
  await expect(frame().locator('tr', { hasText: 'Warrior' }).locator('td').nth(3)).toHaveText('90')
})

test('artifact-edit: sửa tại chỗ thành v3; find không khớp → báo lỗi, không sửa', async () => {
  await ask('giảm Mage FAKE_ARTIFACT:edit')
  await expect(
    page.getByTestId('message-assistant').last().getByTestId('artifact-chip')
  ).toContainText('v3')
  await expect(frame().locator('tr', { hasText: 'Mage' }).locator('td').nth(1)).toHaveText('100')
  await ask('sửa nữa FAKE_ARTIFACT:bad-edit')
  await expect(
    page.getByTestId('message-assistant').last().getByTestId('artifact-error')
  ).toContainText('không còn khớp')
  await expect(page.getByTestId('artifact-version')).toHaveValue('3')
})

test('phiên bản: xem v1, khôi phục → v4', async () => {
  await page.getByTestId('artifact-version').selectOption('1')
  await expect(frame().locator('tr', { hasText: 'Mage' }).locator('td').nth(1)).toHaveText('120')
  await page.getByRole('button', { name: 'Khôi phục bản này' }).click()
  await expect(page.getByTestId('artifact-version')).toHaveValue('4')
})

test('tài liệu: Mermaid + Chart.js nạp từ app (không CDN) và vẽ được', async () => {
  await ask('viết GDD FAKE_ARTIFACT:doc')
  await page.getByTestId('message-assistant').last().getByTestId('artifact-chip').click()
  await expect(frame().locator('h1')).toHaveText('Game Design Document')
  await expect(frame().locator('.diagram svg')).toBeVisible({ timeout: 15_000 })
  await expect(frame().locator('.chart canvas')).toBeVisible()
})

test('slide: theme pixel, 2 slide, bố cục 2 cột', async () => {
  await ask('làm slide FAKE_ARTIFACT:slides')
  await page.getByTestId('message-assistant').last().getByTestId('artifact-chip').click()
  await expect(frame().locator('section.slide')).toHaveCount(2)
  await expect(frame().locator('.layout-two-column .cols ul')).toHaveCount(2)
})

test('BẢO MẬT: code trong artifact không ra mạng, không đọc storage/cookie, không gọi API app, không điều hướng / mở cửa sổ', async () => {
  await page.evaluate(() => localStorage.setItem('mmc-secret', 'bi-mat'))
  await ask('thử FAKE_ARTIFACT:probe')
  await page.getByTestId('message-assistant').last().getByTestId('artifact-chip').click()
  const probe = frame().locator('#probe')
  await expect(probe).toContainText('{', { timeout: 15_000 })
  const r = JSON.parse(await probe.innerText()) as Record<string, string>
  expect(r).toEqual({
    fetch: 'blocked',
    localStorage: 'blocked',
    cookie: 'blocked',
    parentApi: 'blocked',
    parentDom: 'blocked',
    topNav: 'blocked',
    open: 'blocked'
  })
  expect(page.url()).toContain('#/')
  expect(app.windows()).toHaveLength(1)
  await expect(page.getByTestId('artifact-frame')).toHaveAttribute('sandbox', 'allow-scripts')
})

test('artifact treo (vòng lặp vô hạn) không làm đơ app; nút tải lại vẫn bấm được', async () => {
  await ask('treo FAKE_ARTIFACT:loop')
  await page.getByTestId('message-assistant').last().getByTestId('artifact-chip').click()
  await page.waitForTimeout(1_000)
  // App chính vẫn phản hồi: gõ chữ, mở / đóng panel.
  await box().fill('app vẫn chạy')
  await expect(box()).toHaveValue('app vẫn chạy')
  await page.getByRole('button', { name: 'Dừng / tải lại artifact' }).click()
  await page.getByRole('button', { name: 'Đóng panel' }).click()
  await expect(page.getByTestId('artifact-panel')).toHaveCount(0)
})
