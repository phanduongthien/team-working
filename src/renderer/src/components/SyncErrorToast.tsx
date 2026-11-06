import { X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSyncErrors } from '@renderer/lib/sync'

const SHOW_MS = 8_000

/** Lưu thay đổi thất bại (đã hoàn tác trên giao diện) → báo ở góc màn hình. */
export function SyncErrorToast() {
  const { t } = useTranslation()
  const error = useSyncErrors((s) => s.error)
  const clear = useSyncErrors((s) => s.clear)
  useEffect(() => {
    if (!error) return
    const timer = setTimeout(clear, SHOW_MS)
    return () => clearTimeout(timer)
  }, [error, clear])
  if (!error) return null
  return (
    <div
      role="alert"
      data-testid="sync-error"
      className="fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-2 rounded-md border border-destructive/40 bg-background p-3 text-sm shadow-lg"
    >
      <span className="text-destructive">{t('sync.saveFailed', { code: error.code })}</span>
      <button type="button" className="text-muted-foreground" onClick={clear} aria-label={t('actions.cancel')}>
        <X className="size-4" />
      </button>
    </div>
  )
}
