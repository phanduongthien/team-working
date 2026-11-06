import {
  ChevronDown,
  ChevronRight,
  FolderInput,
  FolderPlus,
  GitBranch,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Sparkles,
  Trash2
} from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { Conversation, ConversationGroup } from '@shared/types'
import { GROUP_NAME_MAX } from '@shared/schemas'
import { snippetParts } from '@shared/search'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'
import { buildSidebar, DRAG_TYPE, type SidebarRow, type SidebarSection } from '../sidebarTree'
import { useChat } from '../store'

/** Dòng trích đoạn dưới tiêu đề: vì sao cuộc này khớp (chữ khớp tô đậm). */
function SearchSnippet({ snippet }: { snippet: string }) {
  const { t } = useTranslation('chat')
  return (
    <span
      className="mt-0.5 line-clamp-2 w-full text-xs font-normal text-muted-foreground"
      data-testid="search-snippet"
    >
      <span className="sr-only">{t('organize.matchedIn')}: </span>
      {snippetParts(snippet).map((p, i) =>
        p.hit ? (
          <strong key={i} className="font-semibold text-foreground">
            {p.text}
          </strong>
        ) : (
          <span key={i}>{p.text}</span>
        )
      )}
    </span>
  )
}

type Drop = { kind: 'pinned' } | { kind: 'group'; groupId: string } | { kind: 'recent' }
const dropKey = (d: Drop): string => (d.kind === 'group' ? `group:${d.groupId}` : d.kind)
const hasConversation = (e: DragEvent): boolean => e.dataTransfer.types.includes(DRAG_TYPE)

