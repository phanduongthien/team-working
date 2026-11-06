import { Check, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MEMORY_CATEGORIES, type MemoryCategory } from '@shared/schemas'
import type { MemorySuggestion } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Select, Textarea } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { useMemory } from '../store'

/** Số đề xuất hiện sẵn; còn lại nằm sau "Xem thêm". */
export const SUGGESTIONS_SHOWN = 5

const ACTION_STYLE: Record<MemorySuggestion['action'], string> = {
  add: 'bg-green-500/15 text-green-700 dark:text-green-400',
  update: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  delete: 'bg-destructive/15 text-destructive'
}

/** Ô sửa đầy đủ khi mở một đề xuất. Ô chữ tự giãn theo nội dung (không có thanh cuộn nhỏ bên trong). */
function SuggestionEditor({ suggestion, onClose }: { suggestion: MemorySuggestion; onClose(): void }) {
  const { t } = useTranslation('memory')
  const resolve = useMemory((s) => s.resolve)
  const [content, setContent] = useState(suggestion.content)
  const [category, setCategory] = useState<MemoryCategory>(suggestion.category)
  const editable = suggestion.action !== 'delete'

  return (
    <div className="space-y-2 border-t px-3 pt-2 pb-3" data-testid="suggestion-editor">
      {suggestion.targetContent && suggestion.action === 'update' && (
        <p className="text-xs text-muted-foreground">
          {t('suggestions.current', { content: suggestion.targetContent })}
        </p>
      )}
      {editable ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <Textarea
            autoFocus
            aria-label={t(`suggestions.${suggestion.action}`)}
            rows={1}
            maxLength={500}
            className="min-h-9 overflow-hidden [field-sizing:content]"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Select
            aria-label={t('suggestions.category')}
            className="sm:w-40"
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory)}
          >
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`categories.${c}`)}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <p className="text-sm whitespace-pre-wrap line-through decoration-destructive/60">{suggestion.content}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onClose}>
          {t('suggestions.collapse')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void resolve(suggestion.id, false)}>
          <X />
          {t('suggestions.reject')}
        </Button>
        <Button
          size="sm"
          disabled={editable && !content.trim()}
          onClick={() => void resolve(suggestion.id, true, editable ? { content: content.trim(), category } : {})}
        >
          <Check />
          {t('suggestions.accept')}
        </Button>
      </div>
    </div>
  )
}

/** Một dòng gọn: ô chọn, nội dung một dòng (cắt …), nhãn loại, ✓ / ✕. Bấm vào dòng → mở ô sửa. */
function SuggestionRow({
  suggestion,
  selected,
  onSelect,
  open,
  onToggle
}: {
  suggestion: MemorySuggestion
  selected: boolean
  onSelect(value: boolean): void
  open: boolean
  onToggle(): void
}) {
  const { t } = useTranslation('memory')
  const resolve = useMemory((s) => s.resolve)
  return (
    <li className={cn('rounded-md border', open && 'bg-muted/30')} data-testid="memory-suggestion">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <input
          type="checkbox"
          className="size-4 shrink-0 accent-primary"
          aria-label={t('suggestions.select', { content: suggestion.content })}
          checked={selected}
          onChange={(e) => onSelect(e.target.checked)}
        />
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
          aria-expanded={open}
          onClick={onToggle}
          data-testid="suggestion-row"
        >
          {suggestion.action !== 'add' && (
            <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium', ACTION_STYLE[suggestion.action])}>
              {t(`suggestions.${suggestion.action}`)}
            </span>
          )}
          <span
            className={cn('min-w-0 flex-1 truncate', suggestion.action === 'delete' && 'line-through')}
            title={suggestion.content}
            data-testid="suggestion-content"
          >
            {suggestion.content}
          </span>
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {t(`categories.${suggestion.category}`)}
          </span>
        </button>
        <Button
          size="icon-sm"
          variant="ghost"
          title={t('suggestions.accept')}
          aria-label={t('suggestions.accept')}
          onClick={() => void resolve(suggestion.id, true)}
          data-testid="memory-suggestion-accept"
        >
          <Check />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          title={t('suggestions.reject')}
          aria-label={t('suggestions.reject')}
          onClick={() => void resolve(suggestion.id, false)}
          data-testid="memory-suggestion-reject"
        >
          <X />
        </Button>
      </div>
      {open && <SuggestionEditor suggestion={suggestion} onClose={onToggle} />}
    </li>
  )
}

