import type { TimeEntryKind } from './schemas'

export type TimeEntry = {
  id: string
  taskId: string | null
  projectId: string | null
  title: string
  projectName: string | null
  kind: TimeEntryKind
  note: string
  startedAt: number
  /** null = đang bấm giờ */
  endedAt: number | null
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** Ngày địa phương YYYY-MM-DD. */
export function dayKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function hhmm(ms: number): string {
  const d = new Date(ms)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Thời lượng (giây); entry đang chạy tính tới `now`. */
export function durationSec(e: Pick<TimeEntry, 'startedAt' | 'endedAt'>, now = Date.now()): number {
  return Math.max(0, Math.round(((e.endedAt ?? now) - e.startedAt) / 1000))
}

export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return h ? `${h}h ${pad(m)}m` : `${m}m`
}

/** Tổng giây theo ngày (theo giờ bắt đầu). */
export function sumByDay(entries: TimeEntry[], now = Date.now()): Map<string, number> {
  const map = new Map<string, number>()
  for (const e of entries) map.set(dayKey(e.startedAt), (map.get(dayKey(e.startedAt)) ?? 0) + durationSec(e, now))
  return map
}

/** Tổng giây theo task (khóa = taskId hoặc tiêu đề nếu không gắn task). */
export function sumByTask(entries: TimeEntry[], now = Date.now()): { key: string; title: string; projectName: string | null; seconds: number }[] {
  const map = new Map<string, { key: string; title: string; projectName: string | null; seconds: number }>()
  for (const e of entries) {
    const key = e.taskId ?? `title:${e.title}`
    const row = map.get(key) ?? { key, title: e.title, projectName: e.projectName, seconds: 0 }
    row.seconds += durationSec(e, now)
    map.set(key, row)
  }
  return [...map.values()].sort((a, b) => b.seconds - a.seconds)
}

/** 7 ngày (thứ Hai → Chủ nhật) của tuần chứa `ms`. */
export function weekDays(ms: number): string[] {
  const d = new Date(ms)
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => dayKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i).getTime()))
}

export type CsvHeaders = { date: string; start: string; end: string; hours: string; task: string; project: string; kind: string; note: string }

const csvCell = (v: string): string => (/[",\n\r;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

const BOM = String.fromCharCode(0xfeff)

/** CSV có BOM UTF-8 để Excel hiển thị đúng tiếng Việt. Bỏ qua entry đang chạy. */
export function toCsv(entries: TimeEntry[], headers: CsvHeaders, kindLabel: (k: TimeEntryKind) => string): string {
  const lines = [[headers.date, headers.start, headers.end, headers.hours, headers.task, headers.project, headers.kind, headers.note]]
  for (const e of [...entries].sort((a, b) => a.startedAt - b.startedAt)) {
    if (e.endedAt === null) continue
    lines.push([
      dayKey(e.startedAt),
      hhmm(e.startedAt),
      hhmm(e.endedAt),
      (durationSec(e) / 3600).toFixed(2),
      e.title,
      e.projectName ?? '',
      kindLabel(e.kind),
      e.note
    ])
  }
  return BOM + lines.map((l) => l.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
