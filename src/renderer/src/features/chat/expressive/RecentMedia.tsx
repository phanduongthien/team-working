import { useTranslation } from 'react-i18next'
import type { MediaItem } from '@shared/expressive'
import { ClearRecentButton } from './ClearRecentButton'
import { MediaView } from './MediaView'
import { useRecent } from './recentStore'

const NONE: MediaItem[] = []

/** Dải "Gần đây" ở đầu tab GIF / Sticker — một hàng cuộn ngang, bấm để gửi lại. Trống thì ẩn. */
export function RecentMedia({ kind, onPick }: { kind: 'gif' | 'sticker'; onPick(m: MediaItem): void }) {
  const { t } = useTranslation('chat')
  const items = useRecent((s) => s.data?.[kind] ?? NONE)
  if (items.length === 0) return null
  return (
    <div className="space-y-1" data-testid={`recent-${kind}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t('expressive.recentTab')}</span>
        <ClearRecentButton kind={kind} />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {items.map((m) => (
          <button
            key={`${m.source}:${m.id}`}
            type="button"
            className="size-14 shrink-0 rounded-lg hover:ring-2 hover:ring-primary/50"
            title={m.title}
            aria-label={t('expressive.send', { title: m.title || m.id })}
            onClick={() => onPick(m)}
            data-testid="recent-media-item"
          >
            <MediaView item={m} className="size-full" />
          </button>
        ))}
      </div>
    </div>
  )
}
