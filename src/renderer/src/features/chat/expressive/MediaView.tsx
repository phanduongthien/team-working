import { useEffect, useState } from 'react'
import type { MediaItem } from '@shared/expressive'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'

const stickerCache = new Map<string, Promise<string | null>>()

/** Ảnh sticker local: hỏi main theo id (renderer không đọc file). */
function useStickerSrc(item: MediaItem): string | null {
  const [local, setLocal] = useState<{ id: string; url: string | null } | null>(null)
  useEffect(() => {
    if (item.source === 'giphy') return
    let alive = true
    if (!stickerCache.has(item.id)) stickerCache.set(item.id, api.expressive.stickerData(item.id))
    void stickerCache.get(item.id)!.then((url) => alive && setLocal({ id: item.id, url }))
    return () => {
      alive = false
    }
  }, [item.id, item.source])
  if (item.source === 'giphy') return item.url
  return local?.id === item.id ? local.url : null
}

/** GIF / sticker trong tin nhắn hoặc bộ chọn. */
export function MediaView({ item, className }: { item: MediaItem; className?: string }) {
  const src = useStickerSrc(item)
  return (
    <div
      className={cn('overflow-hidden rounded-lg', item.kind === 'gif' && 'bg-muted', className)}
      data-testid="message-media"
    >
      {src ? (
        <img
          src={src}
          alt={item.title}
          title={item.title}
          loading="lazy"
          className="size-full object-contain"
          draggable={false}
        />
      ) : (
        <div className="size-full animate-pulse bg-muted" />
      )}
    </div>
  )
}
