import { ChevronLeft, ChevronRight, Download, Pause, Pencil, Play, Plus, Square, Timer, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TIME_ENTRY_KINDS, type Workday } from '@shared/schemas'
import { dayKey, durationSec, formatDuration, hhmm, sumByDay, sumByTask, weekDays, type TimeEntry } from '@shared/timesheet'
import { Button } from '@renderer/components/ui/button'
import { Input, Label } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { remaining } from '../pomodoro'
import { useTime, type TaskRef } from '../store'
import { EntryDialog } from './EntryDialog'
import { TaskPicker } from './TaskPicker'

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-3 rounded-lg border bg-card p-4', className)}>
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function TimerCard() {
  const { t } = useTranslation('time')
  const { current, now, pomodoro, startTimer, stopTimer } = useTime()
  const [task, setTask] = useState<TaskRef | null>(null)
  const running = current && current.kind === 'timer' ? current : null
  return (
    <Card title={t('timer.heading')}>
      {running ? (
        <div className="flex items-center gap-3" data-testid="timer-running">
          <span className="font-mono text-3xl tabular-nums">{formatClock(durationSec(running, now))}</span>
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{t('timer.running', { title: running.title })}</span>
          <Button variant="outline" onClick={() => void stopTimer()}>
            <Square />
            {t('timer.stop')}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          <TaskPicker onChange={setTask} />
          <Button disabled={!task || pomodoro.phase !== 'idle'} onClick={() => task && void startTimer(task)}>
            <Play />
            {t('timer.start')}
          </Button>
        </div>
      )}
    </Card>
  )
}

const formatClock = (sec: number): string =>
  [Math.floor(sec / 3600), Math.floor((sec % 3600) / 60), sec % 60].map((n) => String(n).padStart(2, '0')).join(':')

function PomodoroCard() {
  const { t } = useTranslation('time')
  const { pomodoro, pomodoroTask, now, workday, current, startPomodoro, stopPomodoro } = useTime()
  const [task, setTask] = useState<TaskRef | null>(null)
  const active = pomodoro.phase !== 'idle'
  const timerBusy = current?.kind === 'timer'
  return (
    <Card title={t('pomodoro.heading')}>
      <div className="flex items-center gap-4">
        <span
          className={cn(
            'font-mono text-4xl tabular-nums',
            pomodoro.phase === 'focus' && 'text-primary',
            pomodoro.phase === 'break' && 'text-green-600'
          )}
          data-testid="pomodoro-clock"
        >
          {active ? remaining(pomodoro.endsAt, now) : `${String(workday.focusMinutes).padStart(2, '0')}:00`}
        </span>
        <div className="text-sm">
          <div className="font-medium">{t(`pomodoro.${pomodoro.phase}`)}</div>
          <div className="text-muted-foreground">{t('pomodoro.completed', { count: pomodoro.completed })}</div>
          {pomodoroTask && <div className="truncate text-muted-foreground">{pomodoroTask.title}</div>}
        </div>
      </div>
      {!active && !pomodoroTask && <TaskPicker onChange={setTask} />}
      <div className="flex gap-2">
        {pomodoro.phase === 'idle' && (
          <Button
            disabled={timerBusy || !(pomodoroTask ?? task)}
            onClick={() => {
              const target = pomodoroTask ?? task
              if (target) void startPomodoro(target)
            }}
          >
            <Timer />
            {pomodoroTask ? t('pomodoro.next') : t('pomodoro.start')}
          </Button>
        )}
        {(active || pomodoroTask) && (
          <Button variant="outline" onClick={() => void stopPomodoro()}>
            <Pause />
            {t('pomodoro.stop')}
          </Button>
        )}
      </div>
    </Card>
  )
}

