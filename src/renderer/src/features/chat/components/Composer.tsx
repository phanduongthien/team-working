import { Paperclip, Send, Square } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CHAT_MODES, type ChatMode } from '@shared/ai'
import { MAX_ATTACHMENTS } from '@shared/schemas'
import type { Attachment } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Select, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { usePreferences } from '@renderer/stores/preferences'
import { AttachmentChip } from './AttachmentChip'

type Props = {
  mode: ChatMode
  onModeChange(mode: ChatMode): void
  streaming: boolean
  disabled: boolean
  onSend(text: string, attachmentIds: string[]): void
  onStop(): void
}

export function Composer({ mode, onModeChange, streaming, disabled, onSend, onStop }: Props) {
  const { t } = useTranslation('chat')
  const name = usePreferences((s) => s.assistant.name)
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [rejected, setRejected] = useState<string[]>([])

  const submit = (): void => {
    const value = text.trim()
    if (!value || streaming || disabled) return
    onSend(value, attachments.map((a) => a.id))
    setText('')
    setAttachments([])
    setRejected([])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  const pick = async (): Promise<void> => {
    const res = await api.chat.pickAttachments()
    const room = MAX_ATTACHMENTS - attachments.length
    setAttachments((list) => [...list, ...res.attachments.slice(0, room)])
    setRejected([
      ...res.rejected.map((r) => t('attach.rejected', { name: r.name, reason: t(`attach.reasons.${r.reason}`) })),
      ...(res.attachments.length > room ? [t('attach.tooMany', { max: MAX_ATTACHMENTS })] : [])
    ])
  }

  return (
    <div className="rounded-xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1 pt-1">
          {attachments.map((a) => (
            <AttachmentChip
              key={a.id}
              attachment={a}
              onRemove={() => setAttachments((list) => list.filter((x) => x.id !== a.id))}
            />
          ))}
        </div>
      )}
      {rejected.length > 0 && (
        <ul className="px-2 pt-1 text-xs text-destructive">
          {rejected.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <Textarea
        aria-label={t('placeholder', { name })}
        className="max-h-48 min-h-14 border-0 focus-visible:ring-0"
        placeholder={t('placeholder', { name })}
        value={text}
        rows={2}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
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
            disabled={disabled || streaming || attachments.length >= MAX_ATTACHMENTS}
            onClick={() => void pick()}
          >
            <Paperclip />
          </Button>
        </div>
        {streaming ? (
          <Button size="sm" variant="outline" onClick={onStop}>
            <Square />
            {t('stop')}
          </Button>
        ) : (
          <Button size="sm" onClick={submit} disabled={disabled || !text.trim()}>
            <Send />
            {t('send')}
          </Button>
        )}
      </div>
    </div>
  )
}
