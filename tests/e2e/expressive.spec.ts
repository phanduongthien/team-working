import { mkdtempSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
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

// Chat biểu cảm — chạy được khi KHÔNG có Claude CLI: MMC_FAKE_CHAT (Claude giả lập) + server GIPHY giả.
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
let app: ElectronApplication
let page: Page
let userData: string
let giphy: Server
const giphyCalls: string[] = []

const gif = (id: string, title: string) => ({
  id,
  title,
  images: {
    fixed_height: {
      url: `https://media.giphy.com/media/${id}/200.gif`,
      width: '200',
      height: '150'
    }
  }
})

test.beforeAll(async () => {
  giphy = createServer((req, res) => {
    giphyCalls.push(req.url ?? '')
    const url = new URL(req.url ?? '/', 'http://x')
    const ids = url.searchParams.get('ids')
    const data = ids
      ? ids.split(',').map((id) => gif(id, `fav ${id}`))
      : [gif('cat1', 'happy cat'), gif('cat2', 'dancing cat'), gif('bad', 'x')]
    // Kết quả lạ (không phải *.giphy.com) phải bị app lọc bỏ.
    if (!ids) data[2].images.fixed_height.url = 'https://evil.example/x.gif'
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ data }))
  })
  await new Promise<void>((r) => giphy.listen(0, '127.0.0.1', r))
  userData = mkdtempSync(join(tmpdir(), 'mmc-expressive-e2e-'))
  app = await electron.launch({
    args: [ROOT],
    env: {
      ...process.env,
      TEAM_WORKING_USER_DATA: userData,
      MMC_FAKE_CHAT: '1',
      GIPHY_API_KEY: '', // không dùng key trong .env của máy dev
      MMC_GIPHY_BASE: `http://127.0.0.1:${(giphy.address() as AddressInfo).port}/v1`
    }
  })
  page = await app.firstWindow()
  await waitForStartup(page)
})

test.afterAll(async () => {
  await app?.close()
  giphy?.close()
  rmSync(userData, { recursive: true, force: true })
})

const box = (): ReturnType<Page['getByRole']> => page.getByRole('textbox', { name: /Nhắn cho/ })
const picker = (): ReturnType<Page['getByTestId']> => page.getByTestId('express-picker')
const openPicker = async (tab: string): Promise<void> => {
  if (!(await picker().isVisible())) await page.getByTestId('express-button').click()
  await picker().getByRole('tab', { name: tab }).click()
}

const groupTab = (name: string) => picker().getByRole('tab', { name })

test('emoji: tìm không dấu, chèn vào ô nhập; chưa có gần đây → mở tab mặt cười; chọn xong tab không nhảy', async () => {
  await goTo(page, '#/', box())
  await openPicker('Emoji')
  await expect(groupTab('Mặt cười & cảm xúc')).toHaveAttribute('aria-selected', 'true')
  await expect(picker().getByTestId('emoji-tab-recent')).toBeVisible() // tab 🕘 luôn ở đầu
  await picker()
    .getByLabel(/Tìm emoji/)
    .fill('cuoi')
  await picker().getByTestId('emoji-results').getByRole('button').first().click()
  await expect(box()).toHaveValue(/\p{Extended_Pictographic}/u)
  await picker()
    .getByLabel(/Tìm emoji/)
    .fill('')
  await expect(groupTab('Mặt cười & cảm xúc')).toHaveAttribute('aria-selected', 'true')
  // Bỏ dòng "Đã dùng gần đây" nhỏ ở tab mặt cười — đã có tab riêng.
  await expect(picker().getByTestId('emoji-recent')).toHaveCount(0)
  await picker().getByTestId('emoji-tab-recent').click()
  await expect(picker().getByTestId('emoji-recent').getByRole('button')).toHaveCount(1, { timeout: 1_000 })
  await page.keyboard.press('Escape')
  // Mở lại: đã có gần đây → mở sẵn tab Gần đây.
  await page.getByTestId('express-button').click()
  await expect(picker().getByTestId('emoji-tab-recent')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await box().fill('')
})

test('chưa có key GIPHY: tab GIF/sticker hiện hướng dẫn lấy key, app không lỗi', async () => {
  await openPicker('GIF')
  await expect(picker().getByTestId('giphy-key-help')).toContainText('developers.giphy.com')
  await expect(picker()).toContainText('Powered by GIPHY')
  await picker().getByRole('tab', { name: 'Sticker' }).click()
  await expect(picker().getByTestId('media-item')).toHaveCount(6) // bộ sticker mẫu đóng gói kèm app
  await page.keyboard.press('Escape')
  expect(giphyCalls).toHaveLength(0)
})

test('cài đặt: mặc định Tắt; chọn mức Nhiều, lưu key GIPHY (không hiện lại)', async () => {
  await goTo(page, '#/settings', page.getByTestId('expressive-settings'))
  const mode = page.getByLabel('Mức biểu cảm')
  await expect(mode).toHaveValue('off')
  await mode.selectOption('auto')
  await expect(page.getByTestId('express-auto-status')).toContainText('Hiện tại: Ít')
  await mode.selectOption('high')
  await page.getByLabel('GIPHY API key').fill('abcdef1234567890')
  await page.getByTestId('expressive-settings').getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByTestId('giphy-key-status')).toContainText('Đã lưu key của bạn')
  await expect(page.getByLabel('GIPHY API key')).toHaveValue('')
})

