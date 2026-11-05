import { Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '@shared/types'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'

/** Thumbnail ảnh đính kèm: bấm để xem to, có nút X khi đang soạn tin. */
export function ImageThumb({ attachment, onRemove, className }: { attachment: Attachment; onRemove?: () => void; className?: string }) {
  const { t } = useTranslation('chat')
  const [src, setSrc] = useState<string | null>(attachment.thumbnail ?? null)
  const [open, setOpen] = useState(false)

  // Ảnh trong lịch sử không mang thumbnail sẵn → hỏi main (chỉ trả về nếu ảnh thuộc hội thoại của mình).
  useEffect(() => {
    if (attachment.thumbnail) return
    let alive = true
    void api.chat.attachmentPreview(attachment.id, 'thumb').then((url) => alive && setSrc(url))
    return () => {
      alive = false
    }
  }, [attachment.id, attachment.thumbnail])

  return (
    <div className={cn('group relative size-20 shrink-0', className)} data-testid="image-thumb">
      <button
        type="button"
        className="size-full overflow-hidden rounded-lg border bg-muted focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:outline-none"
        title={attachment.name}
        aria-label={t('attach.view', { name: attachment.name })}
        onClick={() => setOpen(true)}
      >
        {src ? (
          <img src={src} alt={attachment.name} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-[10px] text-muted-foreground">{attachment.name}</span>
        )}
      </button>
      {onRemove && (
        <button
          type="button"
          aria-label={t('attach.remove', { name: attachment.name })}
          className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full border bg-background text-foreground shadow hover:bg-destructive hover:text-white"
          onClick={onRemove}
        >
          <X className="size-3" />
        </button>
      )}
      {open && <ImageLightbox attachment={attachment} onClose={() => setOpen(false)} />}
    </div>
  )
}

function ImageLightbox({ attachment, onClose }: { attachment: Attachment; onClose(): void }) {
  const { t } = useTranslation('chat')
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    void api.chat.attachmentPreview(attachment.id, 'large').then((url) => {
      if (!alive) return
      if (url) setSrc(url)
      else setFailed(true)
    })
    return () => {
      alive = false
    }
  }, [attachment.id])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={attachment.name} className="max-w-[90vw]" data-testid="image-lightbox">
        <div className="flex max-h-[75vh] items-center justify-center overflow-auto">
          {src ? (
            <img src={src} alt={attachment.name} className="max-h-[75vh] max-w-full object-contain" />
          ) : failed ? (
            <p className="text-sm text-muted-foreground">{t('attach.previewFailed')}</p>
          ) : (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
