import { Send, Square } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CHAT_MODES, type ChatMode } from '@shared/ai'
import { Button } from '@renderer/components/ui/button'
import { Select, Textarea } from '@renderer/components/ui/input'
import { usePreferences } from '@renderer/stores/preferences'

type Props = {
  mode: ChatMode
  onModeChange(mode: ChatMode): void
  streaming: boolean
  disabled: boolean
  onSend(text: string): void
  onStop(): void
}

export function Composer({ mode, onModeChange, streaming, disabled, onSend, onStop }: Props) {
  const { t } = useTranslation('chat')
  const name = usePreferences((s) => s.assistant.name)
  const [text, setText] = useState('')

  const submit = (): void => {
    const value = text.trim()
    if (!value || streaming || disabled) return
    onSend(value)
    setText('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="rounded-xl border bg-card p-2 shadow-sm focus-within:ring-2 focus-within:ring-primary/30">
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
