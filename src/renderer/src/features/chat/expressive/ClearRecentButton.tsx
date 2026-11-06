import { Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { RecentKind } from '@shared/expressive'
import { cn } from '@renderer/lib/utils'
import { useRecent } from './recentStore'

/** "Xoá gần đây": bấm lần đầu chỉ hỏi lại, bấm lần hai (trong 4 giây) mới xoá. */
export function ClearRecentButton({ kind }: { kind: RecentKind }) {
  const { t } = useTranslation('chat')
  const clear = useRecent((s) => s.clear)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])
  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]',
        armed ? 'bg-destructive/10 font-medium text-destructive' : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        clear(kind)
      }}
      data-testid={`clear-recent-${kind}`}
    >
      <Trash2 className="size-3" />
      {armed ? t('expressive.clearRecentConfirm') : t('expressive.clearRecent')}
    </button>
  )
}
