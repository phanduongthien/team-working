import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

// Dán ảnh (clipboard THẬT của Windows), dán file copy từ Explorer, kéo thả, gỡ, xem to.
// Chạy được cả khi không có Claude CLI (ô nhập vẫn soạn được, chỉ không gửi).
// Test ghi đè clipboard trong lúc chạy; chữ đang có trong clipboard được trả lại khi xong.

const ROOT = join(__dirname, '..', '..')
let app: ElectronApplication
let page: Page
let userData: string
let savedClipboard = ''

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-attach-e2e-'))
  app = await electron.launch({ args: [ROOT], env: { ...process.env, TEAM_WORKING_USER_DATA: userData } })
  page = await app.firstWindow()
  savedClipboard = await app.evaluate(({ clipboard }) => clipboard.readText().catch(() => ''))
  // Máy không có Claude CLI bị chuyển tới /claude sau lần kiểm tra lúc mở app — chờ xong rồi mới điều hướng.
  await page.evaluate(() => (window.location.hash = '#/claude'))
  await expect(page.getByTestId('cli-status')).not.toContainText(/Đang kiểm tra/, { timeout: 30_000 })
  await page.evaluate(() => (window.location.hash = '#/'))
})

test.afterAll(async () => {
  await app?.evaluate(({ clipboard }, text) => clipboard.writeText(text), savedClipboard).catch(() => {})
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const box = (): ReturnType<Page['getByRole']> => page.getByRole('textbox', { name: /Nhắn cho/ })
const draftThumbs = (): ReturnType<Page['locator']> => page.getByTestId('draft-attachments').getByTestId('image-thumb')
const attachmentFiles = (): string[] => readdirSync(join(userData, 'workspace', 'attachments'))

/** Đặt một ảnh PNG một màu vào clipboard thật (như Win+Shift+S). */
async function copyImage(width: number, height: number, rgb: [number, number, number]): Promise<void> {
  await app.evaluate(
    async ({ clipboard, nativeImage, ClipboardItem }, { width, height, rgb }) => {
      const bgra = Buffer.alloc(width * height * 4)
      for (let i = 0; i < width * height; i++) bgra.set([rgb[2], rgb[1], rgb[0], 255], i * 4)
      const png = nativeImage.createFromBitmap(bgra, { width, height }).toPNG()
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })])
    },
    { width, height, rgb }
  )
}

async function clearDraft(): Promise<void> {
  const remove = page.getByTestId('draft-attachments').getByRole('button', { name: /^Bỏ / })
  while ((await remove.count()) > 0) await remove.first().click()
}