/** "Đồng ý tất cả": dữ liệu cá nhân → bấm lần đầu chỉ hỏi lại, lần hai (trong 4 giây) mới duyệt. */
function AcceptAllButton({ count, onConfirm }: { count: number; onConfirm(): void }) {
  const { t } = useTranslation('memory')
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const timer = setTimeout(() => setArmed(false), 4000)
    return () => clearTimeout(timer)
  }, [armed])
  return (
    <Button
      variant={armed ? 'default' : 'outline'}
      size="sm"
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        onConfirm()
      }}
      data-testid="suggestions-accept-all"
    >
      <Check />
      {armed ? t('suggestions.acceptAllConfirm', { count }) : t('suggestions.acceptAll')}
    </Button>
  )
}

export function SuggestionList() {
  const { t } = useTranslation('memory')
  const suggestions = useMemory((s) => s.suggestions)
  const resolveMany = useMemory((s) => s.resolveMany)
  const [filter, setFilter] = useState<MemoryCategory | 'all'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [openId, setOpenId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const categories = useMemo(
    () => MEMORY_CATEGORIES.filter((c) => suggestions.some((s) => s.category === c)),
    [suggestions]
  )
  // Loại đang lọc không còn đề xuất nào → về "Tất cả".
  const activeFilter = filter !== 'all' && categories.includes(filter) ? filter : 'all'
  const filtered = activeFilter === 'all' ? suggestions : suggestions.filter((s) => s.category === activeFilter)
  const visible = showAll ? filtered : filtered.slice(0, SUGGESTIONS_SHOWN)
  // Chỉ tính những đề xuất còn chờ và đang hiện theo bộ lọc.
  const chosen = filtered.filter((s) => selected.has(s.id)).map((s) => s.id)
  const allChosen = filtered.length > 0 && chosen.length === filtered.length

  const select = (id: string, value: boolean): void =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (value) next.add(id)
      else next.delete(id)
      return next
    })
  const bulk = (ids: string[], accept: boolean): void => {
    setSelected(new Set())
    void resolveMany(ids, accept)
  }

  if (suggestions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('suggestions.empty')}</p>
  }
  return (
    <div className="space-y-3" data-testid="suggestion-list">
      {categories.length > 1 && (
        <div className="flex flex-wrap gap-1 text-xs" role="tablist" aria-label={t('suggestions.filter')}>
          {(['all', ...categories] as const).map((c) => {
            const n = c === 'all' ? suggestions.length : suggestions.filter((s) => s.category === c).length
            return (
              <button
                key={c}
                type="button"
                role="tab"
                aria-selected={activeFilter === c}
                className={cn(
                  'rounded-full border px-2.5 py-0.5',
                  activeFilter === c ? 'border-primary bg-primary/10 font-medium' : 'text-muted-foreground hover:bg-muted'
                )}
                onClick={() => {
                  setFilter(c)
                  setShowAll(false)
                }}
              >
                {c === 'all' ? t('suggestions.all') : t(`categories.${c}`)} ({n})
              </button>
            )
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2 px-2">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            checked={allChosen}
            onChange={(e) => setSelected(e.target.checked ? new Set(filtered.map((s) => s.id)) : new Set())}
            data-testid="suggestions-select-all"
          />
          {t('suggestions.selectAll')}
        </label>
        {chosen.length > 0 && (
          <>
            <Button size="sm" onClick={() => bulk(chosen, true)} data-testid="suggestions-accept-selected">
              <Check />
              {t('suggestions.acceptSelected', { count: chosen.length })}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => bulk(chosen, false)} data-testid="suggestions-reject-selected">
              <X />
              {t('suggestions.rejectSelected', { count: chosen.length })}
            </Button>
          </>
        )}
        {filtered.length > 1 && (
          <div className="ml-auto">
            <AcceptAllButton count={filtered.length} onConfirm={() => bulk(filtered.map((s) => s.id), true)} />
          </div>
        )}
      </div>
      <ul className="space-y-1.5">
        {visible.map((s) => (
          <SuggestionRow
            key={s.id}
            suggestion={s}
            selected={selected.has(s.id)}
            onSelect={(v) => select(s.id, v)}
            open={openId === s.id}
            onToggle={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
          />
        ))}
      </ul>
      {filtered.length > visible.length && (
        <button
          type="button"
          className="w-full rounded-md py-1.5 text-sm text-primary hover:bg-muted"
          onClick={() => setShowAll(true)}
          data-testid="suggestions-show-more"
        >
          {t('suggestions.showMore', { count: filtered.length - visible.length })}
        </button>
      )}
    </div>
  )
}
