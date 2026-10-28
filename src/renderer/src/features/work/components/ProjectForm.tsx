import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { PROJECT_STATUSES, type ProjectStatus } from '@shared/schemas'
import type { ProjectRow } from '@shared/supabase.types'
import { TeamError } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Label, Select, Textarea } from '@renderer/components/ui/input'
import { useAuth } from '@renderer/stores/auth'
import { useSaveProject } from '../api'

type Props = { open: boolean; onOpenChange(open: boolean): void; teamId: string; project?: ProjectRow; onSaved?(p: ProjectRow): void }

export function ProjectForm({ open, onOpenChange, teamId, project, onSaved }: Props) {
  const { t } = useTranslation('work')
  const uid = useAuth((s) => s.session?.user.id)
  const save = useSaveProject()
  const [form, setForm] = useState({
    name: project?.name ?? '',
    description: project?.description ?? '',
    goal: project?.goal ?? '',
    status: project?.status ?? ('active' as ProjectStatus),
    start_date: project?.start_date ?? '',
    due_date: project?.due_date ?? ''
  })
  const set = (patch: Partial<typeof form>): void => setForm((f) => ({ ...f, ...patch }))

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    if (!form.name.trim() || !uid) return
    save.mutate(
      {
        id: project?.id,
        team_id: teamId,
        created_by: project?.created_by ?? uid,
        name: form.name.trim(),
        description: form.description,
        goal: form.goal,
        status: form.status,
        start_date: form.start_date || null,
        due_date: form.due_date || null
      },
      {
        onSuccess: (p) => {
          onOpenChange(false)
          onSaved?.(p)
        }
      }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={project ? t('projects.edit') : t('projects.new')} className="max-w-xl">
        <form className="space-y-3" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="p-name">{t('projects.name')}</Label>
            <Input id="p-name" value={form.name} maxLength={120} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-desc">{t('projects.description')}</Label>
            <Textarea id="p-desc" rows={3} maxLength={5000} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="p-goal">{t('projects.goal')}</Label>
            <Textarea id="p-goal" rows={2} maxLength={2000} value={form.goal} onChange={(e) => set({ goal: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-status">{t('projects.status')}</Label>
              <Select id="p-status" value={form.status} onChange={(e) => set({ status: e.target.value as ProjectStatus })}>
                {PROJECT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`projectStatus.${s}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-start">{t('projects.startDate')}</Label>
              <Input id="p-start" type="date" value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-due">{t('projects.dueDate')}</Label>
              <Input id="p-due" type="date" value={form.due_date} onChange={(e) => set({ due_date: e.target.value })} />
            </div>
          </div>
          <TeamError code={save.error ? save.error.message : null} />
          <div className="flex justify-end">
            <Button type="submit" disabled={save.isPending || !form.name.trim()}>
              {t('common:actions.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
