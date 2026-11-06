import { Mail, MessageCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DraftApprovalRequest } from '@shared/connectors'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Textarea } from '@renderer/components/ui/input'
import { useConnectors } from '../store'

function DraftDialog({ draft }: { draft: DraftApprovalRequest }) {
  const { t } = useTranslation('connectors')
  const respond = useConnectors((s) => s.respondDraft)
  const [body, setBody] = useState(draft.body)
  const Icon = draft.service === 'gmail' ? Mail : MessageCircle
  return (
    <Dialog open>
      <DialogContent
        title={t(`draft.title.${draft.service}`)}
        className="max-w-xl"
        data-testid="draft-approval"
      >
        <div className="space-y-3 text-sm">
          <p className="flex items-center gap-2">
            <Icon className="size-4 shrink-0" />
            <span>
              {t(`draft.target.${draft.service}`)}{' '}
              <span className="font-medium" data-testid="draft-target">
                {draft.target}
              </span>
            </span>
          </p>
          {draft.account && (
            <p className="rounded-md bg-muted px-3 py-2" data-testid="draft-account">
              {t('draft.account')}{' '}
              <span className="font-medium">{draft.account.email}</span>{' '}
              <span className="text-muted-foreground">({draft.account.label})</span>
            </p>
          )}
          {draft.subject !== null && (
            <p>
              {t('draft.subject')} <span className="font-medium">{draft.subject || '—'}</span>
            </p>
          )}
          {draft.replyTo && (
            <p className="text-xs text-muted-foreground">
              {t('draft.replyTo', { subject: draft.replyTo })}
            </p>
          )}
          <Textarea
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="resize-y"
            data-testid="draft-body"
          />
          <p className="text-xs text-muted-foreground">{t(`draft.hint.${draft.service}`)}</p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => void respond(draft.id, false)}
            data-testid="draft-reject"
          >
            {t('draft.reject')}
          </Button>
          <Button
            disabled={!body.trim()}
            onClick={() => void respond(draft.id, true, body)}
            data-testid="draft-approve"
          >
            {t(`draft.approve.${draft.service}`)}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Luôn gắn trong app: trợ lý đề xuất bản nháp → người dùng xem / sửa / duyệt. Không bao giờ gửi. */
export function DraftOverlay() {
  const draft = useConnectors((s) => s.drafts[0])
  return draft ? <DraftDialog key={draft.id} draft={draft} /> : null
}
