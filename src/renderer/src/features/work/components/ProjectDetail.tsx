import { ArrowLeft, CalendarDays, List, Pencil, Plus, Sparkles, SquareKanban, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import type { TaskStatus } from '@shared/schemas'
import type { TaskRow } from '@shared/supabase.types'
import { TeamError } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { Select } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { useAuth } from '@renderer/stores/auth'
import { isManagerRole, useMyRole, useTeam } from '@renderer/stores/team'
import { useDeleteProject, useProjects, useTasks, useUpdateTask } from '../api'
import { localDate, progressOf, type SortKey } from '../logic'
import { formatDate } from './helpers'
import { PlanDialog } from './PlanDialog'
import { ProjectForm } from './ProjectForm'
import { TaskDrawer } from './TaskDrawer'
import { TaskForm } from './TaskForm'
import { CalendarView, KanbanBoard, TaskList } from './views'

type View = 'board' | 'list' | 'calendar'
const VIEWS: { id: View; icon: typeof List }[] = [
  { id: 'board', icon: SquareKanban },
  { id: 'list', icon: List },
  { id: 'calendar', icon: CalendarDays }
]

export function ProjectDetail() {
  const { t, i18n } = useTranslation('work')
  const { projectId } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const uid = useAuth((s) => s.session?.user.id)
  const { currentTeamId, members } = useTeam()
  const manager = isManagerRole(useMyRole())
  const project = useProjects(currentTeamId).data?.find((p) => p.id === projectId)
  const tasks = useTasks(projectId)
  const update = useUpdateTask(projectId ?? '')
  const deleteProject = useDeleteProject()
  const [view, setView] = useState<View>('board')
  const [assignee, setAssignee] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('due')
  const [dialog, setDialog] = useState<'task' | 'plan' | 'edit' | 'delete' | null>(null)

  const all = useMemo(() => tasks.data ?? [], [tasks.data])
  const visible = useMemo(
    () => (assignee === 'all' ? all : all.filter((x) => x.assignee_id === (assignee === 'mine' ? uid : assignee) || !!x.parent_id)),
    [all, assignee, uid]
  )
  const topLevel = all.filter((x) => !x.parent_id)
  const progress = progressOf(topLevel, localDate(new Date()))
  const nextPosition = Math.max(0, ...topLevel.map((x) => x.position)) + 1000
  const openTask = all.find((x) => x.id === params.get('task'))

  const open = (task: TaskRow): void => setParams({ task: task.id })
  const close = (): void => setParams({})
  const canMove = (task: TaskRow): boolean => manager || task.assignee_id === uid || task.assigner_id === uid
  const onMove = (task: TaskRow, status: TaskStatus, position: number): void => {
    if (task.status !== status || task.position !== position) update.mutate({ id: task.id, patch: { status, position } })
  }

  if (!project) return null

  return (
    <div className="flex h-full flex-col">
      <header className="space-y-3 border-b px-6 py-4">
        <Link to="/projects" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" />
          {t('projects.back')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{project.name}</h1>
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{t(`projectStatus.${project.status}`)}</span>
          {project.due_date && <span className="text-sm text-muted-foreground">{formatDate(project.due_date, i18n.language)}</span>}
          <span className="text-sm text-muted-foreground">{t('projects.progress', progress)}</span>
          <span className="flex-1" />
          {manager && (
            <>
              <Button variant="ghost" size="icon-sm" title={t('projects.edit')} onClick={() => setDialog('edit')}>
                <Pencil />
              </Button>
              <Button variant="ghost" size="icon-sm" title={t('projects.delete')} onClick={() => setDialog('delete')}>
                <Trash2 />
              </Button>
              <Button variant="outline" onClick={() => setDialog('plan')}>
                <Sparkles />
                {t('plan.button')}
              </Button>
            </>
          )}
          <Button onClick={() => setDialog('task')}>
            <Plus />
            {t('task.new')}
          </Button>
        </div>
        {project.goal && <p className="text-sm text-muted-foreground">{project.goal}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border p-0.5" role="tablist">
            {VIEWS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                className={cn('flex items-center gap-1.5 rounded px-2.5 py-1 text-sm', view === id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                onClick={() => setView(id)}
              >
                <Icon className="size-4" />
                {t(`views.${id}`)}
              </button>
            ))}
          </div>
          <Select aria-label={t('filters.assignee')} className="h-8 w-44 text-sm" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="all">{t('filters.all')}</option>
            <option value="mine">{t('filters.mine')}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </Select>
          {view === 'list' && (
            <Select aria-label={t('filters.sort')} className="h-8 w-36 text-sm" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {(['due', 'priority', 'status', 'title'] as const).map((s) => (
                <option key={s} value={s}>
                  {t(`filters.sortBy.${s}`)}
                </option>
              ))}
            </Select>
          )}
        </div>
        <TeamError code={update.error?.message ?? null} />
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-6">
        {view === 'board' && <KanbanBoard tasks={visible} onOpen={open} onMove={onMove} canMove={canMove} />}
        {view === 'list' && <TaskList tasks={visible} onOpen={open} sort={sort} />}
        {view === 'calendar' && <CalendarView tasks={visible} onOpen={open} />}
      </div>

      {openTask && <TaskDrawer key={openTask.id} task={openTask} allTasks={all} onClose={close} />}
      {dialog === 'task' && <TaskForm open onOpenChange={(o) => !o && setDialog(null)} projectId={project.id} nextPosition={nextPosition} />}
      {dialog === 'plan' && <PlanDialog open onOpenChange={(o) => !o && setDialog(null)} project={project} nextPosition={nextPosition} />}
      {dialog === 'edit' && currentTeamId && (
        <ProjectForm open onOpenChange={(o) => !o && setDialog(null)} teamId={currentTeamId} project={project} />
      )}
      <Dialog open={dialog === 'delete'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={t('projects.deleteConfirm', { name: project.name })}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => deleteProject.mutate(project.id, { onSuccess: () => void navigate('/projects') })}>
              {t('projects.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