export function ConversationSidebar() {
  const { t } = useTranslation('chat')
  const {
    conversations,
    groups,
    activeId,
    query,
    streaming,
    setQuery,
    select,
    togglePin,
    rename,
    remove,
    moveTo,
    createGroup,
    renameGroup,
    toggleGroup,
    removeGroup
  } = useChat()
  const [search, setSearch] = useState(query)
  const [renaming, setRenaming] = useState<Conversation | null>(null)
  const [deleting, setDeleting] = useState<Conversation | null>(null)
  const [moving, setMoving] = useState<Conversation | null>(null)
  /** Hộp tên nhóm: tạo mới (group = null) hoặc đổi tên. */
  const [groupDialog, setGroupDialog] = useState<{ group: ConversationGroup | null; error: string | null } | null>(null)
  const [deletingGroup, setDeletingGroup] = useState<ConversationGroup | null>(null)
  const [over, setOver] = useState<string | null>(null)

  const searching = !!query.trim()
  // Thu gọn trong lúc tìm: chỉ tạm thời (không lưu); bắt đầu tìm → nhóm có kết quả mở hết; xoá ô tìm →
  // về đúng trạng thái thu gọn / mở đã lưu trước khi tìm.
  const [searchCollapsed, setSearchCollapsed] = useState<Record<string, boolean>>({})

  useEffect(() => {
    const timer = setTimeout(() => {
      // Bắt đầu / kết thúc một lượt tìm → bỏ các lần thu gọn tạm của lượt trước.
      if (!!search.trim() !== searching) setSearchCollapsed({})
      void setQuery(search)
    }, 200)
    return () => clearTimeout(timer)
  }, [search, searching, setQuery])
  const sections = useMemo(
    () => buildSidebar(conversations, groups, searching, searchCollapsed),
    [conversations, groups, searching, searchCollapsed]
  )
  const onToggleGroup = (id: string, collapsed: boolean): void => {
    if (searching) setSearchCollapsed((s) => ({ ...s, [id]: !collapsed }))
    else void toggleGroup(id)
  }
  const groupName = (id: string | null): string | undefined => groups.find((g) => g.id === id)?.name

  // ---- Kéo thả ----
  const dropProps = (target: Drop) => ({
    onDragOver: (e: DragEvent) => {
      if (!hasConversation(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (over !== dropKey(target)) setOver(dropKey(target))
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null)
    },
    onDrop: (e: DragEvent) => {
      if (!hasConversation(e)) return
      e.preventDefault()
      setOver(null)
      const id = e.dataTransfer.getData(DRAG_TYPE)
      const conv = conversations.find((c) => c.id === id)
      if (!conv) return
      // Thả vào Đã ghim → ghim (giữ nhóm); vào nhóm / chưa xếp nhóm → chuyển + bỏ ghim để thấy ngay ở đó.
      if (target.kind === 'pinned') {
        if (!conv.pinned) void togglePin(id)
      } else void moveTo(id, { groupId: target.kind === 'group' ? target.groupId : null, pinned: false })
    },
    'data-drop-over': over === dropKey(target) ? 'true' : undefined
  })

  const renderRow = ({ conversation: c, depth }: SidebarRow) => (
    <li key={c.id} style={{ paddingLeft: depth * 12 }}>
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md pr-1 text-sm hover:bg-muted',
          c.id === activeId && 'bg-muted font-medium'
        )}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, c.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
        data-testid="conversation-item"
        data-title={c.title}
      >
        <button
          className="flex min-w-0 flex-1 flex-col px-2.5 py-2 text-left"
          onClick={() => void select(c.id)}
          title={c.title || t('untitled')}
        >
          <span className="flex w-full min-w-0 items-center gap-1.5">
            {streaming[c.id] && <span className="inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-primary" />}
            {c.parentId && (
              <GitBranch className="size-3.5 shrink-0 text-muted-foreground" aria-label={t('organize.fork')} />
            )}
            <span className="truncate">{c.title || t('untitled')}</span>
            {c.suggestedGroupId && (
              <Sparkles
                className="size-3 shrink-0 text-primary"
                aria-label={t('organize.suggestedBadge', { group: groupName(c.suggestedGroupId) })}
              />
            )}
          </span>
          {c.searchSnippet && <SearchSnippet snippet={c.searchSnippet} />}
        </button>
        <div className="hidden shrink-0 group-hover:flex">
          <Button variant="ghost" size="icon-sm" title={c.pinned ? t('unpin') : t('pin')} onClick={() => void togglePin(c.id)}>
            {c.pinned ? <PinOff /> : <Pin />}
          </Button>
          <Button variant="ghost" size="icon-sm" title={t('organize.moveTo')} onClick={() => setMoving(c)}>
            <FolderInput />
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

  const zone = (target: Drop, children: ReactNode, testId: string, extra?: Record<string, string>) => (
    <div
      {...dropProps(target)}
      {...extra}
      data-testid={testId}
      className="rounded-md data-[drop-over=true]:bg-primary/10 data-[drop-over=true]:ring-1 data-[drop-over=true]:ring-primary/40"
    >
      {children}
    </div>
  )

  const renderSection = (s: SidebarSection) => {
    if (s.kind === 'pinned')
      return zone(
        { kind: 'pinned' },
        <>
          <h3 className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted-foreground">{t('pinned')}</h3>
          <ul>{s.rows.map(renderRow)}</ul>
        </>,
        'section-pinned'
      )
    if (s.kind === 'recent')
      return zone(
        { kind: 'recent' },
        <>
          {sections.length > 1 && (
            <h3 className="px-2.5 pt-3 pb-1 text-xs font-medium text-muted-foreground">
              {groups.length ? t('organize.ungrouped') : t('recent')}
            </h3>
          )}
          <ul>{s.rows.map(renderRow)}</ul>
        </>,
        'section-recent'
      )
    const g = s.group
    return zone(
      { kind: 'group', groupId: g.id },
      <>
        <div className="group flex items-center gap-1 pt-2 pr-1">
          <button
            className="flex min-w-0 flex-1 items-center gap-1 px-1.5 py-1 text-left text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={() => onToggleGroup(g.id, s.collapsed)}
            aria-expanded={!s.collapsed}
            data-testid="group-toggle"
          >
            {s.collapsed ? <ChevronRight className="size-3.5 shrink-0" /> : <ChevronDown className="size-3.5 shrink-0" />}
            <span className="truncate">{g.name}</span>
            <span className="shrink-0 tabular-nums opacity-70" data-testid="group-count">
              {s.count}
            </span>
          </button>
          <div className="hidden shrink-0 group-hover:flex">
            <Button
              variant="ghost"
              size="icon-sm"
              title={t('organize.renameGroup')}
              onClick={() => setGroupDialog({ group: g, error: null })}
            >
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" title={t('organize.deleteGroup')} onClick={() => setDeletingGroup(g)}>
              <Trash2 />
            </Button>
          </div>
        </div>
        {!s.collapsed &&
          (s.rows.length ? (
            <ul>{s.rows.map(renderRow)}</ul>
          ) : (
            <p className="px-2.5 py-1.5 text-xs text-muted-foreground/70">{t('organize.emptyGroup')}</p>
          ))}
      </>,
      'group-section',
      { 'data-group': g.name }
    )
  }

  const onRename = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const title = String(new FormData(e.currentTarget).get('title') ?? '').trim()
    if (renaming && title) void rename(renaming.id, title)
    setRenaming(null)
  }

  const onGroupSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (!groupDialog) return
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
    if (!name) return
    const target = groupDialog.group
    setGroupDialog(null)
    const error = target ? await renameGroup(target.id, name) : await createGroup(name)
    // Trùng tên → mở lại hộp kèm lỗi (đã hoàn tác trên thanh bên).
    if (error) setGroupDialog({ group: target, error })
  }

  const hasAny = sections.length > 0

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="space-y-2 p-3">
        <div className="flex gap-1.5">
          <Button className="flex-1 justify-start" variant="outline" onClick={() => void select(null)}>
            <Plus />
            {t('newChat')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            title={t('organize.newGroup')}
            aria-label={t('organize.newGroup')}
            onClick={() => setGroupDialog({ group: null, error: null })}
            data-testid="new-group"
          >
            <FolderPlus />
          </Button>
        </div>
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-3">
        {!hasAny && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {query ? t('noResults') : t('noConversations')}
          </p>
        )}
        {sections.map((s) => (
          <div key={s.kind === 'group' ? s.group.id : s.kind}>{renderSection(s)}</div>
        ))}
        {/* Luôn có chỗ thả "bỏ khỏi nhóm" khi chưa có cuộc nào ngoài nhóm. */}
        {groups.length > 0 &&
          !sections.some((s) => s.kind === 'recent') &&
          zone(
            { kind: 'recent' },
            <p className="px-2.5 py-2 text-xs text-muted-foreground/70">{t('organize.dropUngroup')}</p>,
            'section-recent'
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

      <Dialog open={!!groupDialog} onOpenChange={(open) => !open && setGroupDialog(null)}>
        <DialogContent title={groupDialog?.group ? t('organize.renameGroup') : t('organize.newGroup')}>
          <form onSubmit={(e) => void onGroupSubmit(e)} className="space-y-4">
            <Input
              name="name"
              defaultValue={groupDialog?.group?.name}
              placeholder={t('organize.groupPlaceholder')}
              maxLength={GROUP_NAME_MAX}
              aria-label={t('organize.groupName')}
              autoFocus
            />
            {groupDialog?.error && (
              <p className="text-sm text-destructive" role="alert">
                {t(`organize.errors.${groupDialog.error}`, { defaultValue: t('common:errors.generic', { message: groupDialog.error }) })}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <DialogClose asChild>
                <Button type="button" variant="outline">{t('common:actions.cancel')}</Button>
              </DialogClose>
              <Button type="submit">{t('common:actions.save')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!moving} onOpenChange={(open) => !open && setMoving(null)}>
        <DialogContent title={t('organize.moveTitle', { title: moving?.title || t('untitled') })}>
          <div className="grid gap-1.5">
            {groups.length === 0 && <p className="text-sm text-muted-foreground">{t('organize.noGroups')}</p>}
            {groups.map((g) => (
              <Button
                key={g.id}
                variant={moving?.groupId === g.id ? 'default' : 'outline'}
                className="justify-start"
                onClick={() => {
                  if (moving) void moveTo(moving.id, { groupId: g.id })
                  setMoving(null)
                }}
              >
                <FolderInput />
                {g.name}
              </Button>
            ))}
            {moving?.groupId && (
              <Button
                variant="ghost"
                className="justify-start"
                onClick={() => {
                  if (moving) void moveTo(moving.id, { groupId: null })
                  setMoving(null)
                }}
              >
                {t('organize.removeFromGroup')}
              </Button>
            )}
          </div>
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

      <Dialog open={!!deletingGroup} onOpenChange={(open) => !open && setDeletingGroup(null)}>
        <DialogContent
          title={t('organize.deleteGroup')}
          description={t('organize.deleteGroupDescription', { name: deletingGroup?.name ?? '' })}
        >
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingGroup) void removeGroup(deletingGroup.id)
                setDeletingGroup(null)
              }}
            >
              {t('organize.deleteGroupConfirm')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
