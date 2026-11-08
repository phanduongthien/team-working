import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { goTo, waitForStartup } from './helpers'

// Trả lời / ghim / thu hồi / sửa & gửi lại — chạy được khi KHÔNG có Claude CLI (MMC_FAKE_CHAT:
// trợ lý giả nhắc lại dòng đầu của prompt → thấy được trích dẫn có tới trợ lý không).
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
const FAST = { timeout: 1_000 }
let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-msg-actions-e2e-'))
  app = await electron.launch({ args: [ROOT], env: { ...process.env, TEAM_WORKING_USER_DATA: userData, MMC_FAKE_CHAT: '1' } })
  page = await app.firstWindow()
  await waitForStartup(page)
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const box = (): ReturnType<Page['getByRole']> => page.getByRole('textbox', { name: /Nhắn cho/ })
const users = (): ReturnType<Page['getByTestId']> => page.getByTestId('message-user')
const replies = (): ReturnType<Page['getByTestId']> => page.getByTestId('message-assistant')
const idle = async (): Promise<void> => {
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })
}
const ask = async (text: string): Promise<void> => {
  const before = await replies().count()
  await box().fill(text)
  await box().press('Enter')
  await expect(replies()).toHaveCount(before + 1, { timeout: 20_000 })
  await idle()
}
const openMenu = async (message: ReturnType<Page['getByTestId']>): Promise<void> => {
  await message.hover()
  await message.getByTestId('message-menu').click()
}

test('trả lời một tin: khung "đang trả lời" trên ô nhập → tin gửi có trích dẫn, trợ lý nhận được đoạn trích', async () => {
  await goTo(page, '#/', box())
  await ask('Quái đi xuyên tường trong Unity')
  await ask('Câu thứ hai')

  await openMenu(replies().first())
  await page.getByRole('menuitem', { name: 'Trả lời' }).click()
  await expect(page.getByTestId('reply-preview')).toContainText('Quái đi xuyên tường', FAST)
  await ask('Giải thích thêm chỗ này')
  await expect(page.getByTestId('reply-preview')).toHaveCount(0)

  const quote = users().last().getByTestId('reply-quote')
  await expect(quote).toContainText('Quái đi xuyên tường')
  // Trợ lý giả nhắc lại dòng đầu prompt = dòng trích dẫn.
  await expect(replies().last()).toContainText('Người dùng đang trả lời câu trả lời trước đó của bạn')
})

test('menu ⋮ có nền đặc (không lộ chữ phía sau) ở cả theme sáng và tối', async () => {
  for (const dark of [false, true]) {
    await page.evaluate((d) => document.documentElement.classList.toggle('dark', d), dark)
    await openMenu(replies().last())
    const menu = page.getByRole('menu')
    const bg = await menu.evaluate((el) => getComputedStyle(el).backgroundColor)
    expect(bg).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/)
    await menu.screenshot({ path: `test-results/message-menu-${dark ? 'dark' : 'light'}.png` })
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0, FAST)
  }
  await page.evaluate(() => document.documentElement.classList.remove('dark'))
})

test('ghim: thanh "tin đã ghim" hiện ngay, bỏ ghim thì mất', async () => {
  await openMenu(users().first())
  await page.getByRole('menuitem', { name: 'Ghim' }).click()
  const bar = page.getByTestId('pinned-bar')
  await expect(bar).toContainText('Quái đi xuyên tường', FAST)
  await expect(users().first().getByTestId('pin-mark')).toBeVisible(FAST)
  await bar.getByRole('button', { name: 'Bỏ ghim' }).click()
  await expect(bar).toHaveCount(0, FAST)
})

test('thu hồi: bấm hai lần → "Tin nhắn đã được thu hồi", không còn nội dung', async () => {
  const target = users().nth(1)
  await openMenu(target)
  await page.getByTestId('message-recall').click()
  await expect(page.getByTestId('message-recall')).toContainText('Bấm lần nữa', FAST)
  await page.getByTestId('message-recall').click()
  await expect(users().nth(1).getByTestId('message-recalled')).toBeVisible(FAST)
  await expect(users().nth(1)).not.toContainText('Câu thứ hai')
})

test('sửa & gửi lại: bỏ tin đó và mọi tin sau, trợ lý trả lời lại nội dung mới', async () => {
  await openMenu(users().first())
  await page.getByRole('menuitem', { name: 'Sửa & gửi lại' }).click()
  const edit = page.getByTestId('message-edit').locator('textarea')
  await edit.fill('Quái đi xuyên tường khi dùng Rigidbody')
  await edit.press('Enter')
  await expect(users()).toHaveCount(1, { timeout: 5_000 })
  await expect(replies()).toHaveCount(1)
  await idle()
  await expect(replies().first()).toContainText('Quái đi xuyên tường khi dùng Rigidbody')
})
