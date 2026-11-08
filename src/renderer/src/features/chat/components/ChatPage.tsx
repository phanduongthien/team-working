import { CircleAlert, X } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { ChatMode } from '@shared/ai'
import { AssistantAvatar } from '@renderer/components/AssistantAvatar'
import { Button } from '@renderer/components/ui/button'
import { useCliStatus } from '@renderer/stores/cli'
import { usePreferences } from '@renderer/stores/preferences'
import { dragHasFiles, useDraft } from '../draft'
import { useChat } from '../store'
import { ChatHeader } from './ChatHeader'
import { CodeBar } from './CodeBar'
import { Composer } from './Composer'
import { ArtifactPanel } from '../artifacts/ArtifactPanel'
import { ConversationSidebar } from './ConversationSidebar'
import { GroupSuggestion } from './GroupSuggestion'
import { MessageItem } from './MessageItem'
import { PinnedBar, ReplyPreview } from './MessageActions'

const EMPTY: never[] = []

export function ChatPage() {
  const { t } = useTranslation('chat')
  const assistant = usePreferences((s) => s.assistant)
  const cliOk = useCliStatus((s) => s.status?.state === 'ok')
  const {
    activeId,
    conversations,
    streaming,
    error,
    loadConversations,
    send,
    stop,
    setMode,
    clearError
  } = useChat()
  const messages = useChat((s) => (activeId ? (s.messages[activeId] ?? EMPTY) : EMPTY))
  const active = conversations.find((c) => c.id === activeId)
  const [draftMode, setDraftMode] = useState<ChatMode>('free')
  const mode = active?.mode ?? draftMode
  const isStreaming = !!(activeId && streaming[activeId])
  const bottomRef = useRef<HTMLDivElement>(null)
  const addFiles = useDraft((s) => s.addFiles)

  useEffect(() => {
    void loadConversations()
  }, [loadConversations])

  const lastContent = messages.at(-1)?.content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [activeId, messages.length, lastContent])

  const onModeChange = (m: ChatMode): void => {
    if (active) void setMode(active.id, m)
    else setDraftMode(m)
  }

  // Kéo thả ảnh / file vào bất kỳ đâu trong khung chat.
  const [dragging, setDragging] = useState(false)
  const onDragOver = (e: DragEvent): void => {
    if (!dragHasFiles(e.dataTransfer.types)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    if (!dragging) setDragging(true)
  }
  const onDragLeave = (e: DragEvent): void => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
  }
  const onDrop = (e: DragEvent): void => {
    if (!dragHasFiles(e.dataTransfer.types)) return
    e.preventDefault()
    setDragging(false)
    void addFiles(Array.from(e.dataTransfer.files))
  }

  return (
    <div className="flex h-full min-h-0">
      <ConversationSidebar />
      <section
        className="relative flex min-w-0 flex-1 flex-col"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        data-testid="chat-drop-zone"
      >
        {dragging && (
          <div
            className="pointer-events-none absolute inset-3 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary"
            data-testid="drop-overlay"
          >
            {t('attach.drop')}
          </div>
        )}
        <ChatHeader
          key={active?.id ?? 'new'}
          conversation={active}
          canSuggest={messages.length > 0}
          busy={isStreaming}
        />
        <PinnedBar messages={messages} />
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 px-6 py-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center gap-3 pt-24 text-center">
                <AssistantAvatar avatar={assistant.avatar} className="size-14 text-3xl" />
                <h1 className="text-xl font-semibold">{t('welcome', { name: assistant.name })}</h1>
                <p className="max-w-md text-sm text-muted-foreground">{t('welcomeHint')}</p>
              </div>
            ) : (
              messages.map((m) => <MessageItem key={m.id} message={m} />)
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-3xl space-y-2 px-6 pb-4">
          {!cliOk && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm">
              <span className="flex items-center gap-2 text-destructive">
                <CircleAlert className="size-4" />
                {t('cliMissing')}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to="/claude">{t('cliFix')}</Link>
              </Button>
            </div>
          )}
          {error && (
            <div className="flex items-center justify-between rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t(`errors.${error}`, {
                defaultValue: t('common:errors.generic', { message: error })
              })}
              <Button variant="ghost" size="icon-sm" onClick={clearError}>
                <X />
              </Button>
            </div>
          )}
          {active && <GroupSuggestion conversation={active} />}
          {/* Thư mục gắn với cuộc trò chuyện: chế độ Code luôn hiện; chế độ khác hiện khi đã có thư mục (vd trợ lý xin quyền). */}
          {(mode === 'code' || active?.cwd) && <CodeBar conversation={active} busy={isStreaming} />}
          <ReplyPreview conversationId={activeId} />
          <Composer
            mode={mode}
            onModeChange={onModeChange}
            streaming={isStreaming}
            disabled={!cliOk}
            onSend={(text, attachmentIds, voice) =>
              void send(text, mode, attachmentIds, undefined, voice)
            }
            onSendMedia={(m) =>
              void send('', mode, [], { kind: m.kind, source: m.source, id: m.id })
            }
            onStop={() => void stop()}
          />
          <p className="text-center text-[11px] text-muted-foreground">{t('usageNote')}</p>
        </div>
      </section>
      <ArtifactPanel conversationId={active?.id ?? null} />
    </div>
  )
}
