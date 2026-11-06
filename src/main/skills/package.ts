import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, posix } from 'node:path'
import { unzipSync } from 'fflate'
import {
  SKILL_NAME_RE,
  skillThemeSchema,
  type SkillInstallError,
  type SkillTheme
} from '@shared/skills'
import { parseSkillMd } from './format'

/** Giới hạn gói skill — skill chỉ là chữ nên nhỏ. */
export const LIMITS = {
  files: 100,
  fileBytes: 512 * 1024,
  totalBytes: 2 * 1024 * 1024,
  zipBytes: 5 * 1024 * 1024
}

/** Chỉ giữ file chữ. Script (.py, .sh, .js…) và file nhị phân bị bỏ — app KHÔNG chạy gì kèm skill. */
const TEXT_EXT = new Set(['.md', '.txt', '.json'])

/** Đường dẫn → nội dung; null = file quá lớn (không đọc, chỉ để báo bỏ qua). */
export type RawFiles = Map<string, Uint8Array | null>

export type SkillPackage = {
  name: string
  description: string
  body: string
  /** Đường dẫn tương đối (dấu /) → nội dung, đã bỏ thư mục gốc. Luôn có SKILL.md. */
  files: Map<string, Uint8Array>
  skipped: string[]
  themes: SkillTheme[]
}

export class SkillPackageError extends Error {
  constructor(readonly code: SkillInstallError) {
    super(code)
  }
}

/** Chuẩn hoá đường dẫn trong gói; null nếu nguy hiểm (tuyệt đối, `..`, ổ đĩa). */
export function safeRelPath(raw: string): string | null {
  const p = raw.replace(/\\/g, '/')
  if (!p || p.startsWith('/') || /^[a-z]:/i.test(p) || p.includes('\0')) return null
  if (p.split('/').includes('..')) return null
  return posix.normalize(p).replace(/\/$/, '')
}

const ignored = (path: string): boolean =>
  path.split('/').some((seg) => seg.startsWith('.') || seg === '__MACOSX' || seg === 'node_modules')

/** Đọc thư mục skill (không theo symlink). */
export async function readFolder(dir: string): Promise<RawFiles> {
  const out: RawFiles = new Map()
  let total = 0
  const walk = async (abs: string, rel: string): Promise<void> => {
    for (const entry of await readdir(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${entry.name}` : entry.name
      if (ignored(r)) continue
      if (entry.isDirectory()) await walk(join(abs, entry.name), r)
      else if (entry.isFile()) {
        if (out.size >= LIMITS.files) throw new SkillPackageError('too_large')
        const size = (await stat(join(abs, entry.name))).size
        total += size
        if (total > LIMITS.totalBytes) throw new SkillPackageError('too_large')
        out.set(r, size > LIMITS.fileBytes ? null : await readFile(join(abs, entry.name)))
      }
    }
  }
  await walk(dir, '')
  return out
}

/** Giải nén .zip trong bộ nhớ, kiểm tra kích thước khai báo trước khi giải nén. */
export async function readZip(file: string): Promise<RawFiles> {
  if ((await stat(file)).size > LIMITS.zipBytes) throw new SkillPackageError('too_large')
  const data = await readFile(file)
  let total = 0
  let count = 0
  const big: string[] = []
  let entries: Record<string, Uint8Array>
  try {
    entries = unzipSync(data, {
      filter: (f) => {
        if (f.name.endsWith('/')) return false
        if (++count > LIMITS.files) throw new SkillPackageError('too_large')
        total += f.originalSize
        if (total > LIMITS.totalBytes) throw new SkillPackageError('too_large')
        if (f.originalSize <= LIMITS.fileBytes) return true
        big.push(f.name)
        return false
      }
    })
  } catch (e) {
    if (e instanceof SkillPackageError) throw e
    throw new SkillPackageError('bad_zip')
  }
  const out: RawFiles = new Map()
  for (const [name, bytes] of Object.entries(entries)) {
    // Kích thước khai báo trong zip có thể sai — kiểm tra lại sau khi giải nén.
    if (bytes.byteLength > LIMITS.fileBytes) throw new SkillPackageError('too_large')
    out.set(name, bytes)
  }
  for (const name of big) out.set(name, null)
  return out
}

const decoder = new TextDecoder('utf-8', { fatal: true })
export const asText = (bytes: Uint8Array): string | null => {
  try {
    return decoder.decode(bytes)
  } catch {
    return null
  }
}

export function parseTheme(text: string): SkillTheme | null {
  try {
    const r = skillThemeSchema.safeParse(JSON.parse(text))
    return r.success ? r.data : null
  } catch {
    return null
  }
}

/**
 * Kiểm tra gói: đúng một SKILL.md (ở gốc hoặc trong một thư mục con cấp 1), frontmatter có
 * `name` + `description`, tên hợp lệ; chỉ giữ file chữ; theme `themes/*.json` phải đúng định dạng.
 */
export function inspectPackage(raw: RawFiles, builtinNames: ReadonlySet<string>): SkillPackage {
  const entries: [string, Uint8Array | null][] = []
  const skipped: string[] = []
  for (const [name, bytes] of raw) {
    const rel = safeRelPath(name)
    if (!rel) {
      skipped.push(name)
      continue
    }
    if (!ignored(rel)) entries.push([rel, bytes])
  }

  const skillMds = entries
    .map(([p]) => p)
    .filter((p) => basename(p).toLowerCase() === 'skill.md' && p.split('/').length <= 2)
  if (skillMds.length === 0) throw new SkillPackageError('no_skill_md')
  if (skillMds.length > 1) throw new SkillPackageError('many_skill_md')
  const dir = posix.dirname(skillMds[0])
  const root = dir === '.' ? '' : `${dir}/`

  const files = new Map<string, Uint8Array>()
  const themes: SkillTheme[] = []
  for (const [path, bytes] of entries) {
    if (!path.startsWith(root)) {
      skipped.push(path)
      continue
    }
    const rel = path === skillMds[0] ? 'SKILL.md' : path.slice(root.length)
    const text = bytes && TEXT_EXT.has(posix.extname(rel).toLowerCase()) ? asText(bytes) : null
    if (!bytes || text === null) {
      skipped.push(rel)
      continue
    }
    if (/^themes\/[^/]+\.json$/i.test(rel)) {
      const theme = parseTheme(text)
      if (!theme) {
        skipped.push(rel)
        continue
      }
      themes.push(theme)
    }
    files.set(rel, bytes)
  }

  const md = files.get('SKILL.md')
  const parsed = md ? parseSkillMd(asText(md) ?? '') : null
  if (!parsed || !parsed.name || !parsed.description) throw new SkillPackageError('bad_frontmatter')
  if (!SKILL_NAME_RE.test(parsed.name)) throw new SkillPackageError('bad_name')
  if (builtinNames.has(parsed.name)) throw new SkillPackageError('builtin_name')
  return { ...parsed, files, skipped: skipped.sort(), themes }
}

export async function readSource(path: string): Promise<RawFiles> {
  let info
  try {
    info = await stat(path)
  } catch {
    throw new SkillPackageError('unreadable')
  }
  if (info.isDirectory()) return readFolder(path)
  if (path.toLowerCase().endsWith('.zip')) return readZip(path)
  throw new SkillPackageError('unreadable')
}
