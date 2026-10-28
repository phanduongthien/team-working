import { CalendarClock, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import { useMemo, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { TASK_STATUSES, type TaskStatus } from '@shared/schemas'
import type { TaskRow } from '@shared/supabase.types'
import { UserAvatar } from '@renderer/components/UserAvatar'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { groupByStatus, isOverdue, localDate, monthGrid, positionForDrop, sortTasks, type SortKey } from '../logic'
import { PriorityLabel, StatusBadge } from './common'
import { formatDate, useMemberMap } from './helpers'

type ViewProps = {
  tasks: TaskRow[]
  onOpen(task: TaskRow): void
}

function TaskCard({ task, onOpen, subtaskCount, draggable }: { task: TaskRow; onOpen(): void; subtaskCount: [number, number]; draggable: boolean }) {
  const { t, i18n } = useTranslation('work')
  const members = useMemberMap()
  const today = localDate(new Date())
  const assignee = task.assignee_id ? members.get(task.assignee_id) : null
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(e) => e.dataTransfer.setData('text/task-id', task.id)}
      onClick={onOpen}
      className="w-full space-y-2 rounded-md border bg-card p-2.5 text-left text-sm shadow-xs hover:border-primary/50"
      data-testid="task-card"
    >
      <div className="flex items-start gap-1.5">
        {task.ai_generated && <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-label={t('task.ai')} />}
        <span className="font-medium">{task.title}</span>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <PriorityLabel priority={task.priority} />
        {task.due_date && (
          <span className={cn('flex items-center gap-1', isOverdue(task, today) && 'text-destructive')}>
            <CalendarClock className="size-3" />
            {formatDate(task.due_date, i18n.language)}
          </span>
        )}
        {subtaskCount[1] > 0 && (
          <span>
            {subtaskCount[0]}/{subtaskCount[1]}
          </span>
        )}
        <span className="flex-1" />
        {assignee && <UserAvatar user={assignee} className="size-5 text-[10px]" />}
      </div>
    </button>
  )
}

function useSubtaskCounts(tasks: TaskRow[]): Map<string, [number, number]> {
  return useMemo(() => {
    const map = new Map<string, [number, number]>()
    for (const t of tasks) {
      if (!t.parent_id) continue
      const [done, total] = map.get(t.parent_id) ?? [0, 0]
      map.set(t.parent_id, [done + (t.status === 'done' ? 1 : 0), total + 1])
    }
    return map
  }, [tasks])
}

export function KanbanBoard({
  tasks,
  onOpen,
  onMove,
  canMove
}: ViewProps & { onMove(task: TaskRow, status: TaskStatus, position: number): void; canMove(task: TaskRow): boolean }) {
  const { t } = useTranslation('work')
  const columns = groupByStatus(tasks)
  const subtasks = useSubtaskCounts(tasks)
  const [over, setOver] = useState<TaskStatus | null>(null)

  const onDrop = (e: DragEvent, status: TaskStatus): void => {
    e.preventDefault()
    setOver(null)
    const id = e.dataTransfer.getData('text/task-id')
    const task = tasks.find((x) => x.id === id)
    if (!task) return
    // Thả lên một thẻ → chèn trước thẻ đó; thả vào khoảng trống → cuối cột.
    const beforeId = (e.target as HTMLElement).closest<HTMLElement>('[data-task-id]')?.dataset.taskId ?? null
    const column = columns[status].filter((x) => x.id !== id)
    onMove(task, status, positionForDrop(column, beforeId === id ? null : beforeId))
  }

  return (
    <div className="flex h-full gap-3 overflow-x-auto pb-2">
      {TASK_STATUSES.map((status) => (
        <section
          key={status}
          className={cn('flex w-64 shrink-0 flex-col rounded-lg bg-muted/50 p-2', over === status && 'ring-2 ring-primary/40')}
          onDragOver={(e) => (e.preventDefault(), setOver(status))}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => onDrop(e, status)}
          data-testid={`column-${status}`}
        >
          <h3 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
            <StatusBadge status={status} />
            <span className="text-muted-foreground">{columns[status].length}</span>
          </h3>
          <div className="flex-1 space-y-2 overflow-y-auto">
            {columns[status].map((task) => (
              <div key={task.id} data-task-id={task.id}>
                <TaskCard task={task} onOpen={() => onOpen(task)} subtaskCount={subtasks.get(task.id) ?? [0, 0]} draggable={canMove(task)} />
              </div>
            ))}
            {columns[status].length === 0 && <p className="px-1 py-4 text-center text-xs text-muted-foreground">{t('task.none')}</p>}
          </div>
        </section>
      ))}
    </div>
  )
}

