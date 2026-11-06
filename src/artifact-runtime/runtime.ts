/**
 * Chạy BÊN TRONG iframe sandbox của artifact (origin mmc-artifact://, không same-origin với app, không mạng).
 * Đọc dữ liệu nhúng trong trang, vẽ theo loại, và chỉ nói chuyện với app qua postMessage với vài lệnh cố định.
 */
import { marked } from 'marked'
import {
  chartSpecSchema,
  computeSheet,
  parseSheet,
  parseSlides,
  serializeSheet,
  themeOf,
  type ChartSpec,
  type Theme
} from '../shared/artifacts'

type Payload = { type: string; title: string; content: string; themes: Theme[] }
type ChartCtor = new (el: HTMLCanvasElement, cfg: unknown) => unknown
type MermaidLib = {
  initialize(o: unknown): void
  render(id: string, src: string): Promise<{ svg: string }>
}
declare global {
  interface Window {
    Chart?: ChartCtor
    mermaid?: MermaidLib
  }
}

const post = (msg: Record<string, unknown>): void =>
  window.parent.postMessage({ source: 'mmc-artifact', ...msg }, '*')

const libs = new Map<string, Promise<void>>()
function loadLib(file: string): Promise<void> {
  if (!libs.has(file))
    libs.set(
      file,
      new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = `mmc-artifact://lib/${file}`
        s.onload = () => resolve()
        s.onerror = () => reject(new Error(`Không nạp được ${file}`))
        document.head.appendChild(s)
      })
    )
  return libs.get(file)!
}

async function drawChart(host: HTMLElement, spec: ChartSpec, theme: Theme): Promise<void> {
  await loadLib('chart.umd.js')
  const canvas = document.createElement('canvas')
  host.appendChild(canvas)
  const palette = [
    theme.colors.accent,
    theme.colors.muted,
    '#f97316',
    '#10b981',
    '#ef4444',
    '#3b82f6',
    '#eab308'
  ]
  new window.Chart!(canvas, {
    type: spec.type,
    data: {
      labels: spec.labels,
      datasets: spec.datasets.map((d, i) => ({
        ...d,
        backgroundColor:
          spec.type === 'pie' || spec.type === 'doughnut' ? palette : palette[i % palette.length],
        borderColor: palette[i % palette.length]
      }))
    },
    options: {
      animation: false,
      responsive: true,
      plugins: { legend: { labels: { color: theme.colors.text } } }
    }
  })
}

let mermaidReady: Promise<MermaidLib> | null = null
let svgCount = 0
async function drawMermaid(host: HTMLElement, src: string, dark: boolean): Promise<void> {
  mermaidReady ??= loadLib('mermaid.min.js').then(() => {
    window.mermaid!.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: dark ? 'dark' : 'default'
    })
    return window.mermaid!
  })
  const m = await mermaidReady
  try {
    host.innerHTML = (await m.render(`mmd${++svgCount}`, src)).svg
  } catch (err) {
    host.textContent = `Sơ đồ lỗi: ${(err as Error).message}`
    host.className = 'error'
  }
}

const isDark = (t: Theme): boolean => parseInt(t.colors.background.slice(1, 3), 16) < 0x80

function applyTheme(t: Theme): void {
  const s = document.documentElement.style
  s.setProperty('--bg', t.colors.background)
  s.setProperty('--fg', t.colors.text)
  s.setProperty('--accent', t.colors.accent)
  s.setProperty('--muted', t.colors.muted)
  s.setProperty('--heading', t.fonts.heading)
  s.setProperty('--body', t.fonts.body)
}

async function renderDoc(root: HTMLElement, content: string, theme: Theme): Promise<void> {
  root.className = 'doc'
  root.innerHTML = await marked.parse(content, { gfm: true })
  for (const code of Array.from(root.querySelectorAll('pre > code'))) {
    const lang = /language-(\w+)/.exec(code.className)?.[1]
    const pre = code.parentElement!
    if (lang === 'mermaid') {
      const host = document.createElement('div')
      host.className = 'diagram'
      pre.replaceWith(host)
      await drawMermaid(host, code.textContent ?? '', isDark(theme))
    } else if (lang === 'chart') {
      const host = document.createElement('div')
      host.className = 'chart'
      pre.replaceWith(host)
      try {
        await drawChart(host, chartSpecSchema.parse(JSON.parse(code.textContent ?? '')), theme)
      } catch {
        host.textContent = 'Biểu đồ không hợp lệ'
        host.className = 'error'
      }
    }
  }
}

