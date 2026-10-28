import { Check, FilePlus2, FilePen, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { CodeApprovalRequest } from '@shared/types'
import { DiffView } from '@renderer/components/DiffView'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { api } from '@renderer/lib/api'
import { useChat } from '../store'

/**
 * Mỗi lần Claude muốn sửa/tạo file ở chế độ Code: hiện diff để người dùng Đồng ý / Từ chối.
 * Luôn gắn trong app (overlay) để không bỏ lỡ yêu cầu khi đang ở trang khác.
 */
export function CodeApprovalOverlay() {
  const { t } = useTranslation('chat')
  const [queue, setQueue] = useState<CodeApprovalRequest[]>([])
  const conversations = useChat((s) => s.conversations)
  const current = queue[0]

  useEffect(() => api.code.onApproval((req) => setQueue((q) => [...q, req])), [])

  const decide = (allow: boolean): void => {
    if (!current) return
    void api.code.respond(current.id, allow)
    setQueue((q) => q.slice(1))
  }

  if (!current) return null
  const conv = conversations.find((c) => c.id === current.conversationId)
  const Icon = current.change.isNewFile ? FilePlus2 : FilePen

  return (
    <Dialog open onOpenChange={(open) => !open && decide(false)}>
      <DialogContent
        title={t(current.change.isNewFile ? 'code.approveCreate' : 'code.approveEdit')}
        description={t('code.approveHint', { title: conv?.title || t('untitled') })}
        className="max-w-3xl"
        data-testid="code-approval"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <Icon className="size-4" />
            <code className="rounded bg-muted px-1.5 py-0.5">{current.change.path}</code>
            <span className="text-green-600">+{current.change.added}</span>
            <span className="text-red-600">−{current.change.removed}</span>
            {queue.length > 1 && <span className="ml-auto text-xs text-muted-foreground">{t('code.more', { count: queue.length - 1 })}</span>}
          </div>
          <DiffView patch={current.change.patch} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => decide(false)}>
              <X />
              {t('code.reject')}
            </Button>
            <Button onClick={() => decide(true)}>
              <Check />
              {t('code.accept')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
