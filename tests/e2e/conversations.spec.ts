import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { goTo, waitForStartup } from './helpers'

// Sắp xếp cuộc trò chuyện ở thanh bên: nhóm, ghim, kéo thả, gợi ý nhóm, nhánh, tiêu đề tự động, tìm kiếm.
// Mỗi thao tác → thanh bên đổi trong 1 GIÂY (cơ chế đồng bộ chung). Chạy được khi KHÔNG có Claude CLI:
// chat + đặt tiêu đề (model rẻ) đều giả lập bằng MMC_FAKE_CHAT.
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
const FAST = { timeout: 1_000 }
let app: ElectronApplication
let page: Page
let userData: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-conversations-e2e-'))
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

type Api = Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>
/** Gọi IPC thẳng từ trang ("thay đổi từ nơi khác" — thanh bên không hề biết). */
async function external(group: string, method: string, ...args: unknown[]): Promise<unknown> {
  return page.evaluate(
    ({ group, method, args }) => (window as unknown as { api: Api }).api[group][method](...args),
    { group, method, args }
  )
}

const box = () => page.getByRole('textbox', { name: /Nhắn cho/ })
const item = (title: string | RegExp) => page.getByTestId('conversation-item').filter({ hasText: title })
const groupSection = (name: string) => page.locator(`[data-testid="group-section"][data-group="${name}"]`)

async function newChat(text: string): Promise<void> {
  await page.getByRole('button', { name: 'Cuộc trò chuyện mới' }).click()
  await box().fill(text)
  await box().press('Enter')
  await expect(page.getByTestId('message-assistant').last()).toContainText('Mizuki (giả lập) đã nhận', { timeout: 20_000 })
}

async function createGroup(name: string): Promise<void> {
  await page.getByTestId('new-group').click()
  await page.getByRole('textbox', { name: 'Tên nhóm' }).fill(name)
  await page.getByRole('button', { name: 'Lưu' }).click()
  await expect(groupSection(name)).toBeVisible(FAST)
}

test('tạo nhóm; tin đầu có tên nhóm → gợi ý ngay; đồng ý → chuyển vào nhóm; AI đặt tiêu đề ngắn', async () => {
  await goTo(page, '#/', box())
  await createGroup('Unity')
  await newChat('Trong Unity làm sao cho nhân vật nhảy?')
  const banner = page.getByTestId('group-suggestion')
  await expect(banner).toContainText('“Unity”')
  // Tiêu đề do model rẻ (giả lập) đặt lại sau lượt trả lời — thanh bên tự cập nhật.
  await expect(item('Chủ đề: Trong Unity làm')).toBeVisible({ timeout: 5_000 })
  await page.getByTestId('suggestion-accept').click()
  await expect(banner).toBeHidden(FAST)
  await expect(groupSection('Unity').getByTestId('conversation-item')).toHaveCount(1, FAST)
})

test('từ khoá không ra → AI gợi ý nhóm; bỏ qua → không chuyển', async () => {
  await createGroup('Nhạc')
  // FAKE_GROUP:2 → model giả chọn nhóm thứ 2 trong danh sách gửi đi ("Nhạc").
  await newChat('tối nay nghe gì cho chill FAKE_GROUP:2')
  const banner = page.getByTestId('group-suggestion')
  await expect(banner).toContainText('“Nhạc”', { timeout: 5_000 })
  await banner.getByRole('button', { name: 'Bỏ qua' }).click()
  await expect(banner).toBeHidden(FAST)
  await expect(groupSection('Nhạc').getByTestId('conversation-item')).toHaveCount(0)
  await expect(page.getByTestId('section-recent').getByTestId('conversation-item')).toHaveCount(1)
})

test('kéo thả vào nhóm / ra khỏi nhóm / vào Đã ghim; ghim luôn ở đầu', async () => {
  const chill = item(/Chủ đề: tối nay nghe/)
  await chill.dragTo(groupSection('Nhạc'))
  await expect(groupSection('Nhạc').getByTestId('conversation-item')).toHaveCount(1, FAST)

  await chill.dragTo(page.getByTestId('section-recent'))
  await expect(page.getByTestId('section-recent').getByTestId('conversation-item')).toHaveCount(1, FAST)

  await chill.hover()
  await chill.getByRole('button', { name: 'Ghim' }).click()
  const pinned = page.getByTestId('section-pinned')
  await expect(pinned.getByTestId('conversation-item')).toHaveCount(1, FAST)
  // Đã ghim nằm trên cùng.
  await expect(page.locator('nav [data-testid^="section-"], nav [data-testid="group-section"]').first()).toHaveAttribute(
    'data-testid',
    'section-pinned'
  )
  await chill.hover()
  await chill.getByRole('button', { name: 'Bỏ ghim' }).click()
  await expect(pinned).toHaveCount(0, FAST)
})

