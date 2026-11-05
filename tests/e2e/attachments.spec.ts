import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'

// Dán ảnh, dán file copy từ Explorer, kéo thả, gỡ, xem to — KHÔNG đụng clipboard thật của người dùng:
// sự kiện dán được tạo trong trang, phần main đọc clipboard dùng clipboard giả (MMC_FAKE_CLIPBOARD_DIR,
// chỉ có ở bản chưa đóng gói). Thử với clipboard thật: tests/e2e/clipboard-real.spec.ts (E2E_REAL_CLIPBOARD=1).
// Chạy được cả khi không có Claude CLI (ô nhập vẫn soạn được, chỉ không gửi).

const ROOT = join(__dirname, '..', '..')
let app: ElectronApplication
let page: Page
let userData: string
let fakeClip: string

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-attach-e2e-'))
  fakeClip = join(userData, 'fake-clipboard')
  mkdirSync(fakeClip)
  app = await electron.launch({
    args: [ROOT],
    env: { ...process.env, TEAM_WORKING_USER_DATA: userData, MMC_FAKE_CLIPBOARD_DIR: fakeClip }
  })
  page = await app.firstWindow()
  // Máy không có Claude CLI bị chuyển tới /claude sau lần kiểm tra lúc mở app — chờ xong rồi mới điều hướng.
  await page.evaluate(() => (window.location.hash = '#/claude'))
  await expect(page.getByTestId('cli-status')).not.toContainText(/Đang kiểm tra/, { timeout: 30_000 })
  await page.evaluate(() => (window.location.hash = '#/'))
})

test.afterAll(async () => {
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

test.afterEach(async () => {
  rmSync(join(fakeClip, 'image.png'), { force: true })
  rmSync(join(fakeClip, 'uri-list.txt'), { force: true })
  const remove = page.getByTestId('draft-attachments').getByRole('button', { name: /^Bỏ / })
  while ((await remove.count()) > 0) await remove.first().click()
  await box().fill('')
})

const box = (): ReturnType<Page['getByRole']> => page.getByRole('textbox', { name: /Nhắn cho/ })
const draftThumbs = (): ReturnType<Page['locator']> => page.getByTestId('draft-attachments').getByTestId('image-thumb')
const attachmentFiles = (): string[] => readdirSync(join(userData, 'workspace', 'attachments'))

/** PNG một màu (base64), tạo bằng nativeImage của Electron. */
const pngBase64 = (width: number, height: number, rgb: [number, number, number]): Promise<string> =>
  app.evaluate(
    ({ nativeImage }, { width, height, rgb }) => {
      const bgra = Buffer.alloc(width * height * 4)
      for (let i = 0; i < width * height; i++) bgra.set([rgb[2], rgb[1], rgb[0], 255], i * 4)
      return nativeImage.createFromBitmap(bgra, { width, height }).toPNG().toString('base64')
    },
    { width, height, rgb }
  )

/**
 * Bắn sự kiện Ctrl+V vào ô nhập với dữ liệu cho trước (như trình duyệt tạo khi dán).
 * Trả về true nếu app chặn hành vi mặc định (tức là đã xử lý thành đính kèm).
 */
function paste(data: { files?: { name: string; b64: string; type: string }[]; strings?: Record<string, string> }): Promise<boolean> {
  return page.evaluate((d) => {
    const dt = new DataTransfer()
    for (const f of d.files ?? []) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: f.type }))
    for (const [type, value] of Object.entries(d.strings ?? {})) dt.setData(type, value)
    const textarea = document.querySelector('textarea')!
    textarea.focus()
    const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })
    textarea.dispatchEvent(ev)
    return ev.defaultPrevented
  }, data)
}

