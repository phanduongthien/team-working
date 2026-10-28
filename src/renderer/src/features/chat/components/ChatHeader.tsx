import { LoaderCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { Conversation } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { errorCode } from '../store'

type Status = { kind: 'idle' } | { kind: 'running' } | { kind: 'done'; added: number } | { kind: 'error'; code: string }

/** Tiêu đề hội thoại + nút nhờ trợ lý đề xuất điều nên ghi nhớ (người dùng duyệt ở trang Trí nhớ). */
export function ChatHeader({ conversation, busy }: { conversation: Conversation; busy: boolean }) {
  const { t } = useTranslation('chat')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  const suggest = async (): Promise<void> => {
    setStatus({ kind: 'running' })
    try {
      const res = await api.memory.extract(conversation.id)
      setStatus('error' in res ? { kind: 'error', code: res.error } : { kind: 'done', added: res.added })
    } catch (err) {
      setStatus({ kind: 'error', code: errorCode(err) })
    }
  }

  return (
    <header className="flex items-center justify-between gap-3 border-b px-6 py-2.5">
      <h2 className="min-w-0 truncate text-sm font-medium">{conversation.title || t('untitled')}</h2>
      <div className="flex shrink-0 items-center gap-2 text-xs">
        {status.kind === 'done' &&
          (status.added > 0 ? (
            <Link to="/memory" className="text-primary underline-offset-2 hover:underline">
              {t('suggest.found', { count: status.added })}
            </Link>
          ) : (
            <span className="text-muted-foreground">{t('suggest.none')}</span>
          ))}
        {status.kind === 'error' && (
          <span className="text-destructive">
            {t('suggest.failed', { message: t(`errors.${status.code}`, { defaultValue: status.code }) })}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || status.kind === 'running'}
          onClick={() => void suggest()}
          title={t('suggest.hint')}
        >
          {status.kind === 'running' ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
          {t('suggest.button')}
        </Button>
      </div>
    </header>
  )
}
