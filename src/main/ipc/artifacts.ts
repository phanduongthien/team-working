import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stripFrontmatter } from '../ai/skills'
import { BrowserWindow, dialog } from 'electron'
import { z } from 'zod'
import { EXPORT_FORMATS, exportSchema, type Theme } from '@shared/artifacts'
import { IPC } from '@shared/ipc'
import { toCsv, toDocx, toPptx, toUnityJson, toXlsx } from '../artifacts/export'
import { ARTIFACT_SCHEME } from '../artifacts/protocol'
import type { ArtifactService } from '../artifacts/service'
import type { HandleFn } from './register'

export type ArtifactsIpcDeps = {
  handle: HandleFn
  service: ArtifactService
  themes(): Theme[]
  getWindow(): BrowserWindow | null
  log: { warn(msg: string): void }
  /** Thư mục mẫu (assistant-skills/artifacts/templates). */
  templatesDir: string
}

const READY_TIMEOUT_MS = 20_000

/** Mở trang artifact trong cửa sổ ẩn (vẫn sandbox + CSP), chờ vẽ xong rồi lấy PDF hoặc SVG. */
async function withHiddenView<T>(url: string, fn: (win: BrowserWindow) => Promise<T>): Promise<T> {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 720,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  try {
    await win.loadURL(url)
    const start = Date.now()
    while (Date.now() - start < READY_TIMEOUT_MS) {
      if (
        await win.webContents.executeJavaScript(
          'document.body && document.body.dataset.ready === "1"'
        )
      )
        break
      await new Promise((r) => setTimeout(r, 150))
    }
    return await fn(win)
  } finally {
    win.destroy()
  }
}

const safeName = (s: string): string =>
  s
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .trim()
    .slice(0, 80) || 'artifact'

export function registerArtifactsIpc({
  handle,
  service,
  themes,
  getWindow,
  log,
  templatesDir
}: ArtifactsIpcDeps): void {
  // Mẫu cho làm game: GDD, bảng cân bằng, roadmap, pitch deck — mỗi mẫu là lời nhắn gửi cho trợ lý.
  handle(IPC.artifactsTemplates, z.undefined(), async () => {
    const files = (await readdir(templatesDir).catch(() => [] as string[]))
      .filter((f) => f.endsWith('.md'))
      .sort()
    return Promise.all(
      files.map(async (f) => {
        const raw = await readFile(join(templatesDir, f), 'utf8')
        return {
          id: f.replace(/.md$/, ''),
          name: /^name:s*(.+)$/m.exec(raw)?.[1]?.trim() ?? f,
          prompt: stripFrontmatter(raw)
        }
      })
    )
  })
  const id = z.uuid()
  handle(IPC.artifactsList, id, (conversationId) => service.list(conversationId))
  handle(IPC.artifactsVersions, id, (artifactId) => service.versions(artifactId))
  handle(
    IPC.artifactsContent,
    z.object({ id, version: z.number().int().min(1).optional() }),
    ({ id: a, version }) => service.content(a, version)
  )
  handle(
    IPC.artifactsSave,
    z.object({ id, content: z.string().max(500_000) }),
    ({ id: a, content }) => service.saveUserVersion(a, content)
  )
  handle(
    IPC.artifactsRestore,
    z.object({ id, version: z.number().int().min(1) }),
    ({ id: a, version }) => service.restore(a, version)
  )
  handle(IPC.artifactsExport, exportSchema, async ({ artifactId, version, format }) => {
    const c = service.content(artifactId, version)
    if (!c) return { error: 'not_found' }
    if (!EXPORT_FORMATS[c.artifact.type].includes(format)) return { error: 'bad_format' }
    const win = getWindow()
    const opts = {
      defaultPath: `${safeName(c.artifact.title)}.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    }
    const picked = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (picked.canceled || !picked.filePath) return { canceled: true as const }
    const src = c.version.content
    const url = `${ARTIFACT_SCHEME}://view/${artifactId}/${version}`
    try {
      let data: Buffer | string
      switch (format) {
        case 'docx':
          data = await toDocx(src, c.artifact.title)
          break
        case 'pptx':
          data = await toPptx(src, c.artifact.title, themes())
          break
        case 'xlsx':
          data = await toXlsx(src, c.artifact.title)
          break
        case 'csv':
          data = '﻿' + toCsv(src) // BOM để Excel đọc đúng tiếng Việt
          break
        case 'json':
          data = c.artifact.type === 'sheet' ? toUnityJson(src) : src
          break
        case 'pdf':
          data = await withHiddenView(url, (w) =>
            w.webContents.printToPDF({
              printBackground: true,
              landscape: c.artifact.type === 'slides',
              pageSize: 'A4'
            })
          )
          break
        case 'svg':
          data = await withHiddenView(url, (w) =>
            w.webContents.executeJavaScript('document.querySelector("svg")?.outerHTML ?? ""')
          )
          if (!data) return { error: 'no_svg' }
          break
        default:
          data = src // md, mmd, html
      }
      await writeFile(picked.filePath, data)
      return { path: picked.filePath }
    } catch (err) {
      log.warn(`Xuất artifact ${format} lỗi: ${(err as Error).message}`)
      return { error: 'export_failed' }
    }
  })
}
