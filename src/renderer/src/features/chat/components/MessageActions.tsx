import { CornerUpLeft, EllipsisVertical, Pencil, Pin, PinOff, Undo2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { usePreferences } from '@renderer/stores/preferences'
import { useChat } from '../store'
import { excerptOf, scrollToMessage } from '../messageText'

/** Ai là người viết tin (cho khối trích dẫn). */
function useAuthor(message: Message): string {
  const { t } = useTranslation('chat')
  const name = usePreferences((s) => s.assistant.name)
  return message.role === 'user' ? t('you') : name
}

/** Khối "trả lời tin…" phía trên nội dung tin. Tin gốc không còn (đã sửa & gửi lại) → báo rõ. */
export function ReplyQuote({ message, align }: { message: Message; align: 'start' | 'end' }) {
  const { t } = useTranslation('chat')
  const quoted = useChat((s) => (message.replyToId ? s.messages[message.conversationId]?.find((m) => m.id === message.replyToId) : undefined))
  const author = useAuthor(quoted ?? message)
  if (!message.replyToId) return null
  return (
    <button
      type="button"
      disabled={!quoted}
      onClick={() => quoted && scrollToMessage(quoted.id)}
      className={cn(
        'flex max-w-[80%] flex-col gap-0.5 rounded-lg border-l-2 border-primary/50 bg-muted/60 px-2.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted disabled:cursor-default',
        align === 'end' ? 'self-end' : 'self-start'
      )}
      data-testid="reply-quote"
    >
      <span className="flex items-center gap-1 font-medium">
        <CornerUpLeft className="size-3" />
        {quoted ? t('messages.replyingTo', { name: author }) : t('messages.quoteGone')}
      </span>
      {quoted && <span className="line-clamp-2">{excerptOf(quoted, t)}</span>}
    </button>
  )
}

/** Chiều cao tối đa của menu (4 mục) — để chọn mở lên hay xuống. */
const MENU_HEIGHT = 180

/** Menu ⋮ trên mỗi tin: Trả lời, Ghim / Bỏ ghim, Sửa & gửi lại (tin chữ của bạn), Thu hồi (tin của bạn). */
export function MessageMenu({ message, onEdit }: { message: Message; onEdit?: () => void }) {
  const { t } = useTranslation('chat')
  const [open, setOpen] = useState(false)
  const [confirmRecall, setConfirmRecall] = useState(false)
  // Mở lên trên; gần mép trên khung chat (tin đầu tiên) thì mở xuống để không bị thanh tiêu đề che.
  const [dropUp, setDropUp] = useState(true)
  const ref = useRef<HTMLDivElement>(null)
  const { setReplyTo, pin, recall } = useChat()
  const busy = useChat((s) => !!s.streaming[message.conversationId])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (message.status === 'streaming' || message.recalledAt) return null
  const mine = message.role === 'user'
  const canEdit = mine && !!onEdit && !message.attachments.length && !message.media && !message.voice
  const close = (): void => {
    setOpen(false)
    setConfirmRecall(false)
  }
  const item = 'flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50'

  return (
    <div ref={ref} className="relative">
      <Button
        variant="ghost"
        size="icon-sm"
        className={cn('opacity-0 group-hover/msg:opacity-100 focus-visible:opacity-100', open && 'opacity-100')}
        title={t('messages.more')}
        aria-label={t('messages.more')}
        aria-expanded={open}
        onClick={(e) => {
          if (open) return close()
          const scroller = ref.current?.closest('.overflow-y-auto')
          const top = scroller ? scroller.getBoundingClientRect().top : 0
          setDropUp(e.currentTarget.getBoundingClientRect().top - top > MENU_HEIGHT)
          setOpen(true)
        }}
        data-testid="message-menu"
      >
        <EllipsisVertical />
      </Button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-30 w-44 rounded-lg border bg-card p-1 text-foreground shadow-lg',
            dropUp ? 'bottom-full mb-1' : 'top-full mt-1',
            mine ? 'right-0' : 'left-0'
          )}
        >
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setReplyTo(message.conversationId, message)
              close()
              requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('[data-testid="composer"] textarea')?.focus())
            }}
          >
            <CornerUpLeft className="size-4" />
            {t('messages.reply')}
          </button>
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              void pin(message, !message.pinnedAt)
              close()
            }}
          >
            {message.pinnedAt ? <PinOff className="size-4" /> : <Pin className="size-4" />}
            {message.pinnedAt ? t('messages.unpin') : t('messages.pin')}
          </button>
          {canEdit && (
            <button
              role="menuitem"
              className={item}
              disabled={busy}
              onClick={() => {
                onEdit?.()
                close()
              }}
            >
              <Pencil className="size-4" />
              {t('messages.edit')}
            </button>
          )}
          {mine && (
            <button
              role="menuitem"
              className={cn(item, confirmRecall && 'text-destructive')}
              disabled={busy}
              // Thu hồi không hoàn tác được → bấm hai lần.
              onClick={() => {
                if (!confirmRecall) return setConfirmRecall(true)
                void recall(message)
                close()
              }}
              data-testid="message-recall"
            >
              <Undo2 className="size-4" />
              {confirmRecall ? t('messages.recallConfirm') : t('messages.recall')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** Sửa tin ngay trong bong bóng: Gửi = sửa & gửi lại (bỏ các tin phía sau). */
export function EditBox({ message, onClose }: { message: Message; onClose(): void }) {
  const { t } = useTranslation('chat')
  const [text, setText] = useState(message.content)
  const [saving, setSaving] = useState(false)
  const editResend = useChat((s) => s.editResend)
  const submit = async (): Promise<void> => {
    if (!text.trim() || saving) return
    setSaving(true)
    if (await editResend(message, text)) onClose()
    else setSaving(false)
  }
  return (
    <div className="w-full max-w-[80%] space-y-1.5 rounded-2xl border bg-card p-2" data-testid="message-edit">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void submit()
          } else if (e.key === 'Escape') onClose()
        }}
        className="block w-full resize-none bg-transparent px-2 py-1 text-sm outline-none [field-sizing:content]"
      />
      <p className="px-2 text-xs text-muted-foreground">{t('messages.editHint')}</p>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose} disabled={saving}>
          {t('common:actions.cancel')}
        </Button>
        <Button size="sm" onClick={() => void submit()} disabled={saving || !text.trim()}>
          {t('messages.editSend')}
        </Button>
      </div>
    </div>
  )
}

