import ExcelJS from 'exceljs'
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import { marked, type Token, type Tokens } from 'marked'
import PptxGenJS from 'pptxgenjs'
import { computeSheet, parseSheet, parseSlides, themeOf, type Theme } from '@shared/artifacts'
import { parseFormula, toExcel } from '@shared/formula'

// ───────────── docx (Markdown → Word, sửa được) ─────────────

function inlineRuns(
  tokens: Token[] | undefined,
  style: { bold?: boolean; italics?: boolean } = {}
): TextRun[] {
  const out: TextRun[] = []
  for (const t of tokens ?? []) {
    if (t.type === 'strong')
      out.push(...inlineRuns((t as Tokens.Strong).tokens, { ...style, bold: true }))
    else if (t.type === 'em')
      out.push(...inlineRuns((t as Tokens.Em).tokens, { ...style, italics: true }))
    else if (t.type === 'codespan')
      out.push(new TextRun({ text: (t as Tokens.Codespan).text, font: 'Consolas', ...style }))
    else if (t.type === 'link') out.push(...inlineRuns((t as Tokens.Link).tokens, style))
    else if (t.type === 'br') out.push(new TextRun({ text: '', break: 1 }))
    else if ('tokens' in t && Array.isArray(t.tokens)) out.push(...inlineRuns(t.tokens, style))
    else out.push(new TextRun({ text: 'text' in t ? String(t.text) : t.raw, ...style }))
  }
  return out
}

const HEADINGS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
]

export async function toDocx(markdown: string, title: string): Promise<Buffer> {
  const children: (Paragraph | Table)[] = []
  const walk = (tokens: Token[], listLevel = 0, ordered = false): void => {
    for (const t of tokens) {
      switch (t.type) {
        case 'heading':
          children.push(
            new Paragraph({
              heading: HEADINGS[(t as Tokens.Heading).depth - 1],
              children: inlineRuns((t as Tokens.Heading).tokens)
            })
          )
          break
        case 'paragraph':
          children.push(new Paragraph({ children: inlineRuns((t as Tokens.Paragraph).tokens) }))
          break
        case 'list':
          for (const item of (t as Tokens.List).items) {
            const [first, ...rest] = item.tokens
            const runs =
              first && 'tokens' in first
                ? inlineRuns(first.tokens as Token[])
                : [new TextRun(item.text)]
            children.push(
              (t as Tokens.List).ordered
                ? new Paragraph({
                    numbering: { reference: 'num', level: Math.min(listLevel, 2) },
                    children: runs
                  })
                : new Paragraph({ bullet: { level: Math.min(listLevel, 2) }, children: runs })
            )
            walk(
              rest.filter((x) => x.type === 'list'),
              listLevel + 1,
              ordered
            )
          }
          break
        case 'code': {
          const code = t as Tokens.Code
          if (code.lang === 'mermaid' || code.lang === 'chart') {
            children.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `[${code.lang === 'mermaid' ? 'Sơ đồ' : 'Biểu đồ'} — xem bản PDF]`,
                    italics: true
                  })
                ]
              })
            )
          } else
            for (const line of code.text.split('\n'))
              children.push(
                new Paragraph({
                  children: [new TextRun({ text: line, font: 'Consolas', size: 18 })]
                })
              )
          break
        }
        case 'blockquote':
          children.push(
            new Paragraph({
              indent: { left: 400 },
              children: inlineRuns(
                (t as Tokens.Blockquote).tokens.flatMap((x) =>
                  'tokens' in x ? (x.tokens as Token[]) : []
                )
              )
            })
          )
          break
        case 'table': {
          const tb = t as Tokens.Table
          const row = (cells: Tokens.TableCell[], header: boolean): TableRow =>
            new TableRow({
              children: cells.map(
                (c) =>
                  new TableCell({
                    children: [new Paragraph({ children: inlineRuns(c.tokens, { bold: header }) })]
                  })
              )
            })
          children.push(
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [row(tb.header, true), ...tb.rows.map((r) => row(r, false))]
            })
          )
          break
        }
        case 'hr':
          children.push(new Paragraph({ thematicBreak: true, children: [] }))
          break
      }
    }
  }
  walk(marked.lexer(markdown, { gfm: true }))
  const doc = new Document({
    title,
    numbering: {
      config: [
        {
          reference: 'num',
          levels: [0, 1, 2].map((level) => ({
            level,
            format: 'decimal' as const,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START
          }))
        }
      ]
    },
    sections: [{ children }]
  })
  return Packer.toBuffer(doc)
}

