import { Loader2, Paperclip, Send, Square } from 'lucide-react'
import { useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CHAT_MODES, type ChatMode } from '@shared/ai'
import { MAX_ATTACHMENTS } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Select, Textarea } from '@renderer/components/ui/input'
import { ScreenAccessToggle } from '@renderer/features/computer/components/ScreenAccessToggle'
import { usePreferences } from '@renderer/stores/preferences'
import { pasteKind, useDraft } from '../draft'
import { AttachmentChip } from './AttachmentChip'
import { ImageThumb } from './ImageThumb'

type Props = {
  mode: ChatMode
  onModeChange(mode: ChatMode): void
  streaming: boolean
  /** Không gửi được (vd chưa có Claude CLI). Vẫn cho soạn chữ và đính kèm sẵn. */
  disabled: boolean
  onSend(text: string, attachmentIds: string[]): void
  onStop(): void
}

export function Composer({ mode, onModeChange, streaming, disabled, onSend, onStop }: Props) {
  const { t } = useTranslation('chat')
  const name = usePreferences((s) => s.assistant.name)
  const [text, setText] = useState('')
  const { items, problems, busy, addFiles, addFromClipboard, pick, remove, clear } = useDraft()

  const canSend = !streaming && !disabled && !busy && (text.trim().length > 0 || items.length > 0)

  const submit = (): void => {
    if (!canSend) return
    onSend(text.trim(), items.map((a) => a.id))
    setText('')
    clear()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  // Ctrl+V: có chữ → dán chữ như cũ; có ảnh / file → đính kèm.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>): void => {
    const kind = pasteKind(e.clipboardData)
    if (kind === 'text') return
    e.preventDefault()
    if (kind === 'files') void addFiles(Array.from(e.clipboardData.files))
    else void addFromClipboard()
  }

  const problemText = (p: { name?: string; reason: string }): string =>
    p.reason === 'too_many'
      ? t('attach.tooMany', { max: MAX_ATTACHMENTS })
      : t('attach.rejected', { name: p.name ?? '', reason: t(`attach.reasons.${p.reason}`, { defaultValue: p.reason }) })

  const images = items.filter((a) => a.mimeType.startsWith('image/'))
  const files = items.filter((a) => !a.mimeType.startsWith('image/'))

  return (
    <div className="rounded-xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/30" data-testid="composer">
      {(items.length > 0 || busy) && (
        <div className="flex flex-wrap items-end gap-2 px-1 pt-1.5" data-testid="draft-attachments">
          {images.map((a) => (
            <ImageThumb key={a.id} attachment={a} onRemove={() => remove(a.id)} />
          ))}
          {files.map((a) => (
            <AttachmentChip key={a.id} attachment={a} onRemove={() => remove(a.id)} />
          ))}
          {busy && <Loader2 className="mb-1 size-4 animate-spin text-muted-foreground" aria-label={t('attach.adding')} />}
        </div>
      )}
      {problems.length > 0 && (
        <ul className="px-2 pt-1 text-xs text-destructive" data-testid="attach-problems">
          {problems.map((p, i) => (
            <li key={i}>{problemText(p)}</li>
          ))}
        </ul>
      )}
      <Textarea
        aria-label={t('placeholder', { name })}
        className="max-h-48 min-h-14 border-0 focus-visible:ring-0"
        placeholder={t('placeholder', { name })}
        value={text}
        rows={2}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-1">
          <Select
            aria-label={t('mode.label')}
            className="h-8 w-auto text-xs"
            value={mode}
            disabled={streaming}
            onChange={(e) => onModeChange(e.target.value as ChatMode)}
          >
            {CHAT_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`mode.${m}`)}
              </option>
            ))}
          </Select>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t('attach.button')}
            aria-label={t('attach.button')}
            disabled={streaming || busy || items.length >= MAX_ATTACHMENTS}
            onClick={() => void pick()}
          >
            <Paperclip />
          </Button>
          {/* Quyền xem màn hình không phụ thuộc việc gửi tin được hay không — luôn phải tắt được. */}
          <ScreenAccessToggle />
        </div>
        {streaming ? (
          <Button size="sm" variant="outline" onClick={onStop}>
            <Square />
            {t('stop')}
          </Button>
        ) : (
          <Button size="sm" onClick={submit} disabled={!canSend}>
            <Send />
            {t('send')}
          </Button>
        )}
      </div>
    </div>
  )
}