test('Ctrl+V ảnh chụp màn hình → thumbnail trên ô nhập; bấm xem to; X để bỏ', async () => {
  await copyImage(320, 200, [30, 60, 220])
  await box().click()
  await page.keyboard.press('Control+V')
  await expect(draftThumbs()).toHaveCount(1)
  await expect(box()).toHaveValue('')

  await draftThumbs().first().getByRole('button', { name: /^Xem ảnh/ }).click()
  const lightbox = page.getByTestId('image-lightbox')
  await expect(lightbox.locator('img')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(lightbox).toBeHidden()

  await draftThumbs().first().getByRole('button', { name: /^Bỏ / }).click()
  await expect(draftThumbs()).toHaveCount(0)
})

test('dán nhiều ảnh trong một tin; gõ chữ kèm theo vẫn được', async () => {
  for (const color of [[200, 30, 30], [30, 200, 30]] as [number, number, number][]) {
    await copyImage(100, 100, color)
    await box().click()
    await page.keyboard.press('Control+V')
  }
  await expect(draftThumbs()).toHaveCount(2)
  await box().fill('Hai ảnh này khác nhau thế nào?')
  await expect(box()).toHaveValue('Hai ảnh này khác nhau thế nào?')
  await clearDraft()
})

test('ảnh lớn (4000x3000): giữ bản gốc, tạo thêm bản thu nhỏ cho Claude', async () => {
  const before = new Set(attachmentFiles())
  await copyImage(4000, 3000, [240, 210, 20])
  await box().click()
  await page.keyboard.press('Control+V')
  await expect(draftThumbs()).toHaveCount(1, { timeout: 30_000 })
  const added = attachmentFiles().filter((f) => !before.has(f))
  expect(added.some((f) => /^[0-9a-f-]{36}\.png$/.test(f))).toBe(true)
  expect(added.some((f) => /\.model\.(png|jpg)$/.test(f))).toBe(true)
  expect(added.some((f) => f.endsWith('.thumb.jpg'))).toBe(true)
  await clearDraft()
})

test('dán chữ thường vẫn như cũ (không biến thành file)', async () => {
  await app.evaluate(({ clipboard }) => clipboard.writeText('dán chữ bình thường'))
  await box().fill('')
  await box().click()
  await page.keyboard.press('Control+V')
  await expect(box()).toHaveValue('dán chữ bình thường')
  await expect(page.getByTestId('draft-attachments')).toHaveCount(0)
  await box().fill('')
})

test('dán file copy từ File Explorer (nhiều file) → đính kèm đủ', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mmc-attach-files-'))
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage.createFromBitmap(Buffer.alloc(50 * 40 * 4, 128), { width: 50, height: 40 }).toPNG().toString('base64')
  )
  writeFileSync(join(dir, 'level.png'), Buffer.from(png, 'base64'))
  writeFileSync(join(dir, 'notes.md'), '# Ghi chú')
  // Set-Clipboard -Path đặt danh sách file vào clipboard giống hệt Ctrl+C trong Explorer.
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Set-Clipboard -Path '${join(dir, 'level.png')}','${join(dir, 'notes.md')}'`])
  try {
    await box().click()
    await page.keyboard.press('Control+V')
    await expect(draftThumbs()).toHaveCount(1)
    await expect(page.getByTestId('draft-attachments')).toContainText('notes.md')
  } finally {
    await clearDraft()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('kéo thả ảnh vào khung chat → hiện vùng thả, thả xong có thumbnail; file giả mạo bị từ chối', async () => {
  const png = await app.evaluate(({ nativeImage }) =>
    nativeImage.createFromBitmap(Buffer.alloc(64 * 64 * 4, 90), { width: 64, height: 64 }).toPNG().toString('base64')
  )
  await page.evaluate((b64) => {
    const zone = document.querySelector('[data-testid="chat-drop-zone"]')!
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }))
    dt.items.add(new File(['MZ not really an image'], 'fake.png', { type: 'image/png' }))
    zone.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }))
    ;(window as unknown as { __dt: DataTransfer }).__dt = dt
  }, png)
  await expect(page.getByTestId('drop-overlay')).toBeVisible()
  await page.evaluate(() => {
    const zone = document.querySelector('[data-testid="chat-drop-zone"]')!
    const dt = (window as unknown as { __dt: DataTransfer }).__dt
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }))
  })
  await expect(page.getByTestId('drop-overlay')).toBeHidden()
  await expect(draftThumbs()).toHaveCount(1)
  await expect(page.getByTestId('attach-problems')).toContainText('fake.png')
  await clearDraft()
})

// Gọi Claude thật (tốn hạn mức): dán ảnh một màu + câu hỏi → trợ lý nói đúng màu; lịch sử hiện thumbnail.
test('chat thật: dán ảnh + gõ câu hỏi, Enter → trợ lý "nhìn" được ảnh', async () => {
  test.skip(process.env.E2E_REAL_CLI !== '1', 'Đặt E2E_REAL_CLI=1 để gọi Claude thật')
  await copyImage(400, 300, [220, 30, 30])
  await box().click()
  await page.keyboard.press('Control+V')
  await expect(draftThumbs()).toHaveCount(1)
  await box().fill('Ảnh mình vừa dán có màu chủ đạo là gì? Trả lời một câu ngắn.')
  await box().press('Enter')
  await expect(page.getByTestId('draft-attachments')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 120_000 })
  const reply = await page.locator('.markdown').last().innerText()
  expect(reply.toLowerCase()).toMatch(/đỏ|red/)
  // Lịch sử: tin của người dùng hiện thumbnail, bấm xem to được.
  const historyThumb = page.getByTestId('image-thumb').last()
  await expect(historyThumb.locator('img')).toBeVisible()
  await historyThumb.getByRole('button', { name: /^Xem ảnh/ }).click()
  await expect(page.getByTestId('image-lightbox').locator('img')).toBeVisible()
  await page.keyboard.press('Escape')
})
