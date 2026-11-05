import { Eye, OctagonX, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { formatHotkey, useComputer } from '../store'

const STOP_NOTICE_MS = 8_000

/**
 * Luôn gắn trong app: khi trợ lý được xem màn hình thì có dải nhắc + nút dừng ở góc;
 * sau khi dừng khẩn cấp hiện thông báo vài giây.
 */
export function ComputerOverlay() {
  const { t } = useTranslation('computer')
  const status = useComputer((s) => s.status)
  const emergencyStop = useComputer((s) => s.emergencyStop)
  // Thông báo hiện cho lần dừng mới nhất tới khi hết giờ hoặc người dùng đóng.
  const [hiddenFor, setHiddenFor] = useState<number | null>(null)
  const stopAt = status?.lastStop?.at ?? null
  useEffect(() => {
    if (!stopAt) return
    const timer = setTimeout(() => setHiddenFor(stopAt), STOP_NOTICE_MS)
    return () => clearTimeout(timer)
  }, [stopAt])
  const noticeFor = stopAt !== null && hiddenFor !== stopAt ? stopAt : null
  const dismissNotice = (): void => setHiddenFor(stopAt)

  if (!status) return null
  const hotkey = formatHotkey(status.hotkey)

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-40 flex flex-col items-end gap-2">
      {noticeFor && (
        <div
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-destructive/40 bg-card px-4 py-3 text-sm shadow-lg"
          role="status"
          data-testid="emergency-stopped"
        >
          <OctagonX className="size-4 text-destructive" />
          {t('stop.done')}
          <Button variant="ghost" size="icon-sm" aria-label={t('common:actions.cancel')} onClick={dismissNotice}>
            <X />
          </Button>
        </div>
      )}
      {status.screenAccess && (
        <div
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-orange-500/40 bg-card px-3 py-1.5 text-xs shadow-lg"
          data-testid="screen-access-indicator"
        >
          <Eye className="size-3.5 text-orange-600" />
          {t('indicator', { hotkey })}
          <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={() => void emergencyStop()}>
            {t('stop.short')}
          </Button>
        </div>
      )}
    </div>
  )
}
