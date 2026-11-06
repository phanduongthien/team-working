import { LoaderCircle, PanelRight, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { Conversation } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { useArtifacts } from '../artifacts/store'
import { errorCode } from '../store'

type Status = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; added: number } | { kind: 'error'; code: string }

/**
 * Thanh trên khung chat: tiêu đề + các nút (Gợi ý ghi nhớ, Artifacts) xếp bằng flex — không định vị tuyệt đối.
 * Khung hẹp (container query trên chính thanh này) → nút chỉ còn biểu tượng, chữ nằm ở tooltip.
 */
export function ChatHeader({
  conversation,
  canSuggest,
  busy
}: {
  conversation: Conversation | undefined
  /** Có tin nhắn để trích ghi nhớ. */
  canSuggest: boolean
  busy: boolean
}) {
  const { t } = useTranslation('chat')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const artifactsOpen = useArtifacts((s) => s.open)
  const setArtifactsOpen = useArtifacts((s) => s.setOpen)

  const suggest = async (): Promise<void> => {
    if (!conversation) return
    setStatus({ kind: 'running' })
    try {
      const res = await api.memory.extract(conversation.id)
      setStatus('error' in res ? { kind: 'error', code: res.error } : { kind: 'done', added: res.added })
    } catch (err) {
      setStatus({ kind: 'error', code: errorCode(err) })
    }
  }

  const label = 'hidden @2xl/header:inline'
  return (
    <header className="@container/header border-b" data-testid="chat-header">
      <div className="flex min-h-11 items-center gap-2 px-4 py-1.5">
        <h2 className="min-w-0 flex-1 truncate text-sm font-medium" data-testid="chat-title" title={conversation?.title}>
          {conversation ? conversation.title || t('untitled') : ''}
        </h2>
        {status.kind === 'done' && (
          <span className="min-w-0 shrink truncate text-xs" data-testid="suggest-status">
            {status.added > 0 ? (
              <Link to="/memory" className="text-primary underline-offset-2 hover:underline">
                {t('suggest.found', { count: status.added })}
              </Link>
            ) : (
              <span className="text-muted-foreground">{t('suggest.none')}</span>
            )}
          </span>
        )}
        {status.kind === 'error' && (
          <span className="min-w-0 shrink truncate text-xs text-destructive" data-testid="suggest-status">
            {t('suggest.failed', { message: t(`errors.${status.code}`, { defaultValue: status.code }) })}
          </span>
        )}
        {conversation && canSuggest && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs"
            disabled={busy || status.kind === 'running'}
            onClick={() => void suggest()}
            title={t('suggest.hint')}
            aria-label={t('suggest.button')}
            data-testid="suggest-memory"
          >
            {status.kind === 'running' ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            <span className={label}>{t('suggest.button')}</span>
          </Button>
        )}
        <Button
          size="sm"
          variant={artifactsOpen ? 'outline' : 'ghost'}
          className="h-7 shrink-0 text-xs"
          onClick={() => setArtifactsOpen(!artifactsOpen)}
          title={t('artifacts.toggle')}
          aria-label={t('artifacts.toggle')}
          aria-pressed={artifactsOpen}
          data-testid="artifacts-toggle"
        >
          <PanelRight />
          <span className={label}>{t('artifacts.toggle')}</span>
        </Button>
      </div>
    </header>
  )
}
