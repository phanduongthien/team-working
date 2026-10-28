import { Check, CheckCheck, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { FeedbackRow } from '@shared/supabase.types'
import { TeamError } from '@renderer/components/TeamGate'
import { UserAvatar } from '@renderer/components/UserAvatar'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { Textarea } from '@renderer/components/ui/input'
import { useAuth } from '@renderer/stores/auth'
import { isManagerRole, useMyRole } from '@renderer/stores/team'
import { useMemberMap } from '../../work/components/helpers'
import { useDeleteFeedback, useDeleteReply, useReplies, useReply, useSetStatus } from '../api'
import { canChangeStatus } from '../logic'
import { CoachButton } from './CoachButton'
import { FeedbackBadges } from './FeedbackBadges'

export function FeedbackDetail({ feedback, onDeleted }: { feedback: FeedbackRow; onDeleted(): void }) {
  const { t, i18n } = useTranslation('feedback')
  const uid = useAuth((s) => s.session?.user.id)
  const manager = isManagerRole(useMyRole())
  const members = useMemberMap()
  const replies = useReplies(feedback.id)
  const reply = useReply(feedback.id)
  const setStatus = useSetStatus()
  const del = useDeleteFeedback()
  const delReply = useDeleteReply()
  const [body, setBody] = useState('')
  const [confirm, setConfirm] = useState(false)

  const author = feedback.author_id ? members.get(feedback.author_id) : null
  const recipient = feedback.recipient_id ? members.get(feedback.recipient_id) : null
  const authorLabel =
    feedback.is_mine && feedback.visibility === 'anonymous'
      ? t('detail.anonymousYou')
      : (author?.display_name ?? t('detail.anonymous'))
  const statusAllowed = canChangeStatus(feedback, uid, manager)
  const fmt = (iso: string): string => new Date(iso).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })

  const onReply = (e: FormEvent): void => {
    e.preventDefault()
    if (body.trim()) reply.mutate(body.trim(), { onSuccess: () => setBody('') })
  }

  return (
    <article className="space-y-4" data-testid="feedback-detail">
      <header className="space-y-2">
        <FeedbackBadges feedback={feedback} />
        {feedback.title && <h2 className="text-lg font-semibold">{feedback.title}</h2>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <UserAvatar user={author} className="size-5 text-[10px]" />
            {t('detail.from', { name: authorLabel })}
          </span>
          {recipient && <span>{t('detail.to', { name: recipient.display_name })}</span>}
          {feedback.period && <span>{feedback.period}</span>}
          <span>{fmt(feedback.created_at)}</span>
        </div>
      </header>
      <p className="text-sm whitespace-pre-wrap">{feedback.body}</p>

      <div className="flex flex-wrap gap-2">
        {statusAllowed && feedback.status === 'open' && (
          <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: feedback.id, status: 'acknowledged' })}>
            <Check />
            {t('detail.markRead')}
          </Button>
        )}
        {statusAllowed && feedback.status !== 'resolved' && (
          <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: feedback.id, status: 'resolved' })}>
            <CheckCheck />
            {t('detail.markResolved')}
          </Button>
        )}
        {statusAllowed && feedback.status === 'resolved' && (
          <Button size="sm" variant="ghost" onClick={() => setStatus.mutate({ id: feedback.id, status: 'open' })}>
            <RotateCcw />
            {t('detail.reopen')}
          </Button>
        )}
        {(feedback.is_mine || manager) && (
          <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
            <Trash2 />
            {t('detail.delete')}
          </Button>
        )}
      </div>
      <TeamError code={setStatus.error?.message ?? del.error?.message ?? null} />

      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">{t('detail.replies', { count: replies.data?.length ?? 0 })}</h3>
        <ul className="space-y-3">
          {replies.data?.map((r) => {
            const who = r.author_id ? members.get(r.author_id) : null
            const name = r.author_id ? (who?.display_name ?? '?') : t('detail.anonymous')
            return (
              <li key={r.id} className="group flex gap-2 text-sm" data-testid="feedback-reply">
                <UserAvatar user={who} className="size-6 text-[10px]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{name}</span>
                    {r.by_feedback_author && ` (${t('detail.author')})`}
                    {r.is_mine && ` (${t('detail.you')})`} · {fmt(r.created_at)}
                  </div>
                  <p className="whitespace-pre-wrap">{r.body}</p>
                </div>
                {(r.is_mine || manager) && (
                  <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100" title={t('common:actions.delete')} onClick={() => delReply.mutate(r.id)}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            )
          })}
        </ul>
        <form className="space-y-2" onSubmit={onReply}>
          <Textarea rows={3} maxLength={5000} placeholder={t('detail.reply')} aria-label={t('detail.reply')} value={body} onChange={(e) => setBody(e.target.value)} />
          <div className="flex items-center justify-between gap-2">
            <CoachButton
              request={{ draft: body, mode: 'reply', kind: feedback.kind, visibility: feedback.visibility, category: feedback.category, original: feedback.body }}
              onResult={setBody}
            />
            <Button type="submit" size="sm" disabled={!body.trim() || reply.isPending}>
              <Send />
              {t('detail.sendReply')}
            </Button>
          </div>
          <TeamError code={reply.error?.message ?? delReply.error?.message ?? null} />
        </form>
      </section>

      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent title={t('detail.deleteConfirm')}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => del.mutate(feedback.id, { onSuccess: () => (setConfirm(false), onDeleted()) })}>
              {t('detail.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </article>
  )
}
