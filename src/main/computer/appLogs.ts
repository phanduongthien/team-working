import { open, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

export const LOG_SOURCES = ['unity_editor', 'unity_editor_prev', 'unity_upm', 'unity_crash', 'blender_crash'] as const
export type LogSourceId = (typeof LOG_SOURCES)[number]

/** Gốc thư mục (%LOCALAPPDATA%, %TEMP%) — tách ra để test/e2e dùng thư mục giả. */
export type LogRoots = { localAppData: string; temp: string }

export type FoundLog = { id: LogSourceId; label: string; path: string; modified: number; size: number }

const LABELS: Record<LogSourceId, string> = {
  unity_editor: 'Unity Editor — phiên hiện tại (Editor.log)',
  unity_editor_prev: 'Unity Editor — phiên trước (Editor-prev.log)',
  unity_upm: 'Unity Package Manager (upm.log)',
  unity_crash: 'Unity — báo cáo crash gần nhất',
  blender_crash: 'Blender — báo cáo crash gần nhất (*.crash.txt)'
}

async function fileInfo(path: string): Promise<{ modified: number; size: number } | null> {
  const s = await stat(path).catch(() => null)
  return s?.isFile() ? { modified: s.mtimeMs, size: s.size } : null
}

/** File mới nhất khớp điều kiện trong một thư mục (không đệ quy). */
async function newest(dir: string, match: (name: string, isDir: boolean) => boolean): Promise<{ path: string; isDir: boolean } | null> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  let best: { path: string; isDir: boolean; mtime: number } | null = null
  for (const e of entries) {
    if (!match(e.name, e.isDirectory())) continue
    const p = join(dir, e.name)
    const s = await stat(p).catch(() => null)
    if (s && (!best || s.mtimeMs > best.mtime)) best = { path: p, isDir: e.isDirectory(), mtime: s.mtimeMs }
  }
  return best
}

async function resolveSource(id: LogSourceId, roots: LogRoots): Promise<string | null> {
  const unity = join(roots.localAppData, 'Unity', 'Editor')
  switch (id) {
    case 'unity_editor':
      return join(unity, 'Editor.log')
    case 'unity_editor_prev':
      return join(unity, 'Editor-prev.log')
    case 'unity_upm':
      return join(unity, 'upm.log')
    case 'unity_crash': {
      const dir = await newest(join(roots.localAppData, 'Temp', 'Unity', 'Editor', 'Crashes'), (_n, isDir) => isDir)
      if (!dir) return null
      for (const name of ['error.log', 'Editor.log']) if (await fileInfo(join(dir.path, name))) return join(dir.path, name)
      return null
    }
    case 'blender_crash':
      return (await newest(roots.temp, (n, isDir) => !isDir && n.toLowerCase().endsWith('.crash.txt')))?.path ?? null
  }
}

export async function findLogs(roots: LogRoots): Promise<FoundLog[]> {
  const found: FoundLog[] = []
  for (const id of LOG_SOURCES) {
    const path = await resolveSource(id, roots)
    const info = path ? await fileInfo(path) : null
    if (path && info) found.push({ id, label: LABELS[id], path, ...info })
  }
  return found
}

/** Che tên người dùng trong đường dẫn trước khi gửi cho Claude. */
export function displayPath(path: string, roots: LogRoots): string {
  const swap = (p: string, root: string, name: string): string =>
    root && p.toLowerCase().startsWith(root.toLowerCase()) ? `${name}${p.slice(root.length)}` : p
  return swap(swap(path, roots.temp, '%TEMP%'), roots.localAppData, '%LOCALAPPDATA%')
}

// Không dùng \b ở đầu: tên lỗi thường ghép liền (NullReferenceException, KeyError).
const ERROR_LINE = /(error|exception|failed|failure|traceback|fatal|crash|assert)/i
const CONTEXT_AFTER = 4
const READ_BYTES = 1024 * 1024
const MAX_CHARS = 40_000

/**
 * Đọc các dòng cuối của log. `errorsOnly`: chỉ dòng lỗi + vài dòng ngay sau (stack trace Unity/Python).
 * Chỉ đọc tối đa 1 MB cuối file — log Unity có thể rất lớn.
 */
export async function readLogTail(path: string, opts: { lines: number; errorsOnly: boolean }): Promise<{ text: string; shown: number; partial: boolean }> {
  const handle = await open(path, 'r')
  let raw: string
  let partial = false
  try {
    const { size } = await handle.stat()
    const start = Math.max(0, size - READ_BYTES)
    partial = start > 0
    const buf = Buffer.alloc(size - start)
    await handle.read(buf, 0, buf.length, start)
    raw = buf.toString('utf8')
  } finally {
    await handle.close()
  }
  let lines = raw.split(/\r?\n/)
  if (partial) lines = lines.slice(1) // dòng đầu bị cắt giữa chừng
  if (lines.at(-1) === '') lines.pop()

  if (opts.errorsOnly) {
    const keep = new Set<number>()
    lines.forEach((line, i) => {
      if (!ERROR_LINE.test(line)) return
      for (let j = i; j <= Math.min(lines.length - 1, i + CONTEXT_AFTER); j++) keep.add(j)
    })
    lines = lines.filter((_l, i) => keep.has(i))
  }
  lines = lines.slice(-opts.lines)
  let text = lines.join('\n')
  if (text.length > MAX_CHARS) {
    text = text.slice(-MAX_CHARS)
    partial = true
  }
  return { text, shown: lines.length, partial }
}
