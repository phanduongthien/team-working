import { LoaderCircle, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TASK_PRIORITIES, type PlannedTask, type TaskPriority } from '@shared/schemas'
import type { ProjectRow, TaskRow } from '@shared/supabase.types'
import { TeamError } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Label, Select, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import { useTeam } from '@renderer/stores/team'
import { useCreateTasks, useTeamTasks } from '../api'
import { localDate, progressBy } from '../logic'

type Props = { open: boolean; onOpenChange(open: boolean): void; project: ProjectRow; nextPosition: number }

/**
 * Trợ lý đề xuất danh sách task + người làm; manager sửa/bỏ từng dòng rồi mới tạo.
 * Không có gì được ghi vào dữ liệu team cho tới khi bấm "Tạo N task".
 */
export function PlanDialog({ open, onOpenChange, project, nextPosition }: Props) {
  const { t } = useTranslation('work')
  const uid = useAuth((s) => s.session?.user.id)
  const { members, currentTeamId } = useTeam()
  const teamTasks = useTeamTasks(currentTeamId)
  const create = useCreateTasks()
  const [instructions, setInstructions] = useState('')
  const [draft, setDraft] = useState<PlannedTask[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<number | null>(null)

  const generate = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    setCreated(null)
    const today = localDate(new Date())
    const load = progressBy(teamTasks.data ?? [], 'assignee_id', today)
    try {
      const res = await api.planner.planTasks({
        projectName: project.name,
        description: project.description,
        goal: project.goal,
        dueDate: project.due_date,
        today,
        instructions,
        members: members.map((m) => ({
          id: m.id,
          name: m.display_name || m.github_username || '?',
          skills: m.skills,
          openHours: load.get(m.id)?.openHours ?? 0
        }))
      })
      if ('error' in res) setError(res.error)
      else setDraft(res.tasks)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const edit = (i: number, patch: Partial<PlannedTask>): void =>
    setDraft((d) => d?.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) ?? null)

  const createAll = (): void => {
    if (!draft?.length || !uid) return
    const rows: Partial<TaskRow>[] = draft.map((p, i) => ({
      project_id: project.id,
      assigner_id: uid,
      title: p.title,
      description: [p.description, p.dependsOn.length ? t('plan.dependsOn', { list: p.dependsOn.join(', ') }) : '']
        .filter(Boolean)
        .join('\n\n'),
      assignee_id: p.assigneeId,
      priority: p.priority,
      estimate_hours: p.estimateHours,
      due_date: p.dueDate,
      ai_generated: true,
      position: nextPosition + i * 1000
    }))
    create.mutate(rows as Parameters<typeof create.mutate>[0], {
      onSuccess: (res) => {
        setCreated(res.length)
        setDraft(null)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('plan.heading')} description={t('plan.intro')} className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="plan-instr">{t('plan.instructions')}</Label>
            <Textarea
              id="plan-instr"
              rows={2}
              maxLength={2000}
              placeholder={t('plan.instructionsPlaceholder')}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={() => void generate()} disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
              {draft ? t('plan.regenerate') : t('plan.generate')}
            </Button>
            {loading && <span className="text-sm text-muted-foreground">{t('plan.generating')}</span>}
            {created !== null && <span className="text-sm text-green-600">{t('plan.created', { count: created })}</span>}
          </div>
          {error && <p className="text-sm text-destructive">{t('plan.failed', { message: t(`errors.${error}`, { defaultValue: error }) })}</p>}

          {draft && (
            <div className="space-y-2" data-testid="plan-draft">
              {draft.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_10rem_7rem_6rem_9rem_auto] items-start gap-2 rounded-md border p-2">
                  <div className="space-y-1">
                    <Input aria-label={t('task.title')} value={row.title} maxLength={200} onChange={(e) => edit(i, { title: e.target.value })} />
                    {row.reason && (
                      <p className="text-xs text-muted-foreground">
                        {t('plan.reason')}: {row.reason}
                      </p>
                    )}
                  </div>
                  <Select aria-label={t('task.assignee')} value={row.assigneeId ?? ''} onChange={(e) => edit(i, { assigneeId: e.target.value || null })}>
                    <option value="">{t('task.unassigned')}</option>
                    {members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                  </Select>
                  <Select aria-label={t('task.priority')} value={row.priority} onChange={(e) => edit(i, { priority: e.target.value as TaskPriority })}>
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {t(`priority.${p}`)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    aria-label={t('task.estimate')}
                    type="number"
                    min={0}
                    step={0.5}
                    value={row.estimateHours ?? ''}
                    onChange={(e) => edit(i, { estimateHours: e.target.value ? Number(e.target.value) : null })}
                  />
                  <Input aria-label={t('task.dueDate')} type="date" value={row.dueDate ?? ''} onChange={(e) => edit(i, { dueDate: e.target.value || null })} />
                  <Button variant="ghost" size="icon-sm" title={t('plan.remove')} onClick={() => setDraft((d) => d?.filter((_, idx) => idx !== i) ?? null)}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <TeamError code={create.error?.message ?? null} />
              <div className="flex justify-end">
                <Button onClick={createAll} disabled={create.isPending || draft.length === 0 || draft.some((r) => !r.title.trim())}>
                  {t('plan.createAll', { count: draft.length })}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
