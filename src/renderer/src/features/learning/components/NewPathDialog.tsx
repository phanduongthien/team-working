import { LoaderCircle, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PlannedStep } from '@shared/schemas'
import { TeamError } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Label, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { usePreferences } from '@renderer/stores/preferences'
import { useTeam } from '@renderer/stores/team'
import { localDate } from '../../work/logic'
import { useCreatePath } from '../api'

/** Nhập mục tiêu → trợ lý lập lộ trình (bản nháp) → người dùng sửa → lưu. */
export function NewPathDialog({ onClose, onCreated }: { onClose(): void; onCreated(id: string): void }) {
  const { t } = useTranslation('learning')
  const language = usePreferences((s) => s.assistant.language)
  const teamId = useTeam((s) => s.currentTeamId)
  const create = useCreatePath()
  const [goal, setGoal] = useState('')
  const [level, setLevel] = useState('')
  const [hours, setHours] = useState(6)
  const [deadline, setDeadline] = useState('')
  const [title, setTitle] = useState('')
  const [shared, setShared] = useState(false)
  const [steps, setSteps] = useState<PlannedStep[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.learning.planPath({ goal, level, hoursPerWeek: hours, deadline: deadline || null, today: localDate(new Date()), language })
      if ('error' in res) setError(t('form.failed', { message: t(`work:errors.${res.error}`, { defaultValue: res.error }) }))
      else {
        setSteps(res.steps)
        if (!title) setTitle(goal.slice(0, 200))
      }
    } finally {
      setBusy(false)
    }
  }

  const edit = (i: number, patch: Partial<PlannedStep>): void => setSteps((s) => s?.map((x, j) => (j === i ? { ...x, ...patch } : x)) ?? null)

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={t('newPath')} className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lp-goal">{t('form.goal')}</Label>
            <Textarea id="lp-goal" rows={2} maxLength={1000} placeholder={t('form.goalPlaceholder')} value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3 space-y-1.5">
              <Label htmlFor="lp-level">{t('form.level')}</Label>
              <Input id="lp-level" maxLength={300} placeholder={t('form.levelPlaceholder')} value={level} onChange={(e) => setLevel(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-hours">{t('form.hours')}</Label>
              <Input id="lp-hours" type="number" min={1} max={80} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lp-deadline">{t('form.deadline')}</Label>
              <Input id="lp-deadline" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          <Button onClick={() => void generate()} disabled={busy || !goal.trim() || hours < 1}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {busy ? t('form.generating') : steps ? t('form.regenerate') : t('form.generate')}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}

          {steps && (
            <div className="space-y-3" data-testid="path-draft">
              <div className="space-y-1.5">
                <Label htmlFor="lp-title">{t('form.title')}</Label>
                <Input id="lp-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <ol className="space-y-2">
                {steps.map((s, i) => (
                  <li key={i} className="grid grid-cols-[1fr_6rem_9rem_auto] items-start gap-2 rounded-md border p-2">
                    <div className="space-y-1">
                      <Input aria-label={t('form.title')} value={s.title} maxLength={200} onChange={(e) => edit(i, { title: e.target.value })} />
                      {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                    </div>
                    <Input
                      aria-label={t('form.hours')}
                      type="number"
                      min={0}
                      value={s.estimatedHours ?? ''}
                      onChange={(e) => edit(i, { estimatedHours: e.target.value ? Number(e.target.value) : null })}
                    />
                    <Input aria-label={t('form.deadline')} type="date" value={s.dueDate ?? ''} onChange={(e) => edit(i, { dueDate: e.target.value || null })} />
                    <Button variant="ghost" size="icon-sm" title={t('step.delete')} onClick={() => setSteps((x) => x?.filter((_, j) => j !== i) ?? null)}>
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ol>
              <Button variant="ghost" size="sm" onClick={() => setSteps((x) => [...(x ?? []), { title: '', description: '', resources: [], estimatedHours: null, dueDate: null }])}>
                <Plus />
                {t('form.addStep')}
              </Button>
              {teamId && (
                <label className="flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={shared} onChange={(e) => setShared(e.target.checked)} />
                  <span>
                    <span className="block text-sm font-medium">{t('form.shared')}</span>
                    <span className="block text-xs text-muted-foreground">{t('form.sharedHelp')}</span>
                  </span>
                </label>
              )}
              <TeamError code={create.error?.message ?? null} />
              <div className="flex justify-end">
                <Button
                  disabled={create.isPending || !title.trim() || steps.some((s) => !s.title.trim())}
                  onClick={() =>
                    create.mutate(
                      { title: title.trim(), goal, level, teamId, shared: shared && !!teamId, steps },
                      { onSuccess: (p) => onCreated(p.id) }
                    )
                  }
                >
                  {t('form.save')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
