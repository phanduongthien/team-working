import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { ClearRecentButton } from './ClearRecentButton'
import { loadEmojis, searchEmojis, type EmojiEntry } from './emojiData'
import { useRecent } from './recentStore'

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
type Tab = 'recent' | number

/**
 * Bộ chọn emoji: tìm kiếm (tiếng Việt/Anh, không dấu cũng được), tab 🕘 Gần đây (như bàn phím điện thoại), theo nhóm.
 * Không tự ghi "gần đây" — nơi dùng emoji (ô chat, thả cảm xúc) tự ghi, để không tính trùng.
 */
export function EmojiPanel({ onPick }: { onPick(emoji: string): void }) {
  const { t, i18n } = useTranslation('chat')
  const [all, setAll] = useState<EmojiEntry[] | null>(null)
  const [query, setQuery] = useState('')
  const recent = useRecent((s) => s.data?.emoji ?? null)
  // Tab lúc mở: có emoji gần đây → Gần đây, chưa có → mặt cười. Chỉ chọn MỘT lần lúc mở (chọn emoji đầu tiên
  // không làm tab nhảy). Dữ liệu thường đã nạp sẵn lúc mở app; chưa có thì chọn khi vừa nạp xong.
  const defaultTab = (list: string[]): Tab => (list.length > 0 ? 'recent' : 0)
  const [chosen, setChosen] = useState<Tab | null>(() => {
    const list = useRecent.getState().data?.emoji
    return list ? defaultTab(list) : null
  })
  // Mở bộ chọn trước khi dữ liệu kịp nạp: chọn ngay khi có (điều chỉnh state trong lúc render, không qua effect).
  if (chosen === null && recent !== null) setChosen(defaultTab(recent))
  const tab: Tab = chosen ?? 0

  useEffect(() => {
    let alive = true
    void loadEmojis(i18n.language).then((list) => alive && setAll(list))
    return () => {
      alive = false
    }
  }, [i18n.language])

  const labels = useMemo(() => new Map(all?.map((e) => [e.unicode, e.label])), [all])
  const shown = useMemo(() => {
    if (!all) return []
    if (query.trim()) return searchEmojis(all, query)
    return tab === 'recent' ? [] : all.filter((e) => e.group === tab)
  }, [all, query, tab])

  const cell = (unicode: string, label?: string) => (
    <button
      key={unicode}
      type="button"
      title={label}
      aria-label={label ?? unicode}
      className="flex size-8 items-center justify-center rounded text-xl hover:bg-muted"
      onClick={() => onPick(unicode)}
    >
      {unicode}
    </button>
  )

  const tabButton = (k: Tab, icon: string, label: string) => (
    <button
      key={k}
      type="button"
      role="tab"
      title={label}
      aria-label={label}
      aria-selected={tab === k}
      className={cn('min-w-0 flex-1 rounded py-0.5 text-base', tab === k ? 'bg-muted' : 'opacity-60 hover:opacity-100')}
      onClick={() => setChosen(k)}
      data-testid={k === 'recent' ? 'emoji-tab-recent' : undefined}
    >
      {icon}
    </button>
  )

  const body = (): React.ReactNode => {
    if (!query.trim() && tab === 'recent') {
      if (!recent || recent.length === 0)
        return <div className="p-2 text-xs text-muted-foreground">{t('expressive.noRecent')}</div>
      return (
        <>
          <div className="flex flex-wrap" data-testid="emoji-recent">
            {recent.map((e) => cell(e, labels.get(e)))}
          </div>
          <div className="mt-1 flex justify-end">
            <ClearRecentButton kind="emoji" />
          </div>
        </>
      )
    }
    if (!all) return <div className="p-2 text-xs text-muted-foreground">{t('expressive.loading')}</div>
    if (shown.length === 0) return <div className="p-2 text-xs text-muted-foreground">{t('expressive.noResults')}</div>
    return (
      <div className="flex flex-wrap" data-testid="emoji-results">
        {shown.map((e) => cell(e.unicode, e.label))}
      </div>
    )
  }

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
      {!query && (
        <div className="flex gap-0.5 border-b pb-1" role="tablist" aria-label={t('expressive.emojiGroups')}>
          {tabButton('recent', '🕘', t('expressive.recentTab'))}
          {GROUPS.map((g) => tabButton(g, GROUP_ICON[g], t(`expressive.groups.${g}`)))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">{body()}</div>
    </div>
  )
}