/** Thanh "Tin đã ghim" ở đầu cuộc trò chuyện. */
export function PinnedBar({ messages }: { messages: Message[] }) {
  const { t } = useTranslation('chat')
  const pin = useChat((s) => s.pin)
  const pinned = messages.filter((m) => m.pinnedAt).sort((a, b) => (b.pinnedAt ?? 0) - (a.pinnedAt ?? 0))
  const [expanded, setExpanded] = useState(false)
  if (pinned.length === 0) return null
  const shown = expanded ? pinned : pinned.slice(0, 1)
  return (
    <div className="border-b bg-muted/30 px-6 py-1.5" data-testid="pinned-bar">
      <div className="mx-auto max-w-3xl space-y-1">
        {shown.map((m) => (
          <div key={m.id} className="flex items-center gap-2 text-xs" data-testid="pinned-item">
            <Pin className="size-3.5 shrink-0 text-primary" />
            <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={() => scrollToMessage(m.id)}>
              {excerptOf(m, t, 160)}
            </button>
            <Button variant="ghost" size="icon-sm" title={t('messages.unpin')} aria-label={t('messages.unpin')} onClick={() => void pin(m, false)}>
              <X />
            </Button>
          </div>
        ))}
        {pinned.length > 1 && (
          <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setExpanded((v) => !v)}>
            {expanded ? t('messages.pinnedLess') : t('messages.pinnedMore', { count: pinned.length - 1 })}
          </button>
        )}
      </div>
    </div>
  )
}

/** Trên ô nhập: đang trả lời tin nào (bấm X để bỏ). */
export function ReplyPreview({ conversationId }: { conversationId: string | null }) {
  const { t } = useTranslation('chat')
  const target = useChat((s) => (conversationId ? s.replyTo[conversationId] : undefined))
  const setReplyTo = useChat((s) => s.setReplyTo)
  const author = useAuthor(target ?? ({ role: 'user' } as Message))
  if (!conversationId || !target) return null
  return (
    <div className="flex items-start gap-2 rounded-lg border-l-2 border-primary bg-muted/60 px-3 py-1.5 text-xs" data-testid="reply-preview">
      <CornerUpLeft className="mt-0.5 size-3.5 shrink-0" />
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => scrollToMessage(target.id)}>
        <span className="font-medium">{t('messages.replyingTo', { name: author })}</span>
        <span className="block truncate text-muted-foreground">{excerptOf(target, t)}</span>
      </button>
      <Button variant="ghost" size="icon-sm" aria-label={t('messages.cancelReply')} onClick={() => setReplyTo(conversationId, null)}>
        <X />
      </Button>
    </div>
  )
}
