import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MEMORY_CATEGORIES, type MemoryCategory } from '@shared/schemas'
import type { MemorySuggestion } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Select, Textarea } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { useMemory } from '../store'

const ACTION_STYLE: Record<MemorySuggestion['action'], string> = {
  add: 'bg-green-500/15 text-green-700 dark:text-green-400',
  update: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  delete: 'bg-destructive/15 text-destructive'
}

function SuggestionItem({ suggestion }: { suggestion: MemorySuggestion }) {
  const { t } = useTranslation('memory')
  const resolve = useMemory((s) => s.resolve)
  const [content, setContent] = useState(suggestion.content)
  const [category, setCategory] = useState<MemoryCategory>(suggestion.category)
  const editable = suggestion.action !== 'delete'

  return (
    <li className="space-y-2 rounded-md border p-3" data-testid="memory-suggestion">
      <div className="flex items-center gap-2 text-xs">
        <span className={cn('rounded px-1.5 py-0.5 font-medium', ACTION_STYLE[suggestion.action])}>
          {t(`suggestions.${suggestion.action}`)}
        </span>
        {suggestion.targetContent && suggestion.action === 'update' && (
          <span className="truncate text-muted-foreground">
            {t('suggestions.current', { content: suggestion.targetContent })}
          </span>
        )}
      </div>
      {editable ? (
        <div className="flex gap-2">
          <Textarea
            aria-label={t(`suggestions.${suggestion.action}`)}
            rows={2}
            maxLength={500}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <Select
            aria-label={t('categories.other')}
            className="w-40"
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
        <p className="text-sm line-through decoration-destructive/60">{suggestion.content}</p>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={() => void resolve(suggestion.id, false)}>
          <X />
          {t('suggestions.reject')}
        </Button>
        <Button
          size="sm"
          disabled={editable && !content.trim()}
          onClick={() =>
            void resolve(suggestion.id, true, editable ? { content: content.trim(), category } : {})
          }
        >
          <Check />
          {t('suggestions.accept')}
        </Button>
      </div>
    </li>
  )
}

export function SuggestionList() {
  const { t } = useTranslation('memory')
  const suggestions = useMemory((s) => s.suggestions)
  const resolve = useMemory((s) => s.resolve)

  if (suggestions.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('suggestions.empty')}</p>
  }
  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {suggestions.map((s) => (
          <SuggestionItem key={s.id} suggestion={s} />
        ))}
      </ul>
      {suggestions.length > 1 && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              for (const s of suggestions) await resolve(s.id, true)
            }}
          >
            <Check />
            {t('suggestions.acceptAll')}
          </Button>
        </div>
      )}
    </div>
  )
}
