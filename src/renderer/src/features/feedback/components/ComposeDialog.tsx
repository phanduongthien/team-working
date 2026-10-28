import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { FEEDBACK_CATEGORIES, FEEDBACK_KINDS } from '@shared/schemas'
import type { FeedbackCategory, FeedbackKind, FeedbackVisibility } from '@shared/supabase.types'
import { TeamError } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Label, Select, Textarea } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { useAuth } from '@renderer/stores/auth'
import { isManagerRole, useMyRole, useTeam } from '@renderer/stores/team'
import { useProjects } from '../../work/api'
import { useSendFeedback } from '../api'
import { allowedVisibilities } from '../logic'
import { CoachButton } from './CoachButton'

type Props = { open: boolean; onOpenChange(open: boolean): void; defaults?: { kind?: FeedbackKind; recipientId?: string; projectId?: string } }

export function ComposeDialog({ open, onOpenChange, defaults }: Props) {
  const { t } = useTranslation('feedback')
  const uid = useAuth((s) => s.session?.user.id)
  const { currentTeamId, members } = useTeam()
  const manager = isManagerRole(useMyRole())
  const projects = useProjects(currentTeamId).data ?? []
  const send = useSendFeedback()

  const [kind, setKind] = useState<FeedbackKind>(defaults?.kind ?? 'project')
  const [category, setCategory] = useState<FeedbackCategory>('suggestion')
  const [visibility, setVisibility] = useState<FeedbackVisibility>('public')
  const [recipientId, setRecipientId] = useState(defaults?.recipientId ?? '')
  const [projectId, setProjectId] = useState(defaults?.projectId ?? '')
  const [period, setPeriod] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  const kinds = FEEDBACK_KINDS.filter((k) => k !== 'review' || manager)
  const visibilities = allowedVisibilities(kind, category)
  // Đổi loại/phân loại có thể làm chế độ đang chọn không còn hợp lệ → về lựa chọn đầu tiên.
  const effectiveVisibility = visibilities.includes(visibility) ? visibility : visibilities[0]
  const needsRecipient = kind !== 'project'
  const others = members.filter((m) => m.id !== uid)
  const valid = body.trim() && (!needsRecipient || recipientId) && currentTeamId

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    if (!valid || !currentTeamId) return
    send.mutate(
      {
        team_id: currentTeamId,
        kind,
        visibility: effectiveVisibility,
        category,
        recipient_id: needsRecipient ? recipientId : null,
        project_id: projectId || null,
        title: title.trim(),
        body: body.trim(),
        period: kind === 'review' ? period.trim() || null : null
      },
      { onSuccess: () => onOpenChange(false) }
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('new')} className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label>{t('form.kind')}</Label>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('form.kind')}>
              {kinds.map((k) => (
                <Button key={k} type="button" size="sm" role="radio" aria-checked={kind === k} variant={kind === k ? 'default' : 'outline'} onClick={() => setKind(k)}>
                  {t(`kinds.${k}`)}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {needsRecipient && (
              <div className="space-y-1.5">
                <Label htmlFor="fb-recipient">{t('form.recipient')}</Label>
                <Select id="fb-recipient" value={recipientId} onChange={(e) => setRecipientId(e.target.value)}>
                  <option value="" disabled>
                    —
                  </option>
                  {others.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="fb-project">{t('form.project')}</Label>
              <Select id="fb-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">{t('form.noProject')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fb-category">{t('form.category')}</Label>
              <Select id="fb-category" value={category} onChange={(e) => setCategory(e.target.value as FeedbackCategory)}>
                {FEEDBACK_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {t(`categories.${c}`)}
                  </option>
                ))}
              </Select>
            </div>
            {kind === 'review' && (
              <div className="space-y-1.5">
                <Label htmlFor="fb-period">{t('form.period')}</Label>
                <Input id="fb-period" value={period} maxLength={40} placeholder={t('form.periodPlaceholder')} onChange={(e) => setPeriod(e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>{t('form.visibility')}</Label>
            <div className="space-y-1.5" role="radiogroup" aria-label={t('form.visibility')}>
              {visibilities.map((v) => (
                <label key={v} className={cn('flex cursor-pointer items-start gap-2 rounded-md border p-2', effectiveVisibility === v && 'border-primary bg-primary/5')}>
                  <input type="radio" name="fb-visibility" className="mt-1" checked={effectiveVisibility === v} onChange={() => setVisibility(v)} />
                  <span>
                    <span className="block text-sm font-medium">{t(`visibility.${v}`)}</span>
                    <span className="block text-xs text-muted-foreground">{t(`visibilityHelp.${kind}.${v}`)}</span>
                  </span>
                </label>
              ))}
            </div>
            {kind === 'person' && category !== 'praise' && <p className="text-xs text-muted-foreground">{t('form.praiseOnly')}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fb-title">{t('form.title')}</Label>
            <Input id="fb-title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fb-body">{t('form.body')}</Label>
            <Textarea id="fb-body" rows={6} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t('form.bodyHint')}</p>
            <CoachButton
              request={{ draft: body, mode: 'compose', kind, visibility: effectiveVisibility, category, original: '' }}
              onResult={setBody}
            />
          </div>

          <TeamError code={send.error?.message ?? null} />
          <div className="flex justify-end">
            <Button type="submit" disabled={!valid || send.isPending}>
              {t('form.send')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