test('Mizuki trả lời: không lộ thẻ [[...]], gửi GIF (tìm theo từ khoá), thả cảm xúc vào tin của bạn', async () => {
  await goTo(page, '#/', box())
  await box().fill('Chào Mizuki nha')
  await box().press('Enter')
  const reply = page.getByTestId('message-assistant').last()
  await expect(reply).toContainText('Mizuki (giả lập) đã nhận', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible()
  await expect(reply).not.toContainText('[[')
  await expect(reply.getByTestId('message-media').locator('img')).toHaveAttribute(
    'src',
    /^https:\/\/media\.giphy\.com\//
  )
  expect(giphyCalls.some((u) => u.includes('/gifs/search') && u.includes('q=happy+cat'))).toBe(true)
  await expect(
    page.getByTestId('message-user').last().getByTestId('reaction-assistant')
  ).toHaveText('❤️')
})

test('thả cảm xúc cho tin của Mizuki; đổi / bỏ; lưu vào lịch sử', async () => {
  const reply = page.getByTestId('message-assistant').last()
  await reply.hover()
  await reply.getByRole('button', { name: 'Thả 😂' }).click()
  await expect(reply.getByTestId('reaction-user')).toHaveText('😂')
  await page.reload()
  await waitForStartup(page)
  await goTo(page, '#/', box())
  await page.getByTitle('Chào Mizuki nha').click()
  const again = page.getByTestId('message-assistant').last()
  await expect(again.getByTestId('reaction-user')).toHaveText('😂')
  await again.getByTestId('reaction-user').click() // bấm lại → bỏ
  await expect(again.getByTestId('reaction-user')).toHaveCount(0)
})

test('GIF: kết quả lạ bị lọc; lưu Yêu thích; gửi từ tab Yêu thích', async () => {
  await openPicker('GIF')
  const items = picker().getByTestId('media-item')
  await expect(items).toHaveCount(2)
  await items.first().hover()
  await items.first().getByRole('button', { name: 'Thêm vào Yêu thích' }).click()
  await picker().getByRole('tab', { name: 'Yêu thích' }).click()
  await expect(picker().getByTestId('media-item')).toHaveCount(1)
  await picker().getByTestId('media-item').getByRole('button', { name: /^Gửi/ }).click()
  const sent = page.getByTestId('message-user').last()
  await expect(sent.getByTestId('message-media').locator('img')).toHaveAttribute(
    'src',
    /media\.giphy\.com\/media\/cat1/
  )
  await expect(page.getByTestId('message-assistant').last()).toContainText('[Người dùng gửi GIF', {
    timeout: 20_000
  })
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible()
})

test('sticker local: Mizuki đáp lại bằng sticker trên máy; gửi sticker mẫu', async () => {
  // Mức Nhiều: GIF/sticker cách nhau ít nhất 2 câu trả lời — câu thứ 3 lại được gửi.
  await box().fill('gửi sticker đi')
  await box().press('Enter')
  const reply = page.getByTestId('message-assistant').last()
  await expect(reply).toContainText('gửi sticker đi', { timeout: 20_000 })
  await expect(reply.getByTestId('message-media').locator('img')).toHaveAttribute(
    'src',
    /^data:image.svg.xml/
  )
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })
  await openPicker('Sticker')
  await picker().getByRole('button', { name: 'Gửi vui', exact: true }).click()
  await expect(
    page.getByTestId('message-user').last().getByTestId('message-media').locator('img')
  ).toHaveAttribute('src', /^data:image.svg.xml/)
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })
})

test('Gần đây: emoji gõ tay + thả cảm xúc đều tính, mới nhất đầu; GIF / sticker có mục riêng; xoá phải bấm hai lần', async () => {
  // Gõ thẳng emoji (như bảng Win + .) rồi gửi → tính vào Gần đây.
  await box().fill('xong rồi 🎉')
  await box().press('Enter')
  await expect(page.getByTestId('message-assistant').last()).toContainText('xong rồi', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 20_000 })

  await page.getByTestId('express-button').click()
  await picker().getByRole('tab', { name: 'Emoji' }).click()
  await expect(picker().getByTestId('emoji-tab-recent')).toHaveAttribute('aria-selected', 'true')
  const recent = picker().getByTestId('emoji-recent').getByRole('button')
  await expect(recent.first()).toHaveText('🎉', { timeout: 1_000 })
  await expect(picker().getByTestId('emoji-recent')).toContainText('😂') // thả cảm xúc ở test trước
  await page.screenshot({ path: 'test-results/emoji-recent.png' })

  await picker().getByRole('tab', { name: 'GIF' }).click()
  await expect(picker().getByTestId('recent-gif').getByTestId('recent-media-item')).toHaveCount(1)
  await picker().getByRole('tab', { name: 'Sticker' }).click()
  await expect(picker().getByTestId('recent-sticker').getByRole('button', { name: 'Gửi vui' })).toBeVisible()

  // Xoá emoji gần đây: lần đầu chỉ hỏi lại.
  await picker().getByRole('tab', { name: 'Emoji' }).click()
  const clear = picker().getByTestId('clear-recent-emoji')
  await clear.click()
  await expect(clear).toHaveText('Bấm lần nữa để xoá')
  await expect(recent).not.toHaveCount(0)
  await clear.click()
  await expect(picker().getByTestId('emoji-recent')).toHaveCount(0, { timeout: 1_000 })
  await expect(picker()).toContainText('Chưa dùng emoji nào')
  await page.keyboard.press('Escape')
  // Chưa có gần đây → lần mở sau về tab mặt cười.
  await page.getByTestId('express-button').click()
  await expect(groupTab('Mặt cười & cảm xúc')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
})
