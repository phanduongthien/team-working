import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { goTo, waitForStartup } from './helpers'

// Thanh trên khung chat: tiêu đề, "Gợi ý ghi nhớ", "Artifacts" KHÔNG được chồng lên nhau ở mọi độ rộng cửa sổ
// (lỗi 0.4.0-beta.1: nút Artifacts định vị tuyệt đối đè lên nút Gợi ý ghi nhớ). Chạy được khi không có Claude CLI.
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-chat-header-e2e-'))
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
const header = () => page.getByTestId('chat-header')
const LONG_TITLE =
  'Một tiêu đề cuộc trò chuyện rất rất dài về đồ án game Unity nhiều màn chơi và cách tối ưu hiệu năng cho máy yếu'

async function resize(width: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, w) => {
    const win = BrowserWindow.getAllWindows()[0]
    win.unmaximize()
    win.setSize(w, 800)
  }, width)
  await expect.poll(() => page.evaluate(() => window.innerWidth)).toBeLessThanOrEqual(width)
}

type Box = { x: number; y: number; width: number; height: number }
const rect = async (l: Locator): Promise<Box> => {
  const b = await l.boundingBox()
  expect(b, 'phần tử phải hiện trên màn hình').not.toBeNull()
  return b!
}
const overlap = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5

/** Tiêu đề + hai nút: không phần tử nào chồng lên nhau, tất cả nằm trong thanh trên. */
async function expectNoOverlap(label: string): Promise<void> {
  const parts = {
    title: page.getByTestId('chat-title'),
    suggest: page.getByTestId('suggest-memory'),
    artifacts: page.getByTestId('artifacts-toggle')
  }
  const bar = await rect(header())
  const boxes = Object.fromEntries(
    await Promise.all(Object.entries(parts).map(async ([k, l]) => [k, await rect(l)] as const))
  ) as Record<keyof typeof parts, Box>
  for (const [k, b] of Object.entries(boxes)) {
    expect(b.x, `${label}: ${k} lọt ra trái`).toBeGreaterThanOrEqual(bar.x - 0.5)
    expect(b.x + b.width, `${label}: ${k} lọt ra phải`).toBeLessThanOrEqual(bar.x + bar.width + 0.5)
  }
  expect(overlap(boxes.title, boxes.suggest), `${label}: tiêu đề đè nút Gợi ý ghi nhớ`).toBe(false)
  expect(overlap(boxes.title, boxes.artifacts), `${label}: tiêu đề đè nút Artifacts`).toBe(false)
  expect(overlap(boxes.suggest, boxes.artifacts), `${label}: Gợi ý ghi nhớ đè Artifacts`).toBe(false)
}

test('tạo cuộc trò chuyện có tin nhắn và tiêu đề dài', async () => {
  await goTo(page, '#/', box())
  await page.getByRole('button', { name: 'Cuộc trò chuyện mới' }).click()
  await box().fill('Xin chào Mizuki')
  await box().press('Enter')
  await expect(page.getByTestId('message-assistant').last()).toContainText('Mizuki (giả lập) đã nhận', { timeout: 20_000 })
  const [conv] = (await page.evaluate(() =>
    (window as unknown as { api: { conversations: { list(): Promise<{ id: string }[]> } } }).api.conversations.list()
  )) as { id: string }[]
  await page.evaluate(
    ({ id, title }) =>
      (window as unknown as { api: { conversations: { update(i: unknown): Promise<unknown> } } }).api.conversations.update({ id, title }),
    { id: conv.id, title: LONG_TITLE }
  )
  await expect(page.getByTestId('chat-title')).toHaveText(LONG_TITLE)
})

for (const width of [900, 1100, 1280]) {
  test(`cửa sổ ${width}px: tiêu đề dài và các nút không chồng nhau`, async () => {
    await resize(width)
    await expectNoOverlap(`${width}px`)
    await page.screenshot({ path: `test-results/chat-header-${width}.png` })
    // Hẹp → nút chỉ còn biểu tượng, vẫn có tooltip + tên cho trình đọc màn hình.
    const artifacts = page.getByTestId('artifacts-toggle')
    await expect(artifacts).toHaveAttribute('title', 'Artifacts')
    await expect(page.getByTestId('suggest-memory')).toHaveAccessibleName('Gợi ý ghi nhớ')
    if (width === 900) await expect(artifacts.getByText('Artifacts')).toBeHidden()
    if (width === 1280) await expect(artifacts.getByText('Artifacts')).toBeVisible()
  })
}

test('mở panel Artifacts (khung chat hẹp lại) vẫn không chồng nhau; tiêu đề bị cắt bằng …', async () => {
  await resize(1280)
  await page.getByTestId('artifacts-toggle').click()
  await expect(page.getByTestId('artifacts-toggle')).toHaveAttribute('aria-pressed', 'true')
  await expectNoOverlap('1280px + panel')
  const title = page.getByTestId('chat-title')
  expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/chat-header-1280-panel.png' })
  await page.getByTestId('artifacts-toggle').click()
})
