import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { goTo, waitForStartup } from './helpers'

// Trợ lý xin quyền thư mục ở chế độ Tự do — chạy được khi KHÔNG có Claude CLI:
// MMC_FAKE_CHAT ("FAKE_TOOL:<tên> {json}" gọi tool của app như CLI thật),
// MMC_FAKE_FOLDER (hộp chọn thư mục giả trả về thư mục này; chỉ ở bản chưa đóng gói).
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
let app: ElectronApplication
let page: Page
let userData: string
let project: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-folder-e2e-'))
  project = join(userData, 'UnityGame')
  mkdirSync(join(project, 'Assets'), { recursive: true })
  mkdirSync(join(project, 'ProjectSettings'))
  app = await electron.launch({
    args: [ROOT],
    env: { ...process.env, TEAM_WORKING_USER_DATA: userData, MMC_FAKE_CHAT: '1', MMC_FAKE_FOLDER: project }
  })
  page = await app.firstWindow()
  await waitForStartup(page)
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const box = (): ReturnType<Page['getByRole']> => page.getByRole('textbox', { name: /Nhắn cho/ })
const request = (write: boolean): string =>
  `FAKE_TOOL:request_folder_access ${JSON.stringify({ path: 'D:\\unity\\3DCo_Ban', reason: 'Xem script EnemyMoving', write })}`

test('chế độ Tự do: trợ lý xin quyền → người dùng chọn thư mục → thanh thư mục hiện, app tự gửi lượt tiếp tục', async () => {
  await goTo(page, '#/', box())
  await expect(page.getByTestId('code-bar')).toHaveCount(0)
  await box().fill(request(false))
  await box().press('Enter')

  const card = page.getByTestId('folder-access')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card).toContainText('Xem script EnemyMoving')
  await expect(card).toContainText('D:\\unity\\3DCo_Ban')
  await page.getByTestId('folder-access-choose').click()

  await expect(card).toHaveCount(0, { timeout: 1_000 })
  const bar = page.getByTestId('code-bar')
  await expect(bar).toBeVisible({ timeout: 1_000 })
  await expect(bar).toContainText('UnityGame')
  await expect(bar).toContainText('Chỉ đọc')
  // Lượt có tool xong → app tự gửi câu tiếp tục (tool đọc file có từ lượt này).
  await expect(page.getByTestId('message-user').last()).toContainText('đã cấp quyền thư mục', { timeout: 20_000 })
})

test('gỡ thư mục = thu hồi quyền: thanh thư mục biến mất ở chế độ Tự do', async () => {
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('code-clear-folder').click()
  await expect(page.getByTestId('code-bar')).toHaveCount(0, { timeout: 1_000 })
})

test('từ chối: không gắn thư mục, không tự gửi tiếp', async () => {
  const users = page.getByTestId('message-user')
  await box().fill(request(true))
  await box().press('Enter')
  const card = page.getByTestId('folder-access')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card).toContainText('đọc và sửa')
  const count = await users.count()
  await card.getByRole('button', { name: 'Không cho phép' }).click()
  await expect(card).toHaveCount(0, { timeout: 1_000 })
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('code-bar')).toHaveCount(0)
  await expect(users).toHaveCount(count)
})