// ───────────── pptx (slide Markdown → PowerPoint, sửa được) ─────────────

const hex = (c: string): string => c.replace('#', '')

export async function toPptx(markdown: string, title: string, themes: Theme[]): Promise<Buffer> {
  const deck = parseSlides(markdown)
  const theme = themeOf(deck.theme, themes)
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = title
  const text = { color: hex(theme.colors.text), fontFace: theme.fonts.body }
  for (const s of deck.slides) {
    const slide = pptx.addSlide()
    slide.background = { color: hex(theme.colors.background) }
    const big = s.layout === 'title' || s.layout === 'section'
    slide.addText(s.title, {
      x: 0.6,
      y: big ? 2.4 : 0.4,
      w: 12,
      h: big ? 1.4 : 0.9,
      fontSize: big ? 40 : 30,
      bold: true,
      color: hex(theme.colors.accent),
      fontFace: theme.fonts.heading
    })
    if (s.subtitle)
      slide.addText(s.subtitle, {
        x: 0.6,
        y: big ? 3.8 : 1.3,
        w: 12,
        h: 0.7,
        fontSize: 20,
        color: hex(theme.colors.muted),
        fontFace: theme.fonts.body
      })
    if (s.quote)
      slide.addText(s.quote, { x: 1, y: 2.5, w: 11, h: 2, fontSize: 28, italic: true, ...text })
    const bullets = (items: string[], x: number, w: number): void => {
      if (items.length)
        slide.addText(
          items.map((b) => ({ text: b, options: { bullet: true } })),
          { x, y: 1.8, w, h: 5, fontSize: 20, valign: 'top', ...text }
        )
    }
    if (s.layout === 'two-column') {
      bullets(s.bullets, 0.6, 5.9)
      bullets(s.right, 6.8, 5.9)
    } else bullets(s.bullets, 0.6, s.chart ? 5.5 : 12)
    if (s.chart) {
      const type = s.chart.type as PptxGenJS.CHART_NAME
      slide.addChart(
        type,
        s.chart.datasets.map((d) => ({ name: d.label, labels: s.chart!.labels, values: d.data })),
        {
          x: s.bullets.length ? 6.3 : 1.5,
          y: 1.8,
          w: s.bullets.length ? 6.5 : 10,
          h: 5,
          showLegend: true,
          legendColor: hex(theme.colors.text),
          catAxisLabelColor: hex(theme.colors.text),
          valAxisLabelColor: hex(theme.colors.text)
        }
      )
    }
    if (s.notes) slide.addNotes(s.notes)
  }
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
}

// ───────────── Bảng: xlsx (giữ công thức), csv, json (cho Unity) ─────────────

const colLetter = (i: number): string =>
  i < 26
    ? String.fromCharCode(65 + i)
    : colLetter(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26))

export async function toXlsx(src: string, title: string): Promise<Buffer> {
  const c = computeSheet(parseSheet(src))
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Sheet1')
  ws.addRow(c.columns.map((col) => col.name)).font = { bold: true }
  const index = new Map(c.columns.map((col, i) => [col.name.toLowerCase(), i]))
  c.values.forEach((row, r) => {
    const excelRow = r + 2
    ws.addRow(
      row.map((v, j) => {
        const col = c.columns[j]
        if (!col.formula) return v
        try {
          const formula = toExcel(
            parseFormula(col.formula),
            (name) => `${colLetter(index.get(name.toLowerCase()) ?? 0)}${excelRow}`
          )
          return { formula, result: typeof v === 'number' ? v : undefined }
        } catch {
          return v
        }
      })
    )
    c.outliers[r].forEach((level, j) => {
      if (level)
        ws.getCell(excelRow, j + 1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: level === 2 ? 'FFFCA5A5' : 'FFFEF08A' }
        }
    })
  })
  ws.columns.forEach((col) => (col.width = 14))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const csvCell = (v: string | number): string => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(src: string): string {
  const c = computeSheet(parseSheet(src))
  return (
    [c.columns.map((x) => csvCell(x.name)), ...c.values.map((r) => r.map(csvCell))]
      .map((r) => r.join(','))
      .join('\r\n') + '\r\n'
  )
}

/** JSON cho Unity: mảng object (giá trị đã tính), tên khoá giữ nguyên tên cột. JsonUtility cần bọc trong { "items": [...] }. */
export function toUnityJson(src: string): string {
  const c = computeSheet(parseSheet(src))
  const items = c.values.map((r) => Object.fromEntries(c.columns.map((col, i) => [col.name, r[i]])))
  return JSON.stringify({ items }, null, 2)
}
