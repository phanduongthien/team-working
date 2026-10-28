import { BrainCircuit, ChevronDown, ChevronRight, Circle, CircleCheck, CircleDot, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { LearningPathRow, LearningStepRow } from '@shared/supabase.types'
import { TeamError } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Textarea } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { formatDate } from '../../work/components/helpers'
import { useAddStep, useDeletePath, useDeleteStep, useQuizAttempts, useUpdatePath, useUpdateStep } from '../api'
import { NEXT_STATUS, stepProgress } from '../logic'
import { QuizDialog } from './QuizDialog'

const STATUS_ICON = { todo: Circle, doing: CircleDot, done: CircleCheck } as const

function StepItem({ step, editable, onQuiz }: { step: LearningStepRow; editable: boolean; onQuiz(): void }) {
  const { t, i18n } = useTranslation('learning')
  const update = useUpdateStep()
  const del = useDeleteStep()
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState(step.notes)
  const Icon = STATUS_ICON[step.status]

  return (
    <li className="rounded-md border" data-testid="learning-step">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          disabled={!editable}
          title={t(`step.status.${step.status}`)}
          aria-label={t(`step.status.${step.status}`)}
          className={cn('shrink-0', step.status === 'done' ? 'text-green-600' : step.status === 'doing' ? 'text-primary' : 'text-muted-foreground')}
          onClick={() => update.mutate({ id: step.id, patch: { status: NEXT_STATUS[step.status] } })}
        >
          <Icon className="size-5" />
        </button>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
          <span className={cn('truncate', step.status === 'done' && 'text-muted-foreground line-through')}>{step.title}</span>
        </button>
        {step.estimated_hours !== null && <span className="text-xs text-muted-foreground">{t('step.hours', { hours: step.estimated_hours })}</span>}
        {step.due_date && <span className="text-xs text-muted-foreground">{formatDate(step.due_date, i18n.language)}</span>}
        {editable && (
          <Button variant="ghost" size="icon-sm" title={t('step.quiz')} onClick={onQuiz}>
            <BrainCircuit />
          </Button>
        )}
      </div>
      {open && (
        <div className="space-y-2 border-t p-3 text-sm">
          {step.description && <p className="whitespace-pre-wrap">{step.description}</p>}
          {step.resources.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground">{t('step.resources')}</p>
              <ul className="list-disc pl-5">
                {step.resources.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          )}
          <Textarea
            aria-label={t('step.notes')}
            placeholder={t('step.notes')}
            rows={3}
            maxLength={10000}
            value={notes}
            disabled={!editable}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => notes !== step.notes && update.mutate({ id: step.id, patch: { notes } })}
          />
          {editable && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => del.mutate(step.id)}>
                <Trash2 />
                {t('step.delete')}
              </Button>
            </div>
          )}
          <TeamError code={update.error?.message ?? null} />
        </div>
      )}
    </li>
  )
}

export function PathDetail({ path, steps, editable, onDeleted }: { path: LearningPathRow; steps: LearningStepRow[]; editable: boolean; onDeleted(): void }) {
  const { t, i18n } = useTranslation('learning')
  const updatePath = useUpdatePath()
  const deletePath = useDeletePath()
  const addStep = useAddStep()
  const attempts = useQuizAttempts(path.id)
  const [newStep, setNewStep] = useState('')
  const [quiz, setQuiz] = useState<{ topic: string; context: string; stepId: string | null } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const pr = stepProgress(steps)

  const onAdd = (e: FormEvent): void => {
    e.preventDefault()
    if (newStep.trim()) addStep.mutate({ pathId: path.id, title: newStep.trim(), position: Math.max(0, ...steps.map((s) => s.position)) + 1000 }, { onSuccess: () => setNewStep('') })
  }

  return (
    <div className="space-y-4" data-testid="path-detail">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">{path.title}</h2>
        {path.goal && <p className="text-sm text-muted-foreground">{path.goal}</p>}
        <div className="flex items-center gap-2 text-sm">
          <div className="h-1.5 w-40 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${pr.percent}%` }} />
          </div>
          <span className="text-muted-foreground">{t('progress', pr)}</span>
        </div>
      </div>

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setQuiz({ topic: path.title, context: [path.goal, ...steps.map((s) => `- ${s.title}: ${s.description}`)].join('\n').slice(0, 6000), stepId: null })}>
            <BrainCircuit />
            {t('path.quiz')}
          </Button>
          {path.team_id && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={path.shared} onChange={(e) => updatePath.mutate({ id: path.id, patch: { shared: e.target.checked } })} />
              {t('form.shared')}
            </label>
          )}
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setConfirm(true)}>
            <Trash2 />
            {t('path.delete')}
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {steps.map((s) => (
          <StepItem
            key={s.id}
            step={s}
            editable={editable}
            onQuiz={() => setQuiz({ topic: s.title, context: [s.description, s.notes].filter(Boolean).join('\n\n').slice(0, 6000), stepId: s.id })}
          />
        ))}
      </ul>
      {editable && (
        <form onSubmit={onAdd}>
          <Input placeholder={t('step.add')} aria-label={t('step.add')} maxLength={200} value={newStep} onChange={(e) => setNewStep(e.target.value)} />
        </form>
      )}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">{t('path.history')}</h3>
        {attempts.data?.length === 0 && <p className="text-sm text-muted-foreground">{t('path.noHistory')}</p>}
        <ul className="space-y-1 text-sm">
          {attempts.data?.map((a) => (
            <li key={a.id} className="flex flex-wrap gap-x-3">
              <span className="text-muted-foreground">{new Date(a.created_at).toLocaleDateString(i18n.language)}</span>
              <span className="font-medium">{a.topic}</span>
              <span>
                {a.score}/{a.total}
              </span>
              {a.weak_points.length > 0 && <span className="text-muted-foreground">{t('path.weak', { list: a.weak_points.join(', ') })}</span>}
            </li>
          ))}
        </ul>
      </section>

      {quiz && <QuizDialog topic={quiz.topic} context={quiz.context} pathId={path.id} stepId={quiz.stepId} onClose={() => setQuiz(null)} />}
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title={t('path.deleteConfirm', { title: path.title })}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => deletePath.mutate(path.id, { onSuccess: () => (setConfirm(false), onDeleted()) })}>
              {t('path.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
