import { Pencil, Pin, PinOff, Plus, Search, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { Conversation } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { useChat } from '../store'

export function ConversationSidebar() {
  const { t } = useTranslation('chat')
  const { conversations, activeId, query, streaming, setQuery, select, togglePin, rename, remove } = useChat()
  const [search, setSearch] = useState(query)
  const [renaming, setRenaming] = useState<Conversation | null>(null)
  const [deleting, setDeleting] = useState<Conversation | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => void setQuery(search), 200)
    return () => clearTimeout(timer)
  }, [search, setQuery])

  const pinned = conversations.filter((c) => c.pinned)
  const recent = conversations.filter((c) => !c.pinned)

  const renderItem = (c: Conversation) => (
    <li key={c.id}>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md pr-1 text-sm hover:bg-muted',
          c.id === activeId && 'bg-muted font-medium'
        )}
      >
        <button
          className="min-w-0 flex-1 truncate px-2.5 py-2 text-left"
          onClick={() => void select(c.id)}
          title={c.title || t('untitled')}
        >
          {streaming[c.id] && <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-primary align-middle" />}
          {c.title || t('untitled')}
        </button>
        <div className="hidden shrink-0 group-hover:flex">
          <Button variant="ghost" size="icon-sm" title={c.pinned ? t('unpin') : t('pin')} onClick={() => void togglePin(c.id)}>
            {c.pinned ? <PinOff /> : <Pin />}
          </Button>
          <Button variant="ghost" size="icon-sm" title={t('common:actions.rename')} onClick={() => setRenaming(c)}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" title={t('common:actions.delete')} onClick={() => setDeleting(c)}>
            <Trash2 />
          </Button>
        </div>
      </div>
    </li>
  )

  const onRename = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim()
    if (renaming && title) void rename(renaming.id, title)
    setRenaming(null)
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="space-y-2 p-3">
        <Button className="w-full justify-start" variant="outline" onClick={() => void select(null)}>
          <Plus />
          {t('newChat')}
        </Button>
        <div className="relative">
          <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder={t('search')}
            aria-label={t('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {conversations.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {query ? t('noResults') : t('noConversations')}
          </p>
        )}
        {pinned.length > 0 && (
          <>
            <h3 className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">{t('pinned')}</h3>
            <ul>{pinned.map(renderItem)}</ul>
          </>
        )}
        {recent.length > 0 && (
          <>
            {pinned.length > 0 && <h3 className="px-2.5 pt-3 pb-1 text-xs font-medium text-muted-foreground">{t('recent')}</h3>}
            <ul>{recent.map(renderItem)}</ul>
          </>
        )}
      </nav>

      <Dialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent title={t('renameTitle')}>
          <form onSubmit={onRename} className="space-y-4">
            <Input name="title" defaultValue={renaming?.title} maxLength={120} autoFocus />
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">{t('common:actions.cancel')}</Button>
              </DialogClose>
              <Button type="submit">{t('common:actions.save')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent
          title={t('deleteTitle')}
          description={t('deleteDescription', { title: deleting?.title || t('untitled') })}
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) void remove(deleting.id)
                setDeleting(null)
              }}
            >
              {t('common:actions.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
