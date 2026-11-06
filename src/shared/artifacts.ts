import { z } from 'zod'
import { FormulaError, evaluate, parseFormula, refsOf, type Node } from './formula'

export const ARTIFACT_TYPES = ['doc', 'slides', 'sheet', 'chart', 'mermaid', 'html'] as const
export type ArtifactType = (typeof ARTIFACT_TYPES)[number]

export type Artifact = {
  id: string
  conversationId: string
  title: string
  type: ArtifactType
  /** Phiên bản mới nhất. */
  version: number
  updatedAt: number
}
export type ArtifactVersion = {
  id: string
  artifactId: string
  version: number
  content: string
  by: 'assistant' | 'user'
  createdAt: number
}

/** Gắn vào tin nhắn của trợ lý: artifact đã tạo / sửa (hoặc lỗi khi sửa). */
export type MessageArtifact = {
  id?: string
  title: string
  type?: ArtifactType
  version?: number
  error?: string
}

export const EXPORT_FORMATS: Record<ArtifactType, string[]> = {
  doc: ['docx', 'pdf', 'md'],
  slides: ['pptx', 'pdf', 'md'],
  sheet: ['xlsx', 'csv', 'json'],
  chart: ['pdf', 'json'],
  mermaid: ['svg', 'pdf', 'mmd'],
  html: ['html', 'pdf']
}
export const exportSchema = z.object({
  artifactId: z.uuid(),
  version: z.number().int().min(1),
  format: z.enum(['docx', 'pdf', 'md', 'pptx', 'xlsx', 'csv', 'json', 'svg', 'mmd', 'html'])
})

// ───────────────────────── Khối trong câu trả lời ─────────────────────────

export type ArtifactOp =
  | { kind: 'create'; type: ArtifactType; title: string; content: string }
  | { kind: 'edit'; title: string; edits: { find: string; replace: string }[] }

const attr = (attrs: string, name: string): string | undefined =>
  new RegExp(`${name}\\s*=\\s*"([^"]{0,200})"`, 'i').exec(attrs)?.[1]?.trim()

const BLOCK = /<artifact(-edit)?\b([^>]*)>([\s\S]*?)<\/artifact\1>/gi
const unescapeXml = (s: string): string =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

/** Tách khối artifact khỏi câu trả lời; phần chữ còn lại để hiển thị trong chat. */
export function parseArtifactBlocks(raw: string): {
  text: string
  ops: ArtifactOp[]
  invalid: string[]
} {
  const ops: ArtifactOp[] = []
  const invalid: string[] = []
  const text = raw.replace(BLOCK, (_m, edit: string | undefined, attrs: string, body: string) => {
    const title = attr(attrs, 'title')
    if (!title) {
      invalid.push('missing_title')
      return ''
    }
    if (edit) {
      const edits = [
        ...body.matchAll(/<find>([\s\S]*?)<\/find>\s*<replace>([\s\S]*?)<\/replace>/gi)
      ].map((m) => ({
        find: unescapeXml(m[1].replace(/^\n|\n$/g, '')),
        replace: unescapeXml(m[2].replace(/^\n|\n$/g, ''))
      }))
      if (edits.length === 0) invalid.push(`no_edits:${title}`)
      else ops.push({ kind: 'edit', title, edits })
      return ''
    }
    const type = (attr(attrs, 'type') ?? 'doc').toLowerCase() as ArtifactType
    if (!ARTIFACT_TYPES.includes(type)) {
      invalid.push(`bad_type:${title}`)
      return ''
    }
    ops.push({ kind: 'create', type, title, content: body.replace(/^\n+|\s+$/g, '') })
    return ''
  })
  return { text: text.replace(/\n{3,}/g, '\n\n').trim(), ops, invalid }
}

/** Đang stream: ẩn khối artifact (kể cả khối chưa đóng) khỏi chữ hiển thị. */
export function hideArtifactBlocks(text: string): { text: string; writing: boolean } {
  const done = text.replace(BLOCK, '')
  const open = /<artifact(-edit)?\b[\s\S]*$/i.exec(done)
  const partialTag = /<a(?:r(?:t(?:i(?:f(?:a(?:c(?:t)?)?)?)?)?)?)?$/i.exec(done)
  const cut = open?.index ?? partialTag?.index
  return { text: (cut === undefined ? done : done.slice(0, cut)).trim(), writing: !!open }
}

export class EditError extends Error {
  constructor(
    readonly code: 'not_found' | 'ambiguous',
    readonly find: string
  ) {
    super(code)
  }
}

/** Áp các cặp find/replace — đoạn find phải khớp ĐÚNG MỘT chỗ, không thì không sửa gì. */
export function applyEdits(content: string, edits: { find: string; replace: string }[]): string {
  let out = content
  for (const { find, replace } of edits) {
    const first = out.indexOf(find)
    if (!find || first < 0) throw new EditError('not_found', find)
    if (out.indexOf(find, first + 1) >= 0) throw new EditError('ambiguous', find)
    out = out.slice(0, first) + replace + out.slice(first + find.length)
  }
  return out
}

