import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt, isNull, lt, or } from 'drizzle-orm'
import type { TimeEntryKind } from '@shared/schemas'
import type { TimeEntry } from '@shared/timesheet'
import type { AppDatabase } from './client'
import { timeEntries } from './schema'

type Row = typeof timeEntries.$inferSelect

const toEntry = (r: Row): TimeEntry => ({
  id: r.id,
  taskId: r.taskId,
  projectId: r.projectId,
  title: r.title,
  projectName: r.projectName,
  kind: r.kind,
  note: r.note,
  startedAt: r.startedAt,
  endedAt: r.endedAt
})

export type TaskRef = { taskId: string | null; projectId: string | null; title: string; projectName: string | null }

/** Chấm công trên máy. Luôn tối đa MỘT entry đang chạy (ended_at null). */
export class TimeRepository {
  constructor(private readonly db: AppDatabase) {}

  current(): TimeEntry | null {
    const row = this.db.select().from(timeEntries).where(isNull(timeEntries.endedAt)).get()
    return row ? toEntry(row) : null
  }

  /** Bắt đầu bấm giờ; nếu đang có entry chạy thì dừng nó trước. */
  start(ref: TaskRef, kind: Exclude<TimeEntryKind, 'manual'>, now = Date.now()): TimeEntry {
    this.stop(now)
    return toEntry(
      this.db.insert(timeEntries).values({ id: randomUUID(), ...ref, kind, startedAt: now }).returning().get()
    )
  }

  /** Dừng entry đang chạy; bỏ qua nếu ngắn hơn 1 giây. */
  stop(now = Date.now()): TimeEntry | null {
    const running = this.current()
    if (!running) return null
    if (now - running.startedAt < 1000) {
      this.remove(running.id)
      return null
    }
    const row = this.db.update(timeEntries).set({ endedAt: now }).where(eq(timeEntries.id, running.id)).returning().get()
    return toEntry(row)
  }

  addManual(ref: TaskRef & { startedAt: number; endedAt: number; note: string }): TimeEntry {
    return toEntry(this.db.insert(timeEntries).values({ id: randomUUID(), kind: 'manual', ...ref }).returning().get())
  }

  update(id: string, patch: { title: string; note: string; startedAt: number; endedAt: number }): TimeEntry | null {
    const row = this.db.update(timeEntries).set(patch).where(eq(timeEntries.id, id)).returning().get()
    return row ? toEntry(row) : null
  }

  remove(id: string): void {
    this.db.delete(timeEntries).where(eq(timeEntries.id, id)).run()
  }

  /** Entry giao với khoảng [from, to) — kể cả entry đang chạy. */
  list(from: number, to: number): TimeEntry[] {
    return this.db
      .select()
      .from(timeEntries)
      .where(and(lt(timeEntries.startedAt, to), or(isNull(timeEntries.endedAt), gt(timeEntries.endedAt, from))))
      .orderBy(asc(timeEntries.startedAt))
      .all()
      .map(toEntry)
  }
}
