import { FolderOpen, FolderSearch, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FolderAccessRequest } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { api } from '@renderer/lib/api'
import { useChat } from '../store'

/**
 * Trợ lý xin quyền thư mục (ở mọi chế độ): người dùng bấm "Chọn thư mục" → hộp chọn thư mục của Windows
 * (gợi ý sẵn đường dẫn trợ lý nêu). Quyền chỉ có khi người dùng tự chọn; cấp xong app tự gửi lượt "tiếp tục".
 */
export function FolderAccessOverlay() {
  const [queue, setQueue] = useState<FolderAccessRequest[]>([])

  useEffect(
    () =>
      api.code.onFolderAccess((event) => {
        if ('closed' in event) setQueue((q) => q.filter((r) => r.id !== event.id))
        else setQueue((q) => [...q.filter((r) => r.id !== event.id), event])
      }),
    []
  )

  const current = queue[0]
  if (!current) return null
  // key theo id: thẻ mới có state mới (ô "cho phép sửa" theo đúng điều trợ lý xin).
  return <FolderAccessCard key={current.id} request={current} onDone={() => setQueue((q) => q.filter((r) => r.id !== current.id))} />
}

function FolderAccessCard({ request, onDone }: { request: FolderAccessRequest; onDone(): void }) {
  const { t } = useTranslation('chat')
  const [write, setWrite] = useState(request.write)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const conv = useChat((s) => s.conversations.find((c) => c.id === request.conversationId))
  const respond = useChat((s) => s.respondFolderAccess)

  const decide = async (grant: boolean): Promise<void> => {
    setBusy(true)
    const status = await respond(request, grant, grant && write, t('folderAccess.continue'))
    setBusy(false)
    // Đóng hộp chọn thư mục mà chưa chọn → giữ thẻ.
    if (status === 'pending') setHint(t('folderAccess.pickAgain'))
    else onDone()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && void decide(false)}>
      <DialogContent
        title={t(request.write ? 'folderAccess.titleWrite' : 'folderAccess.title')}
        description={t('folderAccess.hint', { title: conv?.title || t('untitled') })}
        data-testid="folder-access"
      >
        <div className="space-y-3 text-sm">
          <p className="rounded-md bg-muted/60 px-3 py-2">{request.reason}</p>
          {request.suggestedPath && (
            <div className="flex items-center gap-2">
              <FolderSearch className="size-4 shrink-0" />
              <span className="text-muted-foreground">{t('folderAccess.suggested')}</span>
              <code className="min-w-0 truncate rounded bg-muted px-1.5 py-0.5" title={request.suggestedPath}>
                {request.suggestedPath}
              </code>
            </div>
          )}
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-0.5" checked={write} disabled={busy} onChange={(e) => setWrite(e.target.checked)} />
            <span>
              {t('folderAccess.write')}
              <span className="block text-xs text-muted-foreground">{t('folderAccess.writeHint')}</span>
            </span>
          </label>
          {hint && <p className="text-xs text-orange-700 dark:text-orange-300">{hint}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => void decide(false)}>
              <X />
              {t('folderAccess.deny')}
            </Button>
            <Button disabled={busy} onClick={() => void decide(true)} data-testid="folder-access-choose">
              <FolderOpen />
              {t('folderAccess.choose')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
