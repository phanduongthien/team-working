import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import {
  loadEmojis,
  pushRecentEmoji,
  recentEmojis,
  searchEmojis,
  type EmojiEntry
} from './emojiData'

const GROUPS = [0, 1, 3, 4, 5, 6, 7, 8, 9]
const GROUP_ICON: Record<number, string> = {
  0: '😀',
  1: '👋',
  3: '🐱',
  4: '🍜',
  5: '✈️',
  6: '⚽',
  7: '💡',
  8: '❤️',
  9: '🏳️'
}

/** Bộ chọn emoji: tìm kiếm (tiếng Việt/Anh, không dấu cũng được), "dùng gần đây", theo nhóm. */
export function EmojiPanel({ onPick }: { onPick(emoji: string): void }) {
  const { t, i18n } = useTranslation('chat')
  const [all, setAll] = useState<EmojiEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState(0)
  const [recent, setRecent] = useState(recentEmojis)

  useEffect(() => {
    let alive = true
    void loadEmojis(i18n.language).then((list) => alive && setAll(list))
    return () => {
      alive = false
    }
  }, [i18n.language])

  const shown = useMemo(() => {
    if (!all) return []
    return query.trim() ? searchEmojis(all, query) : all.filter((e) => e.group === group)
  }, [all, query, group])

  const pick = (emoji: string): void => {
    pushRecentEmoji(emoji)
    setRecent(recentEmojis())
    onPick(emoji)
  }

  const cell = (unicode: string, label?: string) => (
    <button
      key={unicode}
      type="button"
      title={label}
      aria-label={label ?? unicode}
      className="flex size-8 items-center justify-center rounded text-xl hover:bg-muted"
      onClick={() => pick(unicode)}
    >
      {unicode}
    </button>
  )

  return (
    <div className="flex h-full flex-col gap-2" data-testid="emoji-panel">
      <Input
        autoFocus
        aria-label={t('expressive.emojiSearch')}
        placeholder={t('expressive.emojiSearch')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="h-8"
      />
      {!query && recent.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-muted-foreground">
            {t('expressive.recent')}
          </div>
          <div className="flex flex-wrap" data-testid="emoji-recent">
            {recent.map((e) => cell(e))}
          </div>
        </div>
      )}
      {!query && (
        <div className="flex gap-0.5 border-b pb-1">
          {GROUPS.map((g) => (
            <button
              key={g}
              type="button"
              title={t(`expressive.groups.${g}`)}
              aria-label={t(`expressive.groups.${g}`)}
              className={cn(
                'rounded px-1.5 py-0.5 text-base',
                group === g ? 'bg-muted' : 'opacity-60 hover:opacity-100'
              )}
              onClick={() => setGroup(g)}
            >
              {GROUP_ICON[g]}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!all ? (
          <div className="p-2 text-xs text-muted-foreground">{t('expressive.loading')}</div>
        ) : shown.length === 0 ? (
          <div className="p-2 text-xs text-muted-foreground">{t('expressive.noResults')}</div>
        ) : (
          <div className="flex flex-wrap" data-testid="emoji-results">
            {shown.map((e) => cell(e.unicode, e.label))}
          </div>
        )}
      </div>
    </div>
  )
}
