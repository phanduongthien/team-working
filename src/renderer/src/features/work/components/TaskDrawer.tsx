import { Download, Paperclip, Send, Sparkles, Square, Timer, Trash2, X } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TASK_PRIORITIES, TASK_STATUSES, type TaskPriority, type TaskStatus } from '@shared/schemas'
import type { TaskRow } from '@shared/supabase.types'
import { TeamError } from '@renderer/components/TeamGate'
import { UserAvatar } from '@renderer/components/UserAvatar'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Label, Select, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { formatSize } from '@renderer/lib/utils'
import { useAuth } from '@renderer/stores/auth'
import { isManagerRole, useMyRole, useTeam } from '@renderer/stores/team'
import {
  signedUrl,
  useAddComment,
  useAttachments,
  useComments,
  useCreateTasks,
  useDeleteAttachment,
  useDeleteComment,
  useDeleteTask,
  useUpdateTask,
  useUploadAttachment,
  type TaskUpdate
} from '../api'
import { useTime } from '../../time/store'
import { useProjects } from '../api'
import { useMemberMap } from './helpers'

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  )
}

function Comments({ taskId }: { taskId: string }) {
  const { t, i18n } = useTranslation('work')
  const uid = useAuth((s) => s.session?.user.id)
  const manager = isManagerRole(useMyRole())
  const members = useMemberMap()
  const comments = useComments(taskId)
  const add = useAddComment(taskId)
  const remove = useDeleteComment(taskId)
  const [body, setBody] = useState('')

  const onSubmit = (e: FormEvent): void => {
    e.preventDefault()
    if (body.trim()) add.mutate(body.trim(), { onSuccess: () => setBody('') })
  }

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t('task.comments')}</h3>
      {comments.data?.length === 0 && <p className="text-xs text-muted-foreground">{t('task.noComments')}</p>}
      <ul className="space-y-2">
        {comments.data?.map((c) => {
          const author = members.get(c.author_id)
          return (
            <li key={c.id} className="group flex gap-2 text-sm" data-testid="task-comment">
              <UserAvatar user={author} className="size-6 text-[10px]" />
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{author?.display_name ?? '?'}</span> ·{' '}
                  {new Date(c.created_at).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}
                </div>
                <p className="whitespace-pre-wrap">{c.body}</p>
              </div>
              {(c.author_id === uid || manager) && (
                <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100" title={t('common:actions.delete')} onClick={() => remove.mutate(c.id)}>
                  <Trash2 />
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      <form className="flex gap-2" onSubmit={onSubmit}>
        <Textarea rows={2} maxLength={5000} placeholder={t('task.addComment')} aria-label={t('task.addComment')} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button type="submit" size="icon" title={t('task.send')} disabled={add.isPending || !body.trim()}>
          <Send />
        </Button>
      </form>
      <TeamError code={add.error?.message ?? remove.error?.message ?? null} />
    </section>
  )
}

function Attachments({ task }: { task: TaskRow }) {
  const { t } = useTranslation('work')
  const uid = useAuth((s) => s.session?.user.id)
  const manager = isManagerRole(useMyRole())
  const files = useAttachments(task.id)
  const upload = useUploadAttachment(task)
  const remove = useDeleteAttachment(task.id)
  const [error, setError] = useState<string | null>(null)

  const open = async (path: string): Promise<void> => {
    try {
      await api.app.openExternal(await signedUrl(path))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{t('task.attachments')}</h3>
        <Button variant="outline" size="sm" asChild>
          <label className="cursor-pointer">
            <Paperclip />
            {t('task.upload')}
            <input
              type="file"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) upload.mutate(file)
              }}
            />
          </label>
        </Button>
      </div>
      <ul className="space-y-1 text-sm">
        {files.data?.map((f) => (
          <li key={f.id} className="group flex items-center gap-2">
            <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left hover:underline" onClick={() => void open(f.storage_path)}>
              <Download className="size-3.5 shrink-0" />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatSize(f.size)}</span>
            </button>
            {(f.uploaded_by === uid || manager) && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="opacity-0 group-hover:opacity-100"
                title={t('common:actions.delete')}
                onClick={() => remove.mutate({ id: f.id, path: f.storage_path })}
              >
                <Trash2 />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {upload.error?.message === 'file_too_large' ? (
        <p className="text-sm text-destructive">{t('task.uploadTooLarge')}</p>
      ) : (
        <TeamError code={error ?? upload.error?.message ?? remove.error?.message ?? null} />
      )}
    </section>
  )
}

function Subtasks({ task, subtasks, canAdd }: { task: TaskRow; subtasks: TaskRow[]; canAdd: boolean }) {
  const { t } = useTranslation('work')
  const uid = useAuth((s) => s.session?.user.id)
  const update = useUpdateTask(task.project_id)
  const create = useCreateTasks()
  const [title, setTitle] = useState('')
  const done = subtasks.filter((s) => s.status === 'done').length

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{t('task.subtasks', { done, total: subtasks.length })}</h3>
      <ul className="space-y-1">
        {subtasks.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={s.status === 'done'}
              aria-label={s.title}
              onChange={(e) => update.mutate({ id: s.id, patch: { status: e.target.checked ? 'done' : 'todo' } })}
            />
            <span className={s.status === 'done' ? 'text-muted-foreground line-through' : ''}>{s.title}</span>
          </li>
        ))}
      </ul>
      {canAdd && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!title.trim() || !uid) return
            create.mutate(
              [{ project_id: task.project_id, parent_id: task.id, assigner_id: uid, title: title.trim(), position: subtasks.length * 1000 + 1000 }],
              { onSuccess: () => setTitle('') }
            )
          }}
        >
          <Input placeholder={t('task.addSubtask')} aria-label={t('task.addSubtask')} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </form>
      )}
      <TeamError code={update.error?.message ?? create.error?.message ?? null} />
    </section>
  )
}

