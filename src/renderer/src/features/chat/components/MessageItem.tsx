import { CircleAlert, CircleStop, Wrench } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '@shared/types'
import { AssistantAvatar } from '@renderer/components/AssistantAvatar'
import { usePreferences } from '@renderer/stores/preferences'
import { Markdown } from './Markdown'

export const MessageItem = memo(function MessageItem({ message }: { message: Message }) {
  const { t } = useTranslation('chat')
  const assistant = usePreferences((s) => s.assistant)

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
          {message.content}
        </div>
      </div>
    )
  }

  const waiting = message.status === 'streaming' && !message.content
  return (
    <div className="flex gap-3">
      <AssistantAvatar avatar={assistant.avatar} />
      <div className="min-w-0 flex-1 space-y-2 pt-1 text-sm">
        <div className="text-xs font-medium text-muted-foreground">{assistant.name}</div>
        {message.toolEvents.map((tool, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wrench className="size-3.5" />
            {t('toolUsed', { name: tool.name })}
          </div>
        ))}
        {waiting ? (
          <div className="animate-pulse text-muted-foreground">{t('thinking', { name: assistant.name })}</div>
        ) : (
          <Markdown text={message.content} />
        )}
        {message.status === 'aborted' && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleStop className="size-3.5" />
            {t('stopped')}
          </div>
        )}
        {message.status === 'error' && (
          <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            {t('failed', { message: t(`errors.${message.error}`, { defaultValue: message.error ?? '' }) })}
          </div>
        )}
      </div>
    </div>
  )
})
