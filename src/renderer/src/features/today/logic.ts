import type { DayBlock, ReportRequest } from '@shared/schemas'
import type { TaskRow } from '@shared/supabase.types'
import { sumByTask, weekDays, type TimeEntry } from '@shared/timesheet'

export type Period = 'day' | 'week'

/** Khoảng thời gian [from, to) của hôm nay hoặc tuần này (thứ Hai → Chủ nhật). */
export function periodRange(period: Period, now: number): { from: number; to: number } {
  const d = new Date(now)
  if (period === 'day') {
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    return { from, to: from + 86_400_000 }
  }
  const [y, m, day] = weekDays(now)[0].split('-').map(Number)
  const from = new Date(y, m - 1, day).getTime()
  return { from, to: from + 7 * 86_400_000 }
}

/**
 * Task của tôi + giờ đã ghi → dữ liệu báo cáo (hàm thuần).
 * Đã xong = hoàn thành trong kỳ; Đang làm = in_progress/review; Bị chặn = blocked.
 */
export function buildReportRequest(input: {
  period: Period
  periodLabel: string
  language: 'vi' | 'en'
  tasks: TaskRow[]
  entries: TimeEntry[]
  notes: string
  now: number
}): ReportRequest {
  const { from, to } = periodRange(input.period, input.now)
  const inPeriod = (iso: string | null): boolean => !!iso && Date.parse(iso) >= from && Date.parse(iso) < to
  return {
    periodType: input.period,
    periodLabel: input.periodLabel,
    language: input.language,
    done: input.tasks.filter((t) => t.status === 'done' && inPeriod(t.completed_at)).map((t) => t.title),
    inProgress: input.tasks.filter((t) => t.status === 'in_progress' || t.status === 'review').map((t) => t.title),
    blocked: input.tasks.filter((t) => t.status === 'blocked').map((t) => t.title),
    timeByTask: sumByTask(input.entries, input.now).map((r) => ({ title: r.title, minutes: Math.round(r.seconds / 60) })),
    notes: input.notes
  }
}

/** Khối kế hoạch bắt đầu đúng phút hiện tại (để nhắc), chưa nhắc lần nào. */
export function blocksStartingNow(blocks: DayBlock[], hhmm: string, notified: Set<string>): DayBlock[] {
  return blocks.filter((b) => b.start === hhmm && !notified.has(b.start))
}