export function TaskList({ tasks, onOpen, sort }: ViewProps & { sort: SortKey }) {
  const { t, i18n } = useTranslation('work')
  const members = useMemberMap()
  const today = localDate(new Date())
  const rows = sortTasks(tasks.filter((x) => !x.parent_id), sort)
  if (rows.length === 0) return <p className="py-10 text-center text-muted-foreground">{t('task.none')}</p>
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-muted-foreground">
        <tr className="border-b">
          <th className="py-2 font-medium">{t('task.title')}</th>
          <th className="font-medium">{t('task.status')}</th>
          <th className="font-medium">{t('task.priority')}</th>
          <th className="font-medium">{t('task.assignee')}</th>
          <th className="font-medium">{t('task.dueDate')}</th>
          <th className="text-right font-medium">{t('task.estimate')}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((task) => {
          const assignee = task.assignee_id ? members.get(task.assignee_id) : null
          return (
            <tr key={task.id} className="cursor-pointer border-b hover:bg-muted/50" onClick={() => onOpen(task)} data-testid="task-row">
              <td className="py-2 pr-2 font-medium">{task.title}</td>
              <td>
                <StatusBadge status={task.status} />
              </td>
              <td>
                <PriorityLabel priority={task.priority} />
              </td>
              <td>
                {assignee ? (
                  <span className="flex items-center gap-1.5">
                    <UserAvatar user={assignee} className="size-5 text-[10px]" />
                    {assignee.display_name}
                  </span>
                ) : (
                  <span className="text-muted-foreground">{t('task.unassigned')}</span>
                )}
              </td>
              <td className={cn(isOverdue(task, today) && 'text-destructive')}>{formatDate(task.due_date, i18n.language)}</td>
              <td className="text-right">{task.estimate_hours ?? ''}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export function CalendarView({ tasks, onOpen }: ViewProps) {
  const { t, i18n } = useTranslation('work')
  const now = new Date()
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const today = localDate(now)
  const weeks = monthGrid(month.y, month.m)
  const byDay = useMemo(() => {
    const map = new Map<string, TaskRow[]>()
    for (const task of tasks) if (task.due_date && !task.parent_id) map.set(task.due_date, [...(map.get(task.due_date) ?? []), task])
    return map
  }, [tasks])
  const shift = (delta: number): void => setMonth(({ y, m }) => ({ y: m + delta < 0 ? y - 1 : m + delta > 11 ? y + 1 : y, m: (m + delta + 12) % 12 }))
  const weekdays = t('calendar.weekdays', { returnObjects: true }) as string[]

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" title={t('calendar.prev')} onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <h3 className="w-40 text-center font-medium capitalize">
          {new Date(month.y, month.m, 1).toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' })}
        </h3>
        <Button variant="ghost" size="icon-sm" title={t('calendar.next')} onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setMonth({ y: now.getFullYear(), m: now.getMonth() })}>
          {t('calendar.today')}
        </Button>
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border text-xs">
        {weekdays.map((d) => (
          <div key={d} className="border-b bg-muted/50 px-2 py-1 font-medium">
            {d}
          </div>
        ))}
        {weeks.flat().map((day) => {
          const inMonth = Number(day.slice(5, 7)) === month.m + 1
          return (
            <div key={day} className={cn('min-h-24 space-y-1 border-r border-b p-1', !inMonth && 'bg-muted/30 text-muted-foreground')}>
              <div className={cn('px-1', day === today && 'inline-block rounded bg-primary text-primary-foreground')}>{Number(day.slice(8))}</div>
              {(byDay.get(day) ?? []).map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpen(task)}
                  className={cn(
                    'block w-full truncate rounded px-1 py-0.5 text-left',
                    task.status === 'done' ? 'bg-green-500/15 line-through' : isOverdue(task, today) ? 'bg-destructive/15' : 'bg-primary/10'
                  )}
                  title={task.title}
                >
                  {task.title}
                </button>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