test('dán ảnh chụp màn hình (trình duyệt đưa ra File) → thumbnail; bấm xem to; X để bỏ', async () => {
  expect(await paste({ files: [{ name: 'image.png', b64: await pngBase64(320, 200, [30, 60, 220]), type: 'image/png' }] })).toBe(true)
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

test('ảnh bitmap không kèm File (Print Screen, Photoshop) → main đọc clipboard', async () => {
  writeFileSync(join(fakeClip, 'image.png'), Buffer.from(await pngBase64(200, 120, [200, 30, 30]), 'base64'))
  expect(await paste({ strings: { 'image/png': '' } })).toBe(true)
  await expect(draftThumbs()).toHaveCount(1)
  await expect(page.getByTestId('draft-attachments').getByRole('button', { name: /^Xem ảnh anh-dan-/ })).toBeVisible()
})

test('dán nhiều ảnh trong một tin; gõ chữ kèm theo vẫn được', async () => {
  for (const color of [[200, 30, 30], [30, 200, 30]] as [number, number, number][]) {
    await paste({ files: [{ name: 'image.png', b64: await pngBase64(100, 100, color), type: 'image/png' }] })
  }
  await expect(draftThumbs()).toHaveCount(2)
  await box().fill('Hai ảnh này khác nhau thế nào?')
  await expect(box()).toHaveValue('Hai ảnh này khác nhau thế nào?')
})

test('ảnh lớn (4000x3000): giữ bản gốc, tạo thêm bản thu nhỏ cho Claude', async () => {
  const before = new Set(attachmentFiles())
  writeFileSync(join(fakeClip, 'image.png'), Buffer.from(await pngBase64(4000, 3000, [240, 210, 20]), 'base64'))
  await paste({ strings: { 'image/png': '' } })
  await expect(draftThumbs()).toHaveCount(1, { timeout: 30_000 })
  const added = attachmentFiles().filter((f) => !before.has(f))
  expect(added.some((f) => /^[0-9a-f-]{36}\.png$/.test(f))).toBe(true)
  expect(added.some((f) => /\.model\.(png|jpg)$/.test(f))).toBe(true)
  expect(added.some((f) => f.endsWith('.thumb.jpg'))).toBe(true)
})

test('dán chữ thường → để trình duyệt dán như cũ, không biến thành file (kể cả khi kèm ảnh, vd copy từ Word)', async () => {
  expect(await paste({ strings: { 'text/plain': 'dán chữ bình thường' } })).toBe(false)
  expect(
    await paste({
      strings: { 'text/plain': 'đoạn văn từ Word', 'text/html': '<p>đoạn văn</p>' },
      files: [{ name: 'image.png', b64: await pngBase64(10, 10, [0, 0, 0]), type: 'image/png' }]
    })
  ).toBe(false)
  await expect(page.getByTestId('draft-attachments')).toHaveCount(0)
})

test('dán file copy từ File Explorer (nhiều file) → đính kèm đủ', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mmc-attach-files-'))
  try {
    writeFileSync(join(dir, 'level.png'), Buffer.from(await pngBase64(50, 40, [128, 128, 128]), 'base64'))
    writeFileSync(join(dir, 'notes.md'), '# Ghi chú')
    const uris = [pathToFileURL(join(dir, 'level.png')).href, pathToFileURL(join(dir, 'notes.md')).href].join('\r\n')
    writeFileSync(join(fakeClip, 'uri-list.txt'), uris)
    expect(await paste({ strings: { 'text/uri-list': uris } })).toBe(true)
    await expect(draftThumbs()).toHaveCount(1)
    await expect(page.getByTestId('draft-attachments')).toContainText('notes.md')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('kéo thả ảnh vào khung chat → hiện vùng thả, thả xong có thumbnail; file giả mạo bị từ chối', async () => {
  const png = await pngBase64(64, 64, [90, 90, 90])
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
})

// Gọi Claude thật (tốn hạn mức): dán ảnh một màu + câu hỏi → trợ lý nói đúng màu; lịch sử hiện thumbnail.
test('chat thật: dán ảnh + gõ câu hỏi, Enter → trợ lý "nhìn" được ảnh', async () => {
  test.skip(process.env.E2E_REAL_CLI !== '1', 'Đặt E2E_REAL_CLI=1 để gọi Claude thật')
  await paste({ files: [{ name: 'image.png', b64: await pngBase64(400, 300, [220, 30, 30]), type: 'image/png' }] })
  await expect(draftThumbs()).toHaveCount(1)
  await box().fill('Ảnh mình vừa dán có màu chủ đạo là gì? Trả lời một câu ngắn.')
  await box().press('Enter')
  await expect(page.getByTestId('draft-attachments')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Gửi' })).toBeVisible({ timeout: 120_000 })
  const reply = await page.locator('.markdown').last().innerText()
  expect(reply.toLowerCase()).toMatch(/đỏ|red/)
  const historyThumb = page.getByTestId('image-thumb').last()
  await expect(historyThumb.locator('img')).toBeVisible()
  await historyThumb.getByRole('button', { name: /^Xem ảnh/ }).click()
  await expect(page.getByTestId('image-lightbox').locator('img')).toBeVisible()
  await page.keyboard.press('Escape')
})
