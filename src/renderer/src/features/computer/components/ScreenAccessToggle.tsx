import { Eye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useComputer } from '../store'

/** Nút trong khung soạn tin: cho trợ lý xem màn hình (chỉ hiện khi tính năng đã bật và có phím dừng). */
export function ScreenAccessToggle() {
  const { t } = useTranslation('computer')
  const status = useComputer((s) => s.status)
  const setScreenAccess = useComputer((s) => s.setScreenAccess)
  if (!status?.enabled || !status.armed) return null
  const on = status.screenAccess
  const label = on ? t('screen.toggleOff') : t('screen.toggleOn')
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      aria-pressed={on}
      className={cn(on && 'bg-orange-500/15 text-orange-700 hover:bg-orange-500/25 dark:text-orange-300')}
      onClick={() => void setScreenAccess(!on)}
      data-testid="screen-access-toggle"
    >
      {on ? <Eye /> : <EyeOff />}
    </Button>
  )
}
