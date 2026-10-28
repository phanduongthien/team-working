import { TASK_STATUSES, type TaskPriority, type TaskStatus } from '@shared/schemas'
import type { TaskRow, TaskStatusEventRow } from '@shared/supabase.types'

export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, medium: 2, low: 3 }

/** Ngày địa phương dạng YYYY-MM-DD (không lệch múi giờ như toISOString). */
export function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return localDate(new Date(y, m - 1, d + days))
}

export const isOpen = (t: Pick<TaskRow, 'status'>): boolean => t.status !== 'done'

export function isOverdue(t: Pick<TaskRow, 'status' | 'due_date'>, today: string): boolean {
  return isOpen(t) && !!t.due_date && t.due_date < today
}

/** Cột Kanban: task cấp cao nhất theo trạng thái, xếp theo position. */
export function groupByStatus(tasks: TaskRow[]): Record<TaskStatus, TaskRow[]> {
  const groups = Object.fromEntries(TASK_STATUSES.map((s) => [s, [] as TaskRow[]])) as Record<TaskStatus, TaskRow[]>
  for (const t of tasks) if (!t.parent_id) groups[t.status].push(t)
  for (const s of TASK_STATUSES) groups[s].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))
  return groups
}

/** Vị trí khi thả task vào cột: trước task `beforeId`, hoặc cuối cột. */
export function positionForDrop(column: TaskRow[], beforeId: string | null): number {
  const list = column
  if (list.length === 0) return 1000
  if (!beforeId) return list[list.length - 1].position + 1000
  const idx = list.findIndex((t) => t.id === beforeId)
  if (idx <= 0) return list[0].position - 1000
  return (list[idx - 1].position + list[idx].position) / 2
}

export type SortKey = 'due' | 'priority' | 'status' | 'title'

export function sortTasks(tasks: TaskRow[], key: SortKey): TaskRow[] {
  const byDue = (a: TaskRow, b: TaskRow): number => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999')
  const cmp: Record<SortKey, (a: TaskRow, b: TaskRow) => number> = {
    due: (a, b) => byDue(a, b) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
    priority: (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || byDue(a, b),
    status: (a, b) => TASK_STATUSES.indexOf(a.status) - TASK_STATUSES.indexOf(b.status) || byDue(a, b),
    title: (a, b) => a.title.localeCompare(b.title)
  }
  return [...tasks].sort(cmp[key])
}

/** Lưới tháng bắt đầu từ thứ Hai: các tuần, mỗi tuần 7 ngày ISO (gồm ngày của tháng trước/sau). */
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7 // thứ Hai = 0
  const start = new Date(year, month, 1 - offset)
  const weeks: string[][] = []
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, d) => localDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)))
    if (w > 0 && Number(week[0].slice(5, 7)) !== month + 1) break
    weeks.push(week)
  }
  return weeks
}

/** Task của tôi chưa xong, hạn hôm nay hoặc ngày mai (để nhắc). */
export function dueSoon(tasks: TaskRow[], userId: string, today: string): TaskRow[] {
  const tomorrow = addDays(today, 1)
  return tasks.filter((t) => t.assignee_id === userId && isOpen(t) && !!t.due_date && t.due_date >= today && t.due_date <= tomorrow)
}

// ---------------- Dashboard ----------------

export type Progress = { total: number; done: number; percent: number; overdue: number; openHours: number }

export function progressOf(tasks: TaskRow[], today: string): Progress {
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  return {
    total,
    done,
    percent: total ? Math.round((done / total) * 100) : 0,
    overdue: tasks.filter((t) => isOverdue(t, today)).length,
    openHours: tasks.filter(isOpen).reduce((h, t) => h + (t.estimate_hours ?? 0), 0)
  }
}

/** Tiến độ theo nhóm (dự án hoặc người được giao). */
export function progressBy<K extends 'project_id' | 'assignee_id'>(
  tasks: TaskRow[],
  key: K,
  today: string
): Map<string, Progress> {
  const groups = new Map<string, TaskRow[]>()
  for (const t of tasks) {
    const k = t[key]
    if (!k) continue
    groups.set(k, [...(groups.get(k) ?? []), t])
  }
  return new Map([...groups].map(([k, list]) => [k, progressOf(list, today)]))
}

export type BurndownPoint = { date: string; remaining: number; ideal: number }

/**
 * Burndown theo ngày từ lịch sử trạng thái: số task chưa xong vào cuối mỗi ngày.
 * Task "tồn tại" từ sự kiện đầu tiên của nó; đường lý tưởng giảm đều tới 0 ở ngày cuối.
 */
export function burndown(events: TaskStatusEventRow[], from: string, to: string): BurndownPoint[] {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at) || a.id - b.id)
  const days: string[] = []
  for (let d = from; d <= to && days.length < 400; d = addDays(d, 1)) days.push(d)

  const status = new Map<string, TaskStatus>()
  let i = 0
  const points = days.map((day) => {
    while (i < sorted.length && localDate(new Date(sorted[i].at)) <= day) {
      status.set(sorted[i].task_id, sorted[i].to_status)
      i++
    }
    let remaining = 0
    for (const s of status.values()) if (s !== 'done') remaining++
    return { date: day, remaining, ideal: 0 }
  })

  const start = points[0]?.remaining ?? 0
  const span = Math.max(1, points.length - 1)
  return points.map((p, idx) => ({ ...p, ideal: Math.round(start * (1 - idx / span) * 10) / 10 }))
}