async function renderSlides(root: HTMLElement, content: string, themes: Theme[]): Promise<void> {
  const deck = parseSlides(content)
  const theme = themeOf(deck.theme, themes)
  applyTheme(theme)
  root.className = `slides${theme.style.titleBar ? ' title-bar' : ''}${theme.style.rounded ? ' rounded' : ''}`
  for (const [i, s] of deck.slides.entries()) {
    const el = document.createElement('section')
    el.className = `slide layout-${s.layout}`
    el.dataset.index = String(i + 1)
    const h = document.createElement(s.layout === 'title' || s.layout === 'section' ? 'h1' : 'h2')
    h.textContent = s.title
    el.appendChild(h)
    if (s.subtitle)
      el.appendChild(
        Object.assign(document.createElement('p'), {
          className: 'subtitle',
          textContent: s.subtitle
        })
      )
    if (s.quote)
      el.appendChild(Object.assign(document.createElement('blockquote'), { textContent: s.quote }))
    const list = (items: string[]): HTMLUListElement => {
      const ul = document.createElement('ul')
      for (const b of items)
        ul.appendChild(Object.assign(document.createElement('li'), { textContent: b }))
      return ul
    }
    if (s.layout === 'two-column') {
      const cols = Object.assign(document.createElement('div'), { className: 'cols' })
      cols.append(list(s.bullets), list(s.right))
      el.appendChild(cols)
    } else if (s.bullets.length) el.appendChild(list(s.bullets))
    if (s.chart) {
      const host = Object.assign(document.createElement('div'), { className: 'chart' })
      el.appendChild(host)
      await drawChart(host, s.chart, theme)
    }
    root.appendChild(el)
  }
}

function renderSheet(root: HTMLElement, content: string): void {
  const sheet = parseSheet(content)
  const draw = (): void => {
    const c = computeSheet(sheet)
    root.className = 'sheet'
    root.innerHTML = ''
    const table = document.createElement('table')
    const head = table.createTHead().insertRow()
    for (const col of c.columns) {
      const th = document.createElement('th')
      th.textContent = col.name
      if (col.formula) th.title = `= ${col.formula}`
      if (col.formula) th.className = 'formula'
      head.appendChild(th)
    }
    const body = table.createTBody()
    c.values.forEach((row, r) => {
      const tr = body.insertRow()
      row.forEach((v, j) => {
        const td = tr.insertCell()
        td.textContent =
          typeof v === 'number' ? v.toLocaleString('vi-VN', { maximumFractionDigits: 3 }) : v
        const level = c.outliers[r][j]
        if (level) td.classList.add(level === 2 ? 'outlier-high' : 'outlier')
        if (typeof v === 'number') td.classList.add('num')
        if (c.columns[j].formula) td.classList.add('formula')
        else {
          td.contentEditable = 'plaintext-only'
          td.addEventListener('focus', () => (td.textContent = sheet.rows[r][j]))
          td.addEventListener(
            'keydown',
            (e) => e.key === 'Enter' && (e.preventDefault(), td.blur())
          )
          td.addEventListener('blur', () => {
            const value = (td.textContent ?? '').trim().slice(0, 200)
            if (value === sheet.rows[r][j]) return draw()
            sheet.rows[r][j] = value
            draw()
            post({ cmd: 'edit', content: serializeSheet(sheet) })
          })
        }
      })
    })
    root.appendChild(table)
    if (c.errors.length)
      root.appendChild(
        Object.assign(document.createElement('p'), {
          className: 'error',
          textContent: c.errors.join(' · ')
        })
      )
  }
  draw()
}

async function main(): Promise<void> {
  // Không điều hướng / mở cửa sổ (sandbox đã chặn; chặn thêm ở đây cho chắc).
  window.open = () => null
  document.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('a[href]')) e.preventDefault()
  })
  const data = document.getElementById('mmc-data')
  if (!data) return // artifact HTML: chỉ cài cầu nối
  const p = JSON.parse(data.textContent ?? '{}') as Payload
  const root = document.getElementById('root')!
  const theme = themeOf('mmc-light', p.themes)
  applyTheme(theme)
  try {
    if (p.type === 'doc') await renderDoc(root, p.content, theme)
    else if (p.type === 'slides') await renderSlides(root, p.content, p.themes)
    else if (p.type === 'sheet') renderSheet(root, p.content)
    else if (p.type === 'chart') {
      root.className = 'chart-only'
      await drawChart(root, chartSpecSchema.parse(JSON.parse(p.content)), theme)
    } else if (p.type === 'mermaid') {
      root.className = 'diagram'
      await drawMermaid(root, p.content, false)
    }
  } catch (err) {
    root.innerHTML = ''
    root.appendChild(
      Object.assign(document.createElement('p'), {
        className: 'error',
        textContent: `Không hiển thị được: ${(err as Error).message}`
      })
    )
  }
  document.body.dataset.ready = '1'
  post({ cmd: 'ready' })
}

// App hỏi SVG (xuất sơ đồ Mermaid).
window.addEventListener('message', (e) => {
  if (e.source !== window.parent || (e.data as { cmd?: string })?.cmd !== 'getSvg') return
  post({ cmd: 'svg', svg: document.querySelector('svg')?.outerHTML ?? '' })
})

void main()
