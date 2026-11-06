import { Star } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { MediaItem, MediaKind, MediaRef } from '@shared/expressive'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { sameRef } from './mediaRef'
import { MediaView } from './MediaView'

/** Lưới GIF / sticker: bấm để gửi, ngôi sao để lưu vào Yêu thích. */
export function MediaGrid({
  items,
  favorites,
  onPick,
  onToggleFavorite
}: {
  items: MediaItem[]
  favorites: MediaRef[]
  onPick(m: MediaItem): void
  onToggleFavorite(m: MediaItem): void
}) {
  const { t } = useTranslation('chat')
  return (
    <div className="grid grid-cols-3 gap-1.5" data-testid="media-grid">
      {items.map((m) => {
        const fav = favorites.some((f) => sameRef(f, m))
        return (
          <div
            key={`${m.source}:${m.id}`}
            className="group relative aspect-square"
            data-testid="media-item"
          >
            <button
              type="button"
              className="size-full rounded-lg hover:ring-2 hover:ring-primary/50"
              title={m.title}
              aria-label={t('expressive.send', { title: m.title || m.id })}
              onClick={() => onPick(m)}
            >
              <MediaView item={m} className="size-full" />
            </button>
            <button
              type="button"
              aria-label={fav ? t('expressive.unfavorite') : t('expressive.favorite')}
              aria-pressed={fav}
              className={cn(
                'absolute top-1 right-1 rounded-full bg-background/80 p-1',
                fav ? 'text-yellow-500' : 'opacity-0 group-hover:opacity-100'
              )}
              onClick={() => onToggleFavorite(m)}
            >
              <Star className={cn('size-3.5', fav && 'fill-current')} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

/** Hướng dẫn lấy key GIPHY khi chưa có — app vẫn chạy bình thường. */
export function GiphyKeyHelp() {
  const { t } = useTranslation('chat')
  return (
    <div className="space-y-2 rounded-md bg-muted/50 p-3 text-xs" data-testid="giphy-key-help">
      <p className="font-medium">{t('expressive.noKey.title')}</p>
      <ol className="list-decimal space-y-1 pl-4">
        <li>
          {t('expressive.noKey.step1')}{' '}
          <button
            type="button"
            className="text-primary underline"
            onClick={() => void api.app.openExternal('https://developers.giphy.com/dashboard/')}
          >
            developers.giphy.com
          </button>
        </li>
        <li>{t('expressive.noKey.step2')}</li>
        <li>
          {t('expressive.noKey.step3')}{' '}
          <Link to="/settings#expressive" className="text-primary underline">
            {t('expressive.noKey.settings')}
          </Link>
        </li>
      </ol>
    </div>
  )
}

export function PoweredByGiphy() {
  return <div className="text-right text-[10px] text-muted-foreground">Powered by GIPHY</div>
}

/** Tab tìm GIF hoặc sticker trên GIPHY: ô tìm (trống = thịnh hành). */
export function GiphySearch({
  kind,
  favorites,
  onPick,
  onToggleFavorite
}: {
  kind: MediaKind
  favorites: MediaRef[]
  onPick(m: MediaItem): void
  onToggleFavorite(m: MediaItem): void
}) {
  const { t } = useTranslation('chat')
  const [query, setQuery] = useState('')
  const [state, setState] = useState<{ items: MediaItem[] } | { error: string } | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    const n = ++seq.current
    const timer = setTimeout(
      () => void api.expressive.search(kind, query).then((r) => n === seq.current && setState(r)),
      query ? 400 : 0
    )
    return () => clearTimeout(timer)
  }, [kind, query])

  const noKey = state && 'error' in state && state.error === 'giphy_no_key'
  return (
    <div className="flex h-full flex-col gap-2">
      {!noKey && (
        <Input
          autoFocus
          aria-label={kind === 'gif' ? t('expressive.gifSearch') : t('expressive.stickerSearch')}
          placeholder={kind === 'gif' ? t('expressive.gifSearch') : t('expressive.stickerSearch')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8"
        />
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!state ? (
          <div className="p-2 text-xs text-muted-foreground">{t('expressive.loading')}</div>
        ) : 'error' in state ? (
          noKey ? (
            <GiphyKeyHelp />
          ) : (
            <p className="p-2 text-xs text-destructive" role="alert">
              {t(`expressive.errors.${state.error}`, { defaultValue: state.error })}
            </p>
          )
        ) : state.items.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">{t('expressive.noResults')}</div>
        ) : (
          <MediaGrid
            items={state.items}
            favorites={favorites}
            onPick={onPick}
            onToggleFavorite={onToggleFavorite}
          />
        )}
      </div>
      <PoweredByGiphy />
    </div>
  )
}