// ───────────────────────── Bảng (sheet) ─────────────────────────

export type SheetColumn = { name: string; formula?: string; node?: Node }
export type Sheet = { columns: SheetColumn[]; rows: string[][] }
export type ComputedSheet = Sheet & {
  values: (string | number)[][]
  /** Mức bất thường từng ô số: 0 bình thường, 1 lệch nhiều (vàng), 2 lệch rất nhiều (đỏ). */
  outliers: number[][]
  errors: string[]
}

function csvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (c === '"') q = false
      else cur += c
    } else if (c === '"') q = true
    else if (c === ',') {
      out.push(cur.trim())
      cur = ''
    } else cur += c
  }
  out.push(cur.trim())
  return out
}
const csvCell = (v: string | number): string => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Dòng đầu: tên cột, cột công thức viết "DPS = Damage * AttackSpeed". Các dòng sau: dữ liệu CSV
 * (ô của cột công thức để trống — app tự tính).
 */
export function parseSheet(src: string): Sheet {
  const lines = src
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
  if (lines.length === 0) return { columns: [], rows: [] }
  const columns = csvLine(lines[0]).map((h): SheetColumn => {
    const eq = h.indexOf('=')
    if (eq < 0) return { name: h }
    return { name: h.slice(0, eq).trim(), formula: h.slice(eq + 1).trim() }
  })
  const rows = lines.slice(1).map((l) => {
    const cells = csvLine(l)
    return columns.map((_, i) => cells[i] ?? '')
  })
  return { columns, rows }
}

export function serializeSheet(sheet: Sheet): string {
  const head = sheet.columns
    .map((c) => (c.formula ? `${c.name} = ${c.formula}` : csvCell(c.name)))
    .join(', ')
  return [
    head,
    ...sheet.rows.map((r) =>
      r.map((v, i) => (sheet.columns[i]?.formula ? '' : csvCell(v))).join(', ')
    )
  ].join('\n')
}

const num = (v: string | number): number =>
  typeof v === 'number' ? v : v.trim() === '' ? NaN : Number(v.replace(/,/g, ''))

/** Tính cột công thức (theo thứ tự phụ thuộc) và đánh dấu ô bất thường. */
export function computeSheet(sheet: Sheet): ComputedSheet {
  const errors: string[] = []
  const cols = sheet.columns.map((c) => {
    if (!c.formula) return c
    try {
      return { ...c, node: parseFormula(c.formula) }
    } catch (err) {
      errors.push(`${c.name}: ${(err as FormulaError).message}`)
      return c
    }
  })
  const index = new Map(cols.map((c, i) => [c.name.toLowerCase(), i]))
  for (const c of cols)
    if (c.node)
      for (const r of refsOf(c.node))
        if (!index.has(r.toLowerCase())) errors.push(`${c.name}: không có cột "${r}"`)
  const values = sheet.rows.map((row) => {
    const vals: (string | number)[] = row.map((v) =>
      v !== '' && Number.isFinite(num(v)) ? num(v) : v
    )
    const visiting = new Set<number>()
    const calc = (i: number): number => {
      const c = cols[i]
      if (!c.node) return num(vals[i])
      if (visiting.has(i)) return NaN // vòng lặp công thức
      visiting.add(i)
      const v = evaluate(c.node, (name) => {
        const j = index.get(name.toLowerCase())
        return j === undefined ? NaN : calc(j)
      })
      visiting.delete(i)
      return v
    }
    cols.forEach((c, i) => {
      if (c.node) {
        const v = calc(i)
        vals[i] = Number.isFinite(v) ? Math.round(v * 1e6) / 1e6 : '#LỖI'
      }
    })
    return vals
  })
  // Ô bất thường: |z| ≥ 1,5 → vàng, ≥ 2,5 → đỏ (cột số, ít nhất 3 hàng).
  const outliers = values.map((r) => r.map(() => 0))
  cols.forEach((_, j) => {
    const nums = values.map((r) => r[j]).filter((v): v is number => typeof v === 'number')
    if (nums.length < 3 || nums.length < values.length * 0.6) return
    const mean = nums.reduce((s, v) => s + v, 0) / nums.length
    const sd = Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / nums.length)
    if (sd === 0) return
    values.forEach((r, i) => {
      const v = r[j]
      if (typeof v !== 'number') return
      const z = Math.abs(v - mean) / sd
      outliers[i][j] = z >= 2.5 ? 2 : z >= 1.5 ? 1 : 0
    })
  })
  return { ...sheet, columns: cols, values, outliers, errors }
}

// ───────────────────────── Slide ─────────────────────────

