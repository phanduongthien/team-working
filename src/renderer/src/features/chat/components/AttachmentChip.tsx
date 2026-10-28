import { FileText, Image, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Attachment } from '@shared/types'
import { formatSize, cn } from '@renderer/lib/utils'

export function AttachmentChip({
  attachment,
  onRemove,
  className
}: {
  attachment: Attachment
  onRemove?: () => void
  className?: string
}) {
  const { t } = useTranslation('chat')
  const Icon = attachment.mimeType.startsWith('image/') ? Image : FileText
  return (
    <span
      className={cn('inline-flex max-w-56 items-center gap-1.5 rounded-md border bg-muted/60 px-2 py-1 text-xs', className)}
      title={attachment.name}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{attachment.name}</span>
      <span className="shrink-0 opacity-60">{formatSize(attachment.size)}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={t('attach.remove', { name: attachment.name })}
          className="shrink-0 rounded hover:bg-background"
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </button>
      )}
    </span>
  )
}
