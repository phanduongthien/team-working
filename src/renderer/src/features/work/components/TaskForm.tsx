import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { TASK_PRIORITIES, type TaskPriority } from '@shared/schemas'
import { TeamError } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Label, Select, Textarea } from '@renderer/components/ui/input'
import { useAuth } from '@renderer/stores/auth'
import { isManagerRole, useMyRole, useTeam } from '@renderer/stores/team'
import { useCreateTasks } from '../api'

type Props = { open: boolean; onOpenChange(open: boolean): void; projectId: string; nextPosition: number }

export function TaskForm({ open, onOpenChange, projectId, nextPosition }: Props) {
  const { t } = useTranslation('work')
  const uid = useAuth((s) => s.session?.user.id)
  const members = useTeam((s) => s.members)
  const manager = isManagerRole(useMyRole())
  const create = useCreateTasks()
  const [form, setForm] = useState({
    title: '',
    description: '',
    // Member chỉ tạo task cho chính mình (RLS cũng chặn).
    assignee_id: manager ? '' : (uid ?? ''),
    priority: 'medium' as TaskPriority,
    due_date: '',
    estimate_hours: ''
  })
  const set = (patch: Partial<typeof form>): void => setForm((f) => ({ ...f, ...patch }))
  const assignable = manager ? members : members.filter((m) => m.id === uid)

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    if (!form.title.trim() || !uid) return
    create.mutate(
      [
        {
          project_id: projectId,
          assigner_id: uid,
          title: form.title.trim(),
          description: form.description,
          assignee_id: form.assignee_id || null,
          priority: form.priority,
          due_date: form.due_date || null,
          estimate_hours: form.estimate_hours ? Number(form.estimate_hours) : null,
          position: nextPosition
        }
      ],
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('task.new')} className="max-w-xl">
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="t-title">{t('task.title')}</Label>
            <Input id="t-title" value={form.title} maxLength={200} onChange={(e) => set({ title: e.target.value })} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-desc">{t('task.description')}</Label>
            <Textarea id="t-desc" rows={3} maxLength={10000} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-assignee">{t('task.assignee')}</Label>
              <Select id="t-assignee" value={form.assignee_id} onChange={(e) => set({ assignee_id: e.target.value })}>
                {manager && <option value="">{t('task.unassigned')}</option>}
                {assignable.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-priority">{t('task.priority')}</Label>
              <Select id="t-priority" value={form.priority} onChange={(e) => set({ priority: e.target.value as TaskPriority })}>
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priority.${p}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-due">{t('task.dueDate')}</Label>
              <Input id="t-due" type="date" value={form.due_date} onChange={(e) => set({ due_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-est">{t('task.estimate')}</Label>
              <Input id="t-est" type="number" min={0} max={1000} step={0.5} value={form.estimate_hours} onChange={(e) => set({ estimate_hours: e.target.value })} />
            </div>
          </div>
          <TeamError code={create.error?.message ?? null} />
          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending || !form.title.trim()}>
              {t('task.create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