export const SLIDE_LAYOUTS = [
  'title',
  'content',
  'two-column',
  'quote',
  'chart',
  'section'
] as const
export type SlideLayout = (typeof SLIDE_LAYOUTS)[number]
export type ChartSpec = {
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar'
  labels: string[]
  datasets: { label: string; data: number[] }[]
}
export type Slide = {
  layout: SlideLayout
  title: string
  subtitle?: string
  bullets: string[]
  right: string[]
  notes?: string
  chart?: ChartSpec
  quote?: string
}
export type Deck = { theme: string; slides: Slide[] }

export const chartSpecSchema = z.object({
  type: z.enum(['bar', 'line', 'pie', 'doughnut', 'radar']),
  labels: z.array(z.string().max(80)).max(100),
  datasets: z
    .array(z.object({ label: z.string().max(80), data: z.array(z.number()).max(100) }))
    .min(1)
    .max(10)
})

/** "---" ngăn slide; dòng "layout:", "theme:" (slide đầu), "notes:", "chart: {json}"; "|||" ngăn 2 cột. */
export function parseSlides(src: string): Deck {
  let theme = 'mmc-light'
  const slides = src
    .split(/^\s*---\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((block): Slide => {
      const slide: Slide = { layout: 'content', title: '', bullets: [], right: [] }
      let side: 'bullets' | 'right' = 'bullets'
      for (const raw of block.split(/\r?\n/)) {
        const line = raw.trim()
        let m: RegExpExecArray | null
        if ((m = /^theme:\s*([\w-]+)/i.exec(line))) theme = m[1]
        else if ((m = /^layout:\s*([\w-]+)/i.exec(line)))
          slide.layout = (SLIDE_LAYOUTS as readonly string[]).includes(m[1])
            ? (m[1] as SlideLayout)
            : 'content'
        else if ((m = /^notes:\s*(.*)$/i.exec(line))) slide.notes = m[1]
        else if ((m = /^chart:\s*(\{.*\})\s*$/i.exec(line))) {
          try {
            slide.chart = chartSpecSchema.parse(JSON.parse(m[1]))
          } catch {
            slide.bullets.push('(biểu đồ không hợp lệ)')
          }
        } else if (line === '|||') side = 'right'
        else if ((m = /^#\s+(.*)$/.exec(line)) && !slide.title) slide.title = m[1]
        else if ((m = /^##\s+(.*)$/.exec(line))) slide.subtitle = m[1]
        else if ((m = /^>\s?(.*)$/.exec(line)))
          slide.quote = (slide.quote ? `${slide.quote} ` : '') + m[1]
        else if ((m = /^[-*]\s+(.*)$/.exec(line))) slide[side].push(m[1])
        else if (line) slide[side].push(line)
      }
      return slide
    })
  return { theme, slides }
}

// ───────────────────────── Theme ─────────────────────────

export const themeSchema = z.object({
  id: z.string().regex(/^[\w-]{1,40}$/),
  name: z.string().max(60),
  colors: z.object({
    background: z.string().regex(/^#[0-9a-f]{6}$/i),
    text: z.string().regex(/^#[0-9a-f]{6}$/i),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    muted: z.string().regex(/^#[0-9a-f]{6}$/i)
  }),
  fonts: z.object({ heading: z.string().max(60), body: z.string().max(60) }),
  /** Kiểu bố cục: góc bo, viền tiêu đề… (mở rộng sau; skill có thể cung cấp theme). */
  style: z
    .object({ titleBar: z.boolean().default(false), rounded: z.boolean().default(true) })
    .default({ titleBar: false, rounded: true })
})
export type Theme = z.infer<typeof themeSchema>

export const BUILTIN_THEMES: Theme[] = [
  {
    id: 'mmc-light',
    name: 'Sáng',
    colors: { background: '#ffffff', text: '#1f2937', accent: '#6d28d9', muted: '#6b7280' },
    fonts: { heading: 'Segoe UI', body: 'Segoe UI' },
    style: { titleBar: false, rounded: true }
  },
  {
    id: 'mmc-dark',
    name: 'Tối',
    colors: { background: '#111827', text: '#f9fafb', accent: '#f59e0b', muted: '#9ca3af' },
    fonts: { heading: 'Segoe UI', body: 'Segoe UI' },
    style: { titleBar: false, rounded: true }
  },
  {
    id: 'pixel',
    name: 'Pixel (game)',
    colors: { background: '#1b1b3a', text: '#e0e7ff', accent: '#22d3ee', muted: '#a78bfa' },
    fonts: { heading: 'Consolas', body: 'Segoe UI' },
    style: { titleBar: true, rounded: false }
  }
]

export const themeOf = (id: string, extra: Theme[] = []): Theme =>
  [...extra, ...BUILTIN_THEMES].find((t) => t.id === id) ?? BUILTIN_THEMES[0]
