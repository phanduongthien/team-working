import { useQuery } from '@tanstack/react-query'
import { CalendarClock, Copy, LoaderCircle, Play, Send, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { TaskRow } from '@shared/supabase.types'
import { dayKey, durationSec, formatDuration, hhmm, type TimeEntry } from '@shared/timesheet'
import { Markdown } from '../../chat/components/Markdown'
import { TeamGate, TeamError } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { Label, Select, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { dbErrorCode, requireSupabase } from '@renderer/lib/supabase'
import { cn } from '@renderer/lib/utils'
import { useAuth } from '@renderer/stores/auth'
import { usePreferences } from '@renderer/stores/preferences'
import { isManagerRole, useMyRole, useTeam } from '@renderer/stores/team'
import { useTime } from '../../time/store'
import { useMyOpenTasks, useProjects } from '../../work/api'
import { formatDate, useMemberMap } from '../../work/components/helpers'
import { isOverdue, localDate } from '../../work/logic'
import { buildReportRequest, periodRange, type Period } from '../logic'
import { useToday } from '../store'

function Card({ title, children, className, action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cn('space-y-3 rounded-lg border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Giờ đã ghi trong khoảng (đọc chấm công trên máy). */
function useEntries(from: number, to: number): TimeEntry[] {
  const version = useTime((s) => s.version)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  useEffect(() => {
    void api.time.list(from, to).then(setEntries)
  }, [from, to, version])
  return entries
}

function MyTasks({ tasks }: { tasks: TaskRow[] }) {
  const { t, i18n } = useTranslation('today')
  const today = localDate(new Date())
  return (
    <Card title={t('myTasks')}>
      {tasks.length === 0 && <p className="text-sm text-muted-foreground">{t('noTasks')}</p>}
      <ul className="divide-y text-sm">
        {tasks.map((task) => (
          <li key={task.id} className="flex items-center gap-2 py-1.5">
            <Link to={`/projects/${task.project_id}?task=${task.id}`} className="min-w-0 flex-1 truncate hover:underline">
              {task.title}
            </Link>
            <span className="text-xs text-muted-foreground">{t(`work:status.${task.status}`)}</span>
            {task.due_date && (
              <span className={cn('flex items-center gap-1 text-xs', isOverdue(task, today) ? 'text-destructive' : task.due_date === today ? 'text-orange-600' : 'text-muted-foreground')}>
                <CalendarClock className="size-3" />
                {isOverdue(task, today) ? t('overdue') : task.due_date === today ? t('dueToday') : formatDate(task.due_date, i18n.language)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function PlanCard({ tasks, loggedMinutes }: { tasks: TaskRow[]; loggedMinutes: number }) {
  const { t } = useTranslation('today')
  const language = usePreferences((s) => s.assistant.language)
  const { blocks, remind, setBlocks, setRemind } = useToday()
  const { workday, startTimer } = useTime()
  const projects = useProjects(useTeam((s) => s.currentTeamId)).data
  const projectName = useMemo(() => new Map((projects ?? []).map((p) => [p.id, p.name])), [projects])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const byId = new Map(tasks.map((x) => [x.id, x]))

  const generate = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const now = new Date()
      const res = await api.dayPlanner.plan({
        today: localDate(now),
        now: hhmm(now.getTime()),
        workday: { start: workday.start, end: workday.end },
        loggedMinutesToday: loggedMinutes,
        language,
        tasks: tasks.slice(0, 60).map((x) => ({
          id: x.id,
          title: x.title,
          project: projectName.get(x.project_id) ?? '',
          priority: x.priority,
          status: x.status,
          dueDate: x.due_date,
          estimateHours: x.estimate_hours
        }))
      })
      if ('error' in res) setError(t('plan.failed', { message: t(`work:errors.${res.error}`, { defaultValue: res.error }) }))
      else setBlocks(res.blocks)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={t('plan.heading')}
      action={
        <Button size="sm" onClick={() => void generate()} disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
          {busy ? t('plan.generating') : blocks.length ? t('plan.regenerate') : t('plan.generate')}
        </Button>
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}
      {blocks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('plan.empty')}</p>
      ) : (
        <ol className="space-y-1.5" data-testid="day-plan">
          {blocks.map((b) => {
            const task = b.taskId ? byId.get(b.taskId) : undefined
            return (
              <li key={b.start} className={cn('flex items-center gap-3 rounded-md border px-3 py-2 text-sm', task ? 'border-primary/40 bg-primary/5' : 'bg-muted/40')}>
                <span className="w-24 shrink-0 font-mono text-xs">
                  {b.start}–{b.end}
                </span>
                <span className="min-w-0 flex-1">
                  {task && <span className="block font-medium">{task.title}</span>}
                  {b.note && <span className="block text-xs text-muted-foreground">{b.note}</span>}
                </span>
                {task && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void startTimer({ taskId: task.id, projectId: task.project_id, title: task.title, projectName: projectName.get(task.project_id) ?? null })}
                  >
                    <Play />
                    {t('plan.track')}
                  </Button>
                )}
              </li>
            )
          })}
        </ol>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />
        {t('plan.remind')}
      </label>
    </Card>
  )
}

function ReportCard() {
  const { t, i18n } = useTranslation('today')
  const uid = useAuth((s) => s.session?.user.id)
  const teamId = useTeam((s) => s.currentTeamId)
  const language = usePreferences((s) => s.assistant.language)
  const now = useTime((s) => s.now)
  const [period, setPeriod] = useState<Period>('day')
  const [notes, setNotes] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'write' | 'send' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const range = useMemo(() => periodRange(period, now), [period, now])
  const entries = useEntries(range.from, range.to)
  const label =
    period === 'day'
      ? t('report.dayLabel', { date: new Date(range.from).toLocaleDateString(i18n.language) })
      : t('report.weekLabel', { from: new Date(range.from).toLocaleDateString(i18n.language), to: new Date(range.to - 1).toLocaleDateString(i18n.language) })

  const write = async (): Promise<void> => {
    if (!teamId || !uid) return
    setBusy('write')
    setMessage(null)
    try {
      // Mọi task của tôi trong team (kể cả đã xong) để biết việc hoàn thành trong kỳ.
      const { data, error } = await requireSupabase().from('tasks').select('*').eq('team_id', teamId).eq('assignee_id', uid)
      if (error) throw new Error(dbErrorCode(error))
      const req = buildReportRequest({ period, periodLabel: label, language, tasks: data ?? [], entries, notes, now: Date.now() })
      const res = await api.dayPlanner.report(req)
      if ('error' in res) setMessage(t('report.failed', { message: t(`work:errors.${res.error}`, { defaultValue: res.error }) }))
      else setText(res.text)
    } catch (err) {
      setMessage((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const send = async (): Promise<void> => {
    if (!teamId) return
    setBusy('send')
    const { error } = await requireSupabase().from('progress_reports').insert({ team_id: teamId, period_type: period, period_label: label.slice(0, 60), body: text.trim() })
    setBusy(null)
    setMessage(error ? dbErrorCode(error) : t('report.sent'))
  }

  return (
    <Card title={t('report.heading')} className="lg:col-span-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="rp-period">{t('report.heading')}</Label>
          <Select id="rp-period" className="w-40" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            {(['day', 'week'] as const).map((p) => (
              <option key={p} value={p}>
                {t(`report.period.${p}`)}
              </option>
            ))}
          </Select>
        </div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className="space-y-1">
        <Label htmlFor="rp-notes">{t('report.notes')}</Label>
        <Textarea id="rp-notes" rows={2} maxLength={3000} placeholder={t('report.notesPlaceholder')} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button onClick={() => void write()} disabled={!!busy}>
        {busy === 'write' ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
        {busy === 'write' ? t('report.writing') : t('report.write')}
      </Button>
      {text && (
        <div className="space-y-2" data-testid="report-draft">
          <Textarea rows={10} maxLength={20000} value={text} aria-label={t('report.heading')} onChange={(e) => setText(e.target.value)} />
          <p className="text-xs text-muted-foreground">{t('report.hint')}</p>
          <div className="flex gap-2">
            <Button onClick={() => void send()} disabled={!!busy || !text.trim()}>
              <Send />
              {t('report.send')}
            </Button>
            <Button variant="outline" onClick={() => void navigator.clipboard.writeText(text)}>
              <Copy />
              {t('report.copy')}
            </Button>
          </div>
        </div>
      )}
      {message && <TeamError code={message === t('report.sent') ? null : message} />}
      {message === t('report.sent') && <p className="text-sm text-green-600">{message}</p>}
    </Card>
  )
}

function Inbox() {
  const { t } = useTranslation('today')
  const uid = useAuth((s) => s.session?.user.id)
  const teamId = useTeam((s) => s.currentTeamId)
  const members = useMemberMap()
  const [open, setOpen] = useState<string | null>(null)
  const reports = useQuery({
    queryKey: ['progress-reports', teamId ?? ''],
    enabled: !!teamId,
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('progress_reports').select('*').eq('team_id', teamId!).neq('author_id', uid!).order('created_at', { ascending: false }).limit(50)
      if (error) throw new Error(dbErrorCode(error))
      return data
    }
  })
  return (
    <Card title={t('inbox.heading')} className="lg:col-span-2">
      {reports.data?.length === 0 && <p className="text-sm text-muted-foreground">{t('inbox.empty')}</p>}
      <ul className="divide-y">
        {reports.data?.map((r) => (
          <li key={r.id} className="py-2">
            <button type="button" className="w-full text-left text-sm font-medium hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>
              {t('inbox.from', { name: members.get(r.author_id)?.display_name ?? '?', label: r.period_label })}
            </button>
            {open === r.id && (
              <div className="mt-2 text-sm">
                <Markdown text={r.body} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}

function Body() {
  const { t } = useTranslation('today')
  const uid = useAuth((s) => s.session?.user.id)
  const teamId = useTeam((s) => s.currentTeamId)
  const manager = isManagerRole(useMyRole())
  const tasks = useMyOpenTasks(teamId, uid).data ?? []
  const now = useTime((s) => s.now)
  const day = useMemo(() => periodRange('day', now), [now])
  const entries = useEntries(day.from, day.to)
  const logged = entries.reduce((s, e) => s + durationSec(e, now), 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-8">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="text-2xl font-semibold">{t('heading')}</h1>
          <span className="text-sm text-muted-foreground">{dayKey(now)}</span>
          <span className="ml-auto text-sm">{t('logged', { duration: formatDuration(logged) })}</span>
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <MyTasks tasks={tasks} />
          <PlanCard tasks={tasks} loggedMinutes={Math.round(logged / 60)} />
          <ReportCard />
          {manager && <Inbox />}
        </div>
      </div>
    </div>
  )
}

export function TodayPage() {
  return (
    <TeamGate>
      <Body />
    </TeamGate>
  )
}