function Timesheet() {
  const { t, i18n } = useTranslation('time')
  const version = useTime((s) => s.version)
  const now = useTime((s) => s.now)
  const [anchor, setAnchor] = useState(() => Date.now())
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [dialog, setDialog] = useState<{ entry?: TimeEntry } | null>(null)
  const [exported, setExported] = useState<string | null>(null)
  const days = useMemo(() => weekDays(anchor), [anchor])
  const range = useMemo(() => {
    const [y, m, d] = days[0].split('-').map(Number)
    const from = new Date(y, m - 1, d).getTime()
    return { from, to: from + 7 * 86_400_000 }
  }, [days])

  useEffect(() => {
    void api.time.list(range.from, range.to).then(setEntries)
  }, [range, version])

  const reload = (): void => void api.time.list(range.from, range.to).then(setEntries)
  const byDay = sumByDay(entries, now)
  const total = [...byDay.values()].reduce((a, b) => a + b, 0)
  const shift = (weeks: number): void => setAnchor((a) => a + weeks * 7 * 86_400_000)

  const exportCsv = async (): Promise<void> => {
    const path = await api.time.exportCsv({
      ...range,
      headers: t('csv', { returnObjects: true }) as Parameters<typeof api.time.exportCsv>[0]['headers'],
      kinds: Object.fromEntries(TIME_ENTRY_KINDS.map((k) => [k, t(`kinds.${k}`)])) as Record<(typeof TIME_ENTRY_KINDS)[number], string>
    })
    if (path) setExported(path)
  }

  return (
    <Card title={t('sheet.heading')} className="lg:col-span-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon-sm" title={t('sheet.prev')} onClick={() => shift(-1)}>
          <ChevronLeft />
        </Button>
        <span className="text-sm font-medium">
          {new Date(range.from).toLocaleDateString(i18n.language)} – {new Date(range.to - 1).toLocaleDateString(i18n.language)}
        </span>
        <Button variant="ghost" size="icon-sm" title={t('sheet.next')} onClick={() => shift(1)}>
          <ChevronRight />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setAnchor(Date.now())}>
          {t('sheet.thisWeek')}
        </Button>
        <span className="ml-auto text-sm font-medium" data-testid="week-total">
          {t('sheet.total', { duration: formatDuration(total) })}
        </span>
        <Button variant="outline" size="sm" onClick={() => setDialog({})}>
          <Plus />
          {t('sheet.add')}
        </Button>
        <Button variant="outline" size="sm" onClick={() => void exportCsv()}>
          <Download />
          {t('sheet.export')}
        </Button>
      </div>
      {exported && <p className="text-xs break-all text-muted-foreground">{t('sheet.exported', { path: exported })}</p>}

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {days.map((d) => (
          <div key={d} className={cn('rounded-md border p-2', d === dayKey(now) && 'border-primary')}>
            <div className="text-muted-foreground">
              {new Date(d + 'T00:00').toLocaleDateString(i18n.language, { weekday: 'short', day: '2-digit', month: '2-digit' })}
            </div>
            <div className="mt-1 font-semibold">{byDay.get(d) ? formatDuration(byDay.get(d)!) : '—'}</div>
          </div>
        ))}
      </div>

      {entries.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('sheet.empty')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <ul className="divide-y text-sm">
            {[...entries].reverse().map((e) => (
              <li key={e.id} className="group flex items-center gap-3 py-1.5" data-testid="time-entry">
                <span className="w-20 shrink-0 text-xs text-muted-foreground">{dayKey(e.startedAt).slice(5)}</span>
                <span className="w-24 shrink-0 font-mono text-xs">
                  {hhmm(e.startedAt)}–{e.endedAt ? hhmm(e.endedAt) : t('sheet.running')}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {e.title}
                  {e.projectName && <span className="text-muted-foreground"> · {e.projectName}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{t(`kinds.${e.kind}`)}</span>
                <span className="w-16 text-right font-mono text-xs">{formatDuration(durationSec(e, now))}</span>
                {e.endedAt && (
                  <span className="flex opacity-0 group-hover:opacity-100">
                    <Button variant="ghost" size="icon-sm" title={t('sheet.edit')} onClick={() => setDialog({ entry: e })}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" title={t('sheet.delete')} onClick={() => void api.time.remove(e.id).then(reload)}>
                      <Trash2 />
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="space-y-1 text-sm">
            <h3 className="text-xs font-semibold text-muted-foreground">{t('sheet.byTask')}</h3>
            {sumByTask(entries, now).map((r) => (
              <div key={r.key} className="flex justify-between gap-2">
                <span className="truncate">{r.title}</span>
                <span className="font-mono text-xs">{formatDuration(r.seconds)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {dialog && <EntryDialog entry={dialog.entry} defaultDate={dayKey(now)} onClose={(saved) => (setDialog(null), saved && reload())} />}
    </Card>
  )
}

function WorkdayCard() {
  const workday = useTime((s) => s.workday)
  // key theo giá trị đã lưu → form khởi tạo lại khi tải xong/sau khi lưu.
  return <WorkdayForm key={JSON.stringify(workday)} workday={workday} />
}

function WorkdayForm({ workday }: { workday: Workday }) {
  const { t } = useTranslation('time')
  const saveWorkday = useTime((s) => s.saveWorkday)
  const [draft, setDraft] = useState(workday)
  const dirty = JSON.stringify(draft) !== JSON.stringify(workday)
  return (
    <Card title={t('workday.heading')}>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor="wd-start">{t('workday.start')}</Label>
          <Input id="wd-start" type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wd-end">{t('workday.end')}</Label>
          <Input id="wd-end" type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wd-focus">{t('workday.focus')}</Label>
          <Input id="wd-focus" type="number" min={5} max={120} value={draft.focusMinutes} onChange={(e) => setDraft({ ...draft, focusMinutes: Number(e.target.value) })} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wd-break">{t('workday.break')}</Label>
          <Input id="wd-break" type="number" min={1} max={60} value={draft.breakMinutes} onChange={(e) => setDraft({ ...draft, breakMinutes: Number(e.target.value) })} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!dirty || draft.end <= draft.start} onClick={() => void saveWorkday(draft)}>
          {t('common:actions.save')}
        </Button>
      </div>
    </Card>
  )
}

export function TimePage() {
  const { t } = useTranslation('time')
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-8">
        <h1 className="text-2xl font-semibold">{t('heading')}</h1>
        <div className="grid gap-5 lg:grid-cols-2">
          <TimerCard />
          <PomodoroCard />
          <Timesheet />
          <WorkdayCard />
        </div>
      </div>
    </div>
  )
}
