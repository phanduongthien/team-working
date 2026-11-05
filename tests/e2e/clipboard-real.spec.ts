import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { goTo, waitForStartup } from './helpers'

// Dán bằng Ctrl+V với CLIPBOARD THẬT của Windows — chỉ chạy khi đặt E2E_REAL_CLIPBOARD=1.
// Nội dung clipboard trước khi chạy (ảnh, chữ, HTML, RTF) được lưu lại và trả lại khi xong.
// Không trả lại được: danh sách file copy từ Explorer (định dạng riêng của Windows).
test.skip(process.env.E2E_REAL_CLIPBOARD !== '1', 'Đặt E2E_REAL_CLIPBOARD=1 để thử với clipboard thật')
test.describe.configure({ mode: 'serial' })

const ROOT = join(__dirname, '..', '..')
const RESTORABLE = ['image/png', 'text/plain', 'text/html', 'text/rtf']
type Saved = Record<string, string>[]

let app: ElectronApplication
let page: Page
let userData: string
let saved: Saved = []

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'mmc-clip-real-'))
  app = await electron.launch({ args: [ROOT], env: { ...process.env, TEAM_WORKING_USER_DATA: userData } })
  page = await app.firstWindow()
  saved = await app.evaluate(async ({ clipboard }, types) => {
    const out: Record<string, string>[] = []
    for (const item of await clipboard.read()) {
      const rec: Record<string, string> = {}
      for (const t of item.types.filter((x) => types.includes(x))) {
        rec[t] = Buffer.from(await ((await item.getType(t)) as Blob).arrayBuffer()).toString('base64')
      }
      if (Object.keys(rec).length) out.push(rec)
    }
    return out
  }, RESTORABLE)
  await waitForStartup(page)
  await goTo(page, '#/', page.getByRole('textbox', { name: /Nhắn cho/ }))
})

test.afterAll(async () => {
  await app
    ?.evaluate(async ({ clipboard, ClipboardItem }, items) => {
      if (items.length === 0) return clipboard.clear()
      await clipboard.write(
        items.map(
          (rec) =>
            new ClipboardItem(
              Object.fromEntries(Object.entries(rec).map(([t, b64]) => [t, new Blob([Buffer.from(b64, 'base64')], { type: t })]))
            )
        )
      )
    }, saved)
    .catch(() => {})
  await app?.close()
  rmSync(userData, { recursive: true, force: true })
})

const box = (): ReturnType<Page['getByRole']> => page.getByRole('textbox', { name: /Nhắn cho/ })
const thumbs = (): ReturnType<Page['locator']> => page.getByTestId('draft-attachments').getByTestId('image-thumb')

test('Ctrl+V ảnh thật (như Win+Shift+S) → thumbnail', async () => {
  await app.evaluate(async ({ clipboard, nativeImage, ClipboardItem }) => {
    const png = nativeImage.createFromBitmap(Buffer.alloc(120 * 80 * 4, 160), { width: 120, height: 80 }).toPNG()
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })])
  })
  await box().click()
  await page.keyboard.press('Control+V')
  await expect(thumbs()).toHaveCount(1)
})

test('Ctrl+V chữ thật → dán chữ như cũ', async () => {
  await app.evaluate(({ clipboard }) => clipboard.writeText('dán chữ thật'))
  await box().fill('')
  await box().click()
  await page.keyboard.press('Control+V')
  await expect(box()).toHaveValue('dán chữ thật')
})

test('Ctrl+V file copy từ Explorer (Set-Clipboard -Path, nhiều file)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mmc-clip-files-'))
  try {
    writeFileSync(join(dir, 'a.md'), '# A')
    writeFileSync(join(dir, 'b.md'), '# B')
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Set-Clipboard -Path '${join(dir, 'a.md')}','${join(dir, 'b.md')}'`])
    await box().fill('')
    await box().click()
    await page.keyboard.press('Control+V')
    await expect(page.getByTestId('draft-attachments')).toContainText('a.md')
    await expect(page.getByTestId('draft-attachments')).toContainText('b.md')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
