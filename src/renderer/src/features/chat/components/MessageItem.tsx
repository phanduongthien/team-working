import { CircleAlert, CircleStop, Wrench } from 'lucide-react'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { stripExpressTags } from '@shared/expressive'
import type { Message } from '@shared/types'
import { AssistantAvatar } from '@renderer/components/AssistantAvatar'
import { usePreferences } from '@renderer/stores/preferences'
import { MediaView } from '../expressive/MediaView'
import { ReactionBar, ReactionChips } from '../expressive/Reactions'
import { SpeakButton, VoiceBadge } from '../voice/VoiceControls'
import { ArtifactChips } from '../artifacts/ArtifactPanel'
import { hideArtifactBlocks } from '@shared/artifacts'
import { AttachmentChip } from './AttachmentChip'
import { ImageThumb } from './ImageThumb'
import { Markdown } from './Markdown'

const mediaSize = (m: NonNullable<Message['media']>): string =>
  m.kind === 'sticker' ? 'size-32' : 'h-40 w-56'

export const MessageItem = memo(function MessageItem({ message }: { message: Message }) {
  const { t } = useTranslation('chat')
  const assistant = usePreferences((s) => s.assistant)

  if (message.role === 'user') {
    return (
      <div className="group/msg flex flex-col items-end gap-1.5" data-testid="message-user">
        {message.attachments.length > 0 && (
          <div className="flex max-w-[80%] flex-wrap justify-end gap-1.5">
            {message.attachments.map((a) =>
              a.mimeType.startsWith('image/') ? (
                <ImageThumb key={a.id} attachment={a} className="size-28" />
              ) : (
                <AttachmentChip key={a.id} attachment={a} />
              )
            )}
          </div>
        )}
        {message.media && <MediaView item={message.media} className={mediaSize(message.media)} />}
        <div className="flex max-w-[80%] items-center gap-2">
          <ReactionBar message={message} align="end" />
          {message.content && (
            <div className="rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm whitespace-pre-wrap text-primary-foreground">
              {message.content}
            </div>
          )}
        </div>
        <VoiceBadge message={message} />
        <ReactionChips message={message} align="end" />
      </div>
    )
  }

  const streaming = message.status === 'streaming'
  // Thẻ biểu cảm ([[gif:…]]) không bao giờ hiện ra màn hình — kể cả lúc đang gõ dở.
  // Khối artifact không hiện trong chat (lúc đang viết: báo "đang viết artifact…").
  const hidden = hideArtifactBlocks(message.content)
  const writingArtifact = streaming && hidden.writing
  const text = stripExpressTags(hidden.text, streaming)
  const waiting = streaming && !text
  return (
    <div className="group/msg flex gap-3" data-testid="message-assistant">
      <AssistantAvatar avatar={assistant.avatar} />
      <div className="min-w-0 flex-1 space-y-2 pt-1 text-sm">
        <div className="text-xs font-medium text-muted-foreground">{assistant.name}</div>
        {message.toolEvents.map((tool, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wrench className="size-3.5" />
            {t('toolUsed', {
              name: t(`tools.${tool.name.replace(/^mcp__mmc__/, '')}`, { defaultValue: tool.name })
            })}
          </div>
        ))}
        {waiting ? (
          <div className="animate-pulse text-muted-foreground">
            {t('thinking', { name: assistant.name })}
          </div>
        ) : (
          <Markdown text={text} />
        )}
        {writingArtifact && (
          <div
            className="animate-pulse text-xs text-muted-foreground"
            data-testid="artifact-writing"
          >
            {t('artifacts.writing')}
          </div>
        )}
        <ArtifactChips refs={message.artifacts} />
        {message.media && <MediaView item={message.media} className={mediaSize(message.media)} />}
        {message.status === 'aborted' && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CircleStop className="size-3.5" />
            {t('stopped')}
          </div>
        )}
        {message.status === 'error' && (
          <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <CircleAlert className="mt-px size-3.5 shrink-0" />
            {t('failed', {
              message: t(`errors.${message.error}`, { defaultValue: message.error ?? '' })
            })}
          </div>
        )}
        <div className="flex items-center gap-2">
          <SpeakButton message={message} />
          <ReactionChips message={message} align="start" />
          <ReactionBar message={message} align="start" />
        </div>
      </div>
    </div>
  )
})
