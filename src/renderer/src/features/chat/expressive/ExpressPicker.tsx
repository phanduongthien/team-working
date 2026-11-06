import { FolderOpen, Smile } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { MediaItem, MediaRef } from '@shared/expressive'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { EmojiPanel } from './EmojiPanel'
import { GiphySearch, MediaGrid, PoweredByGiphy } from './MediaGrid'
import { refOf } from './mediaRef'
import { RecentMedia } from './RecentMedia'
import { useDismiss } from './useDismiss'

type Tab = 'emoji' | 'gif' | 'sticker' | 'favorites'

function useFavorites(): {
  refs: MediaRef[]
  items: MediaItem[] | null
  toggle(m: MediaItem): void
  reload(): void
} {
  const [refs, setRefs] = useState<MediaRef[]>([])
  const [items, setItems] = useState<MediaItem[] | null>(null)
  const reload = (): void =>
    void api.expressive.favorites().then((r) => (setRefs(r.refs), setItems(r.items)))
  useEffect(reload, [])
  return {
    refs,
    items,
    reload,
    toggle: (m) => void api.expressive.toggleFavorite(refOf(m)).then((r) => (setRefs(r), reload()))
  }
}

function StickerTab({
  favorites,
  onPick,
  onToggleFavorite
}: {
  favorites: MediaRef[]
  onPick(m: MediaItem): void
  onToggleFavorite(m: MediaItem): void
}) {
  const { t } = useTranslation('chat')
  const [source, setSource] = useState<'local' | 'giphy'>('local')
  const [local, setLocal] = useState<MediaItem[] | null>(null)
  useEffect(() => void api.expressive.stickers().then(setLocal), [])
  return (
    <div className="flex h-full flex-col gap-2">
      <RecentMedia kind="sticker" onPick={onPick} />
      <div className="flex gap-1 text-xs">
        {(['local', 'giphy'] as const).map((s) => (
          <button
            key={s}
            type="button"
            className={cn(
              'rounded px-2 py-0.5',
              source === s ? 'bg-muted font-medium' : 'text-muted-foreground'
            )}
            onClick={() => setSource(s)}
          >
            {t(`expressive.stickerSource.${s}`)}
          </button>
        ))}
        {source === 'local' && (
          <button
            type="button"
            className="ml-auto flex items-center gap-1 text-muted-foreground hover:text-foreground"
            onClick={() =>
              void api.expressive
                .openStickersFolder()
                .then(() => api.expressive.stickers().then(setLocal))
            }
          >
            <FolderOpen className="size-3.5" />
            {t('expressive.openFolder')}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {source === 'giphy' ? (
          <GiphySearch
            kind="sticker"
            favorites={favorites}
            onPick={onPick}
            onToggleFavorite={onToggleFavorite}
          />
        ) : !local ? (
          <div className="p-2 text-xs text-muted-foreground">{t('expressive.loading')}</div>
        ) : (
          <>
            <MediaGrid
              items={local}
              favorites={favorites}
              onPick={onPick}
              onToggleFavorite={onToggleFavorite}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">{t('expressive.localHelp')}</p>
          </>
        )}
      </div>
    </div>
  )
}

/** Nút mặt cười trong khung soạn tin: emoji (chèn vào chữ), GIF / sticker / yêu thích (gửi ngay). */
export function ExpressPicker({
  disabled,
  onEmoji,
  onMedia
}: {
  disabled: boolean
  onEmoji(emoji: string): void
  onMedia(m: MediaItem): void
}) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<Tab>('emoji')
  const ref = useDismiss(open, () => setOpen(false))
  const fav = useFavorites()
  const send = (m: MediaItem): void => {
    if (disabled) return
    setOpen(false)
    onMedia(m)
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        variant="ghost"
        size="icon-sm"
        title={t('expressive.button')}
        aria-label={t('expressive.button')}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="express-button"
      >
        <Smile />
      </Button>
      {open && (
        <div
          className="absolute bottom-10 left-0 z-30 flex h-96 w-80 flex-col gap-2 rounded-xl border bg-card p-2 shadow-lg"
          role="dialog"
          aria-label={t('expressive.button')}
          data-testid="express-picker"
        >
          <div className="flex gap-1 text-xs" role="tablist">
            {(['emoji', 'gif', 'sticker', 'favorites'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={cn(
                  'flex-1 rounded-md px-2 py-1',
                  tab === k ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/50'
                )}
                onClick={() => {
                  setTab(k)
                  if (k === 'favorites') fav.reload()
                }}
              >
                {t(`expressive.tabs.${k}`)}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1">
            {tab === 'emoji' && <EmojiPanel onPick={onEmoji} />}
            {tab === 'gif' && (
              <div className="flex h-full flex-col gap-2">
                <RecentMedia kind="gif" onPick={send} />
                <div className="min-h-0 flex-1">
                  <GiphySearch
                    kind="gif"
                    favorites={fav.refs}
                    onPick={send}
                    onToggleFavorite={fav.toggle}
                  />
                </div>
              </div>
            )}
            {tab === 'sticker' && (
              <StickerTab favorites={fav.refs} onPick={send} onToggleFavorite={fav.toggle} />
            )}
            {tab === 'favorites' && (
              <div className="flex h-full flex-col gap-2">
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {!fav.items ? (
                    <div className="p-2 text-xs text-muted-foreground">
                      {t('expressive.loading')}
                    </div>
                  ) : fav.items.length === 0 ? (
                    <p className="p-2 text-xs text-muted-foreground">
                      {t('expressive.noFavorites')}
                    </p>
                  ) : (
                    <MediaGrid
                      items={fav.items}
                      favorites={fav.refs}
                      onPick={send}
                      onToggleFavorite={fav.toggle}
                    />
                  )}
                </div>
                {fav.items?.some((m) => m.source === 'giphy') && <PoweredByGiphy />}
              </div>
            )}
          </div>
          {disabled && tab !== 'emoji' && (
            <p className="text-[11px] text-muted-foreground">{t('expressive.cannotSend')}</p>
          )}
        </div>
      )}
    </div>
  )
}