/** Bấm giờ cho task này (thay bộ bấm giờ đang chạy nếu có). */
function TrackButton({ task }: { task: TaskRow }) {
  const { t } = useTranslation('work')
  const { current, startTimer, stopTimer } = useTime()
  const project = useProjects(task.team_id).data?.find((p) => p.id === task.project_id)
  const tracking = current?.taskId === task.id
  return (
    <Button
      variant={tracking ? 'default' : 'outline'}
      size="sm"
      onClick={() =>
        void (tracking
          ? stopTimer()
          : startTimer({ taskId: task.id, projectId: task.project_id, title: task.title, projectName: project?.name ?? null }))
      }
    >
      {tracking ? <Square /> : <Timer />}
      {tracking ? t('task.stopTracking') : t('task.track')}
    </Button>
  )
}

export function TaskDrawer({ task, allTasks, onClose }: { task: TaskRow; allTasks: TaskRow[]; onClose(): void }) {
  const { t } = useTranslation('work')
  const uid = useAuth((s) => s.session?.user.id)
  const members = useTeam((s) => s.members)
  const memberMap = useMemberMap()
  const manager = isManagerRole(useMyRole())
  const update = useUpdateTask(task.project_id)
  const del = useDeleteTask(task.project_id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)

  // Khớp quy tắc trong trigger tasks_before_write.
  const canEditAll = manager || task.assigner_id === uid
  const canEditStatus = canEditAll || task.assignee_id === uid
  const assignable = manager ? members : members.filter((m) => m.id === uid)
  const save = (patch: TaskUpdate): void => update.mutate({ id: task.id, patch })
  const subtasks = allTasks.filter((x) => x.parent_id === task.id)
  const assigner = memberMap.get(task.assigner_id)

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l bg-background shadow-2xl" aria-label={task.title} data-testid="task-drawer">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        {task.ai_generated && <Sparkles className="size-4 text-primary" aria-label={t('task.ai')} />}
        <span className="flex-1 truncate text-sm text-muted-foreground">{assigner && t('task.assigner', { name: assigner.display_name })}</span>
        <TrackButton task={task} />
        {(manager || task.assigner_id === uid) && (
          <Button variant="ghost" size="icon-sm" title={t('task.delete')} onClick={() => setConfirmDelete(true)}>
            <Trash2 />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" title={t('task.close')} onClick={onClose}>
          <X />
        </Button>
      </header>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        <div className="space-y-2">
          <Input
            aria-label={t('task.title')}
            className="h-10 border-transparent text-lg font-semibold hover:border-input"
            value={title}
            maxLength={200}
            disabled={!canEditAll}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== task.title && save({ title: title.trim() })}
          />
          {!canEditAll && canEditStatus && <p className="text-xs text-muted-foreground">{t('task.assigneeOnlyHint')}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t('task.status')} htmlFor="d-status">
            <Select id="d-status" value={task.status} disabled={!canEditStatus} onChange={(e) => save({ status: e.target.value as TaskStatus })}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status.${s}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('task.priority')} htmlFor="d-priority">
            <Select id="d-priority" value={task.priority} disabled={!canEditAll} onChange={(e) => save({ priority: e.target.value as TaskPriority })}>
              {TASK_PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`priority.${p}`)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('task.assignee')} htmlFor="d-assignee">
            <Select
              id="d-assignee"
              value={task.assignee_id ?? ''}
              disabled={!canEditAll}
              onChange={(e) => save({ assignee_id: e.target.value || null })}
            >
              <option value="">{t('task.unassigned')}</option>
              {(canEditAll ? assignable : members).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('task.dueDate')} htmlFor="d-due">
            <Input id="d-due" type="date" value={task.due_date ?? ''} disabled={!canEditAll} onChange={(e) => save({ due_date: e.target.value || null })} />
          </Field>
          <Field label={t('task.estimate')} htmlFor="d-est">
            <Input
              id="d-est"
              type="number"
              min={0}
              max={1000}
              step={0.5}
              defaultValue={task.estimate_hours ?? ''}
              disabled={!canEditStatus}
              onBlur={(e) => {
                const v = e.target.value ? Number(e.target.value) : null
                if (v !== task.estimate_hours) save({ estimate_hours: v })
              }}
            />
          </Field>
        </div>

        <Field label={t('task.description')} htmlFor="d-desc">
          <Textarea
            id="d-desc"
            rows={5}
            maxLength={10000}
            value={description}
            disabled={!canEditAll}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => description !== task.description && save({ description })}
          />
        </Field>
        <TeamError code={update.error?.message ?? null} />

        {!task.parent_id && <Subtasks task={task} subtasks={subtasks} canAdd={canEditStatus || manager} />}
        <Attachments task={task} />
        <Comments taskId={task.id} />
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title={t('task.deleteConfirm', { title: task.title })}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => del.mutate(task.id, { onSuccess: onClose })}>
              {t('task.delete')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
