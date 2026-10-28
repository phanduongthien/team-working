import { Check, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MEMORY_CATEGORIES, type MemoryCategory } from '@shared/schemas'
import type { Memory } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Input, Select } from '@renderer/components/ui/input'
import { useMemory } from '../store'

function CategorySelect({ value, onChange }: { value: MemoryCategory; onChange(v: MemoryCategory): void }) {
  const { t } = useTranslation('memory')
  return (
    <Select
      aria-label={t(`categories.${value}`)}
      className="w-40 shrink-0"
      value={value}
      onChange={(e) => onChange(e.target.value as MemoryCategory)}
    >
      {MEMORY_CATEGORIES.map((c) => (
        <option key={c} value={c}>
          {t(`categories.${c}`)}
        </option>
      ))}
    </Select>
  )
}

function MemoryRow({ memory }: { memory: Memory }) {
  const { t, i18n } = useTranslation('memory')
  const { update, remove } = useMemory()
  const [editing, setEditing] = useState(false)
  const [content, setContent] = useState(memory.content)
  const [category, setCategory] = useState(memory.category)

  if (editing) {
    return (
      <li className="flex items-center gap-2 py-2">
        <Input value={content} maxLength={500} onChange={(e) => setContent(e.target.value)} autoFocus />
        <CategorySelect value={category} onChange={setCategory} />
        <Button
          size="icon-sm"
          title={t('common:actions.save')}
          disabled={!content.trim()}
          onClick={async () => {
            await update(memory.id, content.trim(), category)
            setEditing(false)
          }}
        >
          <Check />
        </Button>
        <Button size="icon-sm" variant="ghost" title={t('common:actions.cancel')} onClick={() => setEditing(false)}>
          <X />
        </Button>
      </li>
    )
  }

  return (
    <li className="group flex items-start gap-3 py-2" data-testid="memory-item">
      <span className="mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        {t(`categories.${memory.category}`)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">{memory.content}</p>
        {memory.lastUsedAt && (
          <p className="text-xs text-muted-foreground">
            {t('list.lastUsed', { date: new Date(memory.lastUsedAt).toLocaleDateString(i18n.language) })}
          </p>
        )}
      </div>
      <div className="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        <Button size="icon-sm" variant="ghost" title={t('list.edit')} onClick={() => setEditing(true)}>
          <Pencil />
        </Button>
        <Button size="icon-sm" variant="ghost" title={t('common:actions.delete')} onClick={() => void remove(memory.id)}>
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}

export function MemoryList() {
  const { t } = useTranslation('memory')
  const { memories, query, setQuery, create } = useMemory()
  const [search, setSearch] = useState(query)
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<MemoryCategory>('other')

  useEffect(() => {
    const timer = setTimeout(() => void setQuery(search), 200)
    return () => clearTimeout(timer)
  }, [search, setQuery])

  const onAdd = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!content.trim()) return
    await create(content.trim(), category)
    setContent('')
  }

  return (
    <div className="space-y-3">
      <form className="flex gap-2" onSubmit={onAdd}>
        <Input
          placeholder={t('list.addPlaceholder')}
          aria-label={t('list.addPlaceholder')}
          value={content}
          maxLength={500}
          onChange={(e) => setContent(e.target.value)}
        />
        <CategorySelect value={category} onChange={setCategory} />
        <Button type="submit" disabled={!content.trim()}>
          <Plus />
          {t('list.add')}
        </Button>
      </form>
      <div className="relative">
        <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={t('list.search')}
          aria-label={t('list.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {memories.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('list.empty')}</p>
      ) : (
        <ul className="divide-y">
          {memories.map((m) => (
            <MemoryRow key={m.id} memory={m} />
          ))}
        </ul>
      )}
    </div>
  )
}