test('thu gọn / mở rộng, đổi tên nhóm; thay đổi từ nơi khác → thanh bên tự cập nhật', async () => {
  const toggle = groupSection('Unity').getByTestId('group-toggle')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false', FAST)
  await expect(groupSection('Unity').getByTestId('conversation-item')).toHaveCount(0, FAST)
  await toggle.click()
  await expect(groupSection('Unity').getByTestId('conversation-item')).toHaveCount(1, FAST)

  await groupSection('Nhạc').getByTestId('group-toggle').hover()
  await groupSection('Nhạc').getByRole('button', { name: 'Đổi tên nhóm' }).click()
  await page.getByRole('textbox', { name: 'Tên nhóm' }).fill('Âm nhạc')
  await page.getByRole('button', { name: 'Lưu' }).click()
  await expect(groupSection('Âm nhạc')).toBeVisible(FAST)

  // Tên trùng (không dấu) → báo lỗi, không đổi.
  await page.getByTestId('new-group').click()
  await page.getByRole('textbox', { name: 'Tên nhóm' }).fill('unity')
  await page.getByRole('button', { name: 'Lưu' }).click()
  await expect(page.getByRole('alert')).toContainText('Đã có nhóm tên này')
  await page.getByRole('button', { name: 'Huỷ' }).or(page.getByRole('button', { name: 'Hủy' })).click()

  await external('conversationGroups', 'create', 'Tâm sự')
  await expect(groupSection('Tâm sự')).toBeVisible(FAST)
})

test('tách nhánh từ một tin → cuộc mới có sẵn ngữ cảnh, thụt vào dưới cuộc gốc', async () => {
  await item(/Chủ đề: Trong Unity/).getByRole('button', { name: /Chủ đề: Trong Unity/ }).click()
  await expect(page.getByTestId('message-user').first()).toContainText('Trong Unity')
  const reply = page.getByTestId('message-assistant').first()
  await reply.hover()
  await reply.getByTestId('fork-message').click()
  const unity = groupSection('Unity')
  await expect(unity.getByTestId('conversation-item')).toHaveCount(2, FAST)
  // Nhánh mở ngay, có sẵn 2 tin (tới tin được tách).
  await expect(page.getByTestId('message-user')).toHaveCount(1)
  await expect(page.getByTestId('message-assistant')).toHaveCount(1)
  const forkRow = unity.locator('li').nth(1)
  await expect(forkRow).toHaveAttribute('style', /padding-left: 12px/)
  await expect(forkRow.getByLabel('Nhánh')).toBeVisible()
  // Gửi tiếp trong nhánh → trợ lý trả lời (fake provider nhận cả lịch sử).
  await box().fill('tiếp trong nhánh')
  await box().press('Enter')
  await expect(page.getByTestId('message-assistant')).toHaveCount(2, { timeout: 20_000 })
})

test('tìm kiếm: theo tiêu đề và theo tên nhóm', async () => {
  const search = page.getByRole('textbox', { name: 'Tìm cuộc trò chuyện' })
  await search.fill('unity')
  await expect(page.getByTestId('conversation-item')).toHaveCount(2)
  // Nhóm không có kết quả bị ẩn khi tìm.
  await expect(groupSection('Tâm sự')).toHaveCount(0)
  await search.fill('âm nhạc')
  await expect(page.getByTestId('conversation-item')).toHaveCount(0)
  await search.fill('tối nay')
  await expect(page.getByTestId('conversation-item')).toHaveCount(1)
  await search.fill('')
  await expect(groupSection('Tâm sự')).toBeVisible()
})

test('xoá nhóm: cuộc trò chuyện vẫn còn, ra khỏi nhóm', async () => {
  await groupSection('Unity').getByTestId('group-toggle').hover()
  await groupSection('Unity').getByRole('button', { name: 'Xoá nhóm' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Xoá nhóm' }).click()
  await expect(groupSection('Unity')).toHaveCount(0, FAST)
  await expect(page.getByTestId('section-recent').getByTestId('conversation-item')).toHaveCount(3, FAST)
})

test('lời nhắn mẫu artifact → tiêu đề là tên artifact (tắt AI đặt tiêu đề trong Cài đặt)', async () => {
  await goTo(page, '#/settings', page.getByTestId('organize-aiTitles'))
  await page.getByTestId('organize-aiTitles').uncheck()
  await expect(page.getByTestId('organize-aiTitles')).not.toBeChecked(FAST)
  await goTo(page, '#/', box())
  await newChat('Tạo artifact type="doc" title="GDD Pixel Quest" cho game của mình')
  await expect(item('GDD Pixel Quest')).toBeVisible(FAST)
  await expect(page.getByTestId('conversation-item').filter({ hasText: 'Tạo artifact' })).toHaveCount(0)
})
