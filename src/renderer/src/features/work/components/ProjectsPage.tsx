import { CalendarClock, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Button } from '@renderer/components/ui/button'
import { isManagerRole, useMyRole, useTeam } from '@renderer/stores/team'
import { useProjects, useTeamTasks } from '../api'
import { localDate, progressBy } from '../logic'
import { formatDate } from './helpers'
import { ProjectForm } from './ProjectForm'

export function ProjectsPage() {
  const { t, i18n } = useTranslation('work')
  const navigate = useNavigate()
  const teamId = useTeam((s) => s.currentTeamId)
  const role = useMyRole()
  const projects = useProjects(teamId)
  const tasks = useTeamTasks(teamId)
  const [creating, setCreating] = useState(false)
  const progress = useMemo(() => progressBy(tasks.data ?? [], 'project_id', localDate(new Date())), [tasks.data])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-5 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{t('projects.heading')}</h1>
          {isManagerRole(role) && (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {t('projects.new')}
            </Button>
          )}
        </div>

        {projects.data?.length === 0 && (
          <p className="py-10 text-center text-muted-foreground">
            {isManagerRole(role) ? t('projects.empty') : t('projects.emptyMember')}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.data?.map((p) => {
            const pr = progress.get(p.id)
            return (
              <Link
                key={p.id}
                to={`/projects/${p.id}`}
                className="space-y-3 rounded-lg border bg-card p-4 hover:border-primary/50"
                data-testid="project-card"
              >
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold">{p.name}</h2>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">{t(`projectStatus.${p.status}`)}</span>
                </div>
                {p.description && <p className="line-clamp-2 text-sm text-muted-foreground">{p.description}</p>}
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-primary" style={{ width: `${pr?.percent ?? 0}%` }} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t('projects.progress', { done: pr?.done ?? 0, total: pr?.total ?? 0, percent: pr?.percent ?? 0 })}</span>
                  {!!pr?.overdue && <span className="text-destructive">{t('projects.overdue', { count: pr.overdue })}</span>}
                  {p.due_date && (
                    <span className="flex items-center gap-1">
                      <CalendarClock className="size-3.5" />
                      {formatDate(p.due_date, i18n.language)}
                    </span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
      {teamId && creating && (
        <ProjectForm open={creating} onOpenChange={setCreating} teamId={teamId} onSaved={(p) => void navigate(`/projects/${p.id}`)} />
      )}
    </div>
  )
}
