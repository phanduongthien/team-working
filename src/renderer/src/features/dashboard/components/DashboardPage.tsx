import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { TeamGate } from '@renderer/components/TeamGate'
import { UserAvatar } from '@renderer/components/UserAvatar'
import { Select } from '@renderer/components/ui/input'
import { useTeam } from '@renderer/stores/team'
import { useProjects, useStatusEvents, useTeamRealtime, useTeamTasks } from '../../work/api'
import { formatDate } from '../../work/components/helpers'
import { addDays, burndown, isOverdue, localDate, progressBy, progressOf } from '../../work/logic'

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border bg-card p-4 ${className ?? ''}`}>
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function Bar100({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  )
}

const axisStyle = { fontSize: 11, fill: 'var(--muted-foreground)' }

function Burndown({ projectId, start, end }: { projectId: string; start: string | null; end: string | null }) {
  const { t, i18n } = useTranslation('dashboard')
  const events = useStatusEvents(projectId)
  const data = useMemo(() => {
    const list = events.data ?? []
    if (list.length === 0) return []
    const today = localDate(new Date())
    const from = start ?? localDate(new Date(list[0].at))
    const to = end && end > today ? end : today
    return burndown(list, from < to ? from : addDays(to, -7), to).map((p) => ({ ...p, label: formatDate(p.date, i18n.language).slice(0, 5) }))
  }, [events.data, start, end, i18n.language])

  if (data.length === 0) return <p className="text-sm text-muted-foreground">{t('noData')}</p>
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
        <XAxis dataKey="label" tick={axisStyle} minTickGap={20} />
        <YAxis allowDecimals={false} tick={axisStyle} />
        <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="stepAfter" dataKey="remaining" name={t('remaining')} stroke="var(--primary)" strokeWidth={2} dot={false} />
        <Line type="linear" dataKey="ideal" name={t('ideal')} stroke="var(--muted-foreground)" strokeDasharray="5 5" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function DashboardBody() {
  const { t, i18n } = useTranslation('dashboard')
  const { currentTeamId, members } = useTeam()
  useTeamRealtime(currentTeamId)
  const projects = useProjects(currentTeamId).data ?? []
  const allTasks = useTeamTasks(currentTeamId).data
  const tasks = useMemo(() => (allTasks ?? []).filter((x) => !x.parent_id), [allTasks])
  const today = localDate(new Date())
  const total = progressOf(tasks, today)
  const byProject = progressBy(tasks, 'project_id', today)
  const byMember = progressBy(tasks, 'assignee_id', today)
  const overdue = tasks.filter((x) => isOverdue(x, today)).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
  const [burnProject, setBurnProject] = useState<string>('')
  const selected = projects.find((p) => p.id === (burnProject || projects[0]?.id))
  const workload = members.map((m) => ({ name: m.display_name || '?', hours: byMember.get(m.id)?.openHours ?? 0 }))

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-5 px-6 py-8">
        <h1 className="text-2xl font-semibold">{t('heading')}</h1>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            [t('summary.tasks'), total.total],
            [t('summary.done'), `${total.percent}%`],
            [t('summary.overdue'), total.overdue],
            [t('summary.openHours'), total.openHours]
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border bg-card p-4">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className="mt-1 text-2xl font-semibold" data-testid="stat">
                {value}
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={t('byProject')}>
            {projects.length === 0 && <p className="text-sm text-muted-foreground">{t('noData')}</p>}
            <ul className="space-y-3">
              {projects.map((p) => {
                const pr = byProject.get(p.id) ?? progressOf([], today)
                return (
                  <li key={p.id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <Link to={`/projects/${p.id}`} className="font-medium hover:underline">
                        {p.name}
                      </Link>
                      <span className="text-muted-foreground">{t('percent', pr)}</span>
                    </div>
                    <Bar100 percent={pr.percent} />
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card title={t('byMember')}>
            <ul className="space-y-3">
              {members.map((m) => {
                const pr = byMember.get(m.id) ?? progressOf([], today)
                return (
                  <li key={m.id} className="flex items-center gap-3">
                    <UserAvatar user={m} />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="truncate font-medium">{m.display_name}</span>
                        <span className="text-muted-foreground">{t('percent', pr)}</span>
                      </div>
                      <Bar100 percent={pr.percent} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card title={t('workload')}>
            {workload.every((w) => w.hours === 0) ? (
              <p className="text-sm text-muted-foreground">{t('noData')}</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, workload.length * 32)}>
                <BarChart data={workload} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={axisStyle} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={axisStyle} width={90} />
                  <Tooltip
                    formatter={(v) => t('hours', { hours: v })}
                    contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12 }}
                  />
                  <Bar dataKey="hours" fill="var(--primary)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          <Card title={t('overdueList')}>
            {overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('noOverdue')}</p>
            ) : (
              <ul className="divide-y text-sm">
                {overdue.slice(0, 15).map((task) => {
                  const who = members.find((m) => m.id === task.assignee_id)
                  return (
                    <li key={task.id} className="flex items-center gap-2 py-1.5">
                      <Link to={`/projects/${task.project_id}?task=${task.id}`} className="min-w-0 flex-1 truncate hover:underline">
                        {task.title}
                      </Link>
                      {who && <UserAvatar user={who} className="size-5 text-[10px]" />}
                      <span className="text-xs text-destructive">{formatDate(task.due_date, i18n.language)}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <Card title={t('burndown')} className="lg:col-span-2">
            {selected ? (
              <div className="space-y-2">
                <Select aria-label={t('burndownProject')} className="h-8 w-60 text-sm" value={selected.id} onChange={(e) => setBurnProject(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
                <Burndown projectId={selected.id} start={selected.start_date} end={selected.due_date} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('noData')}</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

export function DashboardPage() {
  return (
    <TeamGate>
      <DashboardBody />
    </TeamGate>
  )
}
