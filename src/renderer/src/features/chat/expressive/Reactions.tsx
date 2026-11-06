import { SmilePlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { usePreferences } from '@renderer/stores/preferences'
import { useChat } from '../store'
import { QUICK_REACTIONS } from './emojiData'
import { EmojiPanel } from './EmojiPanel'
import { useDismiss } from './useDismiss'

/** Cảm xúc đã thả dưới tin nhắn: của bạn bấm lại để bỏ. */
export function ReactionChips({ message, align }: { message: Message; align: 'start' | 'end' }) {
  const { t } = useTranslation('chat')
  const name = usePreferences((s) => s.assistant.name)
  const react = useChat((s) => s.react)
  if (message.reactions.length === 0) return null
  return (
    <div
      className={cn('flex gap-1', align === 'end' ? 'justify-end' : 'justify-start')}
      data-testid="message-reactions"
    >
      {message.reactions.map((r) => {
        const who = r.by === 'user' ? t('expressive.you') : name
        return (
          <button
            key={r.by}
            type="button"
            disabled={r.by !== 'user'}
            title={t('expressive.reactedBy', { name: who })}
            aria-label={t('expressive.reactedBy', { name: who }) + ` ${r.emoji}`}
            className={cn(
              'rounded-full border bg-card px-1.5 py-0.5 text-sm leading-none shadow-sm',
              r.by === 'user' && 'border-primary/40 hover:bg-muted'
            )}
            onClick={() => void react(message, r.emoji)}
            data-testid={`reaction-${r.by}`}
          >
            {r.emoji}
          </button>
        )
      })}
    </div>
  )
}

/** Thanh thả nhanh hiện khi rê chuột vào tin; "+" mở bộ chọn đầy đủ. */
export function ReactionBar({ message, align }: { message: Message; align: 'start' | 'end' }) {
  const { t } = useTranslation('chat')
  const react = useChat((s) => s.react)
  const [open, setOpen] = useState(false)
  const ref = useDismiss(open, () => setOpen(false))
  const mine = message.reactions.find((r) => r.by === 'user')?.emoji
  if (message.status === 'streaming') return null
  return (
    <div
      ref={ref}
      className={cn(
        'relative flex items-center gap-0.5 rounded-full border bg-card px-1 py-0.5 shadow-sm transition-opacity',
        open ? 'opacity-100' : 'opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100'
      )}
      data-testid="reaction-bar"
    >
      {QUICK_REACTIONS.map((e) => (
        <button
          key={e}
          type="button"
          aria-label={t('expressive.react', { emoji: e })}
          aria-pressed={mine === e}
          className={cn(
            'rounded-full px-1 text-base hover:scale-125',
            mine === e && 'bg-primary/15'
          )}
          onClick={() => void react(message, e)}
        >
          {e}
        </button>
      ))}
      <button
        type="button"
        aria-label={t('expressive.moreReactions')}
        className="rounded-full p-1 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        <SmilePlus className="size-4" />
      </button>
      {open && (
        <div
          className={cn(
            'absolute bottom-9 z-30 h-80 w-72 rounded-xl border bg-card p-2 shadow-lg',
            align === 'end' ? 'right-0' : 'left-0'
          )}
        >
          <EmojiPanel
            onPick={(e) => {
              setOpen(false)
              void react(message, e)
            }}
          />
        </div>
      )}
    </div>
  )
}
