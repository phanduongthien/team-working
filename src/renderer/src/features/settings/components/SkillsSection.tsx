import {
  Eye,
  FolderOpen,
  FolderPlus,
  Loader2,
  Sparkles,
  Trash2,
  X,
  FileArchive
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  STYLE_SKILL,
  type SkillDetail,
  type SkillInfo,
  type SkillPreview,
  type SkillTheme
} from '@shared/skills'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { optimistic, useSyncedState } from '@renderer/lib/sync'

const kb = (n: number): string => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`)

function ThemeSwatches({ themes }: { themes: SkillTheme[] }) {
  if (!themes.length) return null
  return (
    <div className="flex flex-wrap gap-2">
      {themes.map((th) => (
        <span
          key={th.id}
          className="flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs"
          style={{ background: th.colors.background, color: th.colors.text }}
        >
          <span className="size-2.5 rounded-full" style={{ background: th.colors.accent }} />
          {th.name} <code className="opacity-70">{th.id}</code>
        </span>
      ))}
    </div>
  )
}

function SkillBody({ body }: { body: string }) {
  return (
    <pre
      className="max-h-72 overflow-auto rounded border bg-muted/40 p-3 text-xs whitespace-pre-wrap"
      data-testid="skill-body"
    >
      {body}
    </pre>
  )
}

/** Xem trước gói skill: nguồn, nội dung SKILL.md, file kèm, file bị bỏ — người dùng đọc rồi mới cài. */
function PreviewDialog({
  preview,
  onClose,
  onInstalled
}: {
  preview: SkillPreview
  onClose(): void
  onInstalled(): void
}) {
  const { t } = useTranslation('settings')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          void api.skills.cancelPreview(preview.token)
          onClose()
        }
      }}
    >
      <DialogContent
        className="max-w-2xl"
        title={t('skills.preview.title', { name: preview.name })}
        description={preview.description}
        data-testid="skill-preview"
      >
        <div className="space-y-3 text-sm">
          <p className="break-all text-muted-foreground">
            {t('skills.preview.origin')}: <code>{preview.origin}</code>
          </p>
          {preview.replaces && (
            <p className="text-amber-700 dark:text-amber-400">{t('skills.preview.replaces')}</p>
          )}
          <SkillBody body={preview.body} />
          <div>
            <p className="font-medium">{t('skills.preview.files')}</p>
            <ul className="text-xs text-muted-foreground">
              {preview.files.map((f) => (
                <li key={f.path}>
                  {f.path} ({kb(f.size)})
                </li>
              ))}
            </ul>
          </div>
          {preview.skipped.length > 0 && (
            <div data-testid="skill-skipped">
              <p className="font-medium">{t('skills.preview.skipped')}</p>
              <ul className="text-xs text-muted-foreground">
                {preview.skipped.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}
          <ThemeSwatches themes={preview.themes} />
          <p className="text-xs text-muted-foreground">{t('skills.preview.textOnly')}</p>
          {error && <p className="text-destructive">{t('skills.errors.install')}</p>}
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button
              disabled={busy}
              data-testid="skill-install"
              onClick={async () => {
                setBusy(true)
                try {
                  await api.skills.install(preview.token)
                  onInstalled()
                } catch {
                  setError(true)
                  setBusy(false)
                }
              }}
            >
              {busy && <Loader2 className="animate-spin" />}
              {t('skills.preview.install')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Học phong cách: trợ lý đề xuất ghi chú, người dùng chọn / sửa rồi mới lưu vào my-style. */
function StyleNotes() {
  const { t } = useTranslation('settings')
  // Ghi chú my-style là một skill → đồng bộ cùng mục "skills".
  const { data, setData: setNotes } = useSyncedState('skills', () => api.skills.styleNotes())
  const notes = data ?? []
  const [proposed, setProposed] = useState<{ text: string; keep: boolean }[] | null>(null)
  const [state, setState] = useState<'idle' | 'learning' | 'empty' | 'error'>('idle')
  const [draft, setDraft] = useState('')

  // Hiện ngay, lưu sau; lỗi → hoàn tác + báo lỗi chung. Danh sách skill tự cập nhật qua đồng bộ.
  const save = async (next: string[]): Promise<void> => {
    await optimistic({
      topic: 'skills',
      apply: () => setNotes(next),
      rollback: () => setNotes(notes),
      save: () => api.skills.setStyleNotes(next)
    })
  }

  const learn = async (): Promise<void> => {
    setState('learning')
    const r = await api.skills.learnStyle()
    if ('error' in r) return setState(r.error === 'no_messages' ? 'empty' : 'error')
    setState(r.notes.length ? 'idle' : 'empty')
    setProposed(r.notes.length ? r.notes.map((text) => ({ text, keep: true })) : null)
  }

  return (
    <div className="space-y-2 rounded-md border p-3" data-testid="style-notes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{t('skills.style.heading')}</p>
          <p className="text-xs text-muted-foreground">{t('skills.style.description')}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={state === 'learning'}
          onClick={() => void learn()}
          data-testid="style-learn"
        >
          {state === 'learning' ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {t('skills.style.learn')}
        </Button>
      </div>
      {state === 'empty' && (
        <p className="text-xs text-muted-foreground">{t('skills.style.nothing')}</p>
      )}
      {state === 'error' && <p className="text-xs text-destructive">{t('skills.style.error')}</p>}

      {proposed && (
        <div className="space-y-1.5 rounded bg-muted/40 p-2" data-testid="style-proposed">
          <p className="text-xs font-medium">{t('skills.style.proposed')}</p>
          {proposed.map((p, i) => (
            <label key={i} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1.5"
                checked={p.keep}
                onChange={(e) =>
                  setProposed(
                    proposed.map((x, j) => (j === i ? { ...x, keep: e.target.checked } : x))
                  )
                }
              />
              <Input
                value={p.text}
                maxLength={300}
                onChange={(e) =>
                  setProposed(
                    proposed.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))
                  )
                }
              />
            </label>
          ))}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setProposed(null)}>
              {t('skills.style.discard')}
            </Button>
            <Button
              size="sm"
              data-testid="style-save"
              disabled={!proposed.some((p) => p.keep && p.text.trim())}
              onClick={async () => {
                await save([
                  ...notes,
                  ...proposed.filter((p) => p.keep && p.text.trim()).map((p) => p.text.trim())
                ])
                setProposed(null)
              }}
            >
              {t('skills.style.save')}
            </Button>
          </div>
        </div>
      )}

      {notes.length > 0 && (
        <ul className="space-y-1 text-sm" data-testid="style-saved">
          {notes.map((n, i) => (
            <li key={`${i}-${n}`} className="flex items-start gap-2">
              <span className="flex-1">• {n}</span>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('skills.style.removeNote')}
                onClick={() => void save(notes.filter((_, j) => j !== i))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          void save([...notes, draft.trim()]).then(() => setDraft(''))
        }}
      >
        <Input
          value={draft}
          maxLength={300}
          placeholder={t('skills.style.addPlaceholder')}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button size="sm" variant="outline" type="submit" disabled={!draft.trim()}>
          {t('skills.style.add')}
        </Button>
      </form>
    </div>
  )
}

export function SkillsSection() {
  const { t } = useTranslation('settings')
  // Tự hỏi lại khi mở trang, khi quay về app (vd vừa chép skill vào thư mục) và khi main báo đồng bộ.
  const { data, setData: setSkills, refresh } = useSyncedState('skills', () => api.skills.list())
  const skills: SkillInfo[] = data ?? []
  const [preview, setPreview] = useState<SkillPreview | null>(null)
  const [viewing, setViewing] = useState<SkillDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)


  const pick = async (kind: 'folder' | 'zip'): Promise<void> => {
    setError(null)
    const r = await api.skills.pick(kind)
    if (!r) return
    if ('error' in r) setError(r.error)
    else setPreview(r)
  }

  const user = skills.filter((s) => s.source === 'user' && s.name !== STYLE_SKILL)
  const builtin = skills.filter((s) => s.source === 'builtin')

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => void pick('folder')}
          data-testid="skill-pick-folder"
        >
          <FolderPlus />
          {t('skills.installFolder')}
        </Button>
        <Button variant="outline" onClick={() => void pick('zip')} data-testid="skill-pick-zip">
          <FileArchive />
          {t('skills.installZip')}
        </Button>
        <Button variant="ghost" onClick={() => void api.skills.openFolder()}>
          <FolderOpen />
          {t('skills.openFolder')}
        </Button>
      </div>
      {error && (
        <p className="text-destructive" data-testid="skill-error">
          {t(`skills.errors.${error}`)}
        </p>
      )}

      <p className="text-xs text-muted-foreground">{t('skills.howToCall')}</p>

      {user.length === 0 ? (
        <p className="text-muted-foreground">{t('skills.empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border" data-testid="skill-list">
          {user.map((s) => (
            <li
              key={s.name}
              className="flex flex-wrap items-start gap-3 p-3"
              data-testid={`skill-${s.name}`}
            >
              <input
                type="checkbox"
                className="mt-1"
                checked={s.enabled}
                aria-label={t('skills.enable', { name: s.name })}
                data-testid={`skill-enable-${s.name}`}
                onChange={(e) => {
                  const enabled = e.target.checked
                  void optimistic({
                    topic: 'skills',
                    apply: () => setSkills((list) => list.map((x) => (x.name === s.name ? { ...x, enabled } : x))),
                    rollback: () => setSkills(skills),
                    save: () => api.skills.setEnabled(s.name, enabled)
                  })
                }}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.description}</p>
                <ThemeSwatches themes={s.themes} />
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('skills.view', { name: s.name })}
                onClick={async () => setViewing(await api.skills.get('user', s.name))}
              >
                <Eye />
              </Button>
              {confirmRemove === s.name ? (
                <Button
                  size="sm"
                  variant="destructive"
                  data-testid={`skill-remove-confirm-${s.name}`}
                  onClick={() => {
                    setConfirmRemove(null)
                    void optimistic({
                      topic: 'skills',
                      apply: () => setSkills((list) => list.filter((x) => x.name !== s.name)),
                      rollback: () => setSkills(skills),
                      save: () => api.skills.remove(s.name)
                    })
                  }}
                >
                  {t('skills.removeConfirm')}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={t('skills.remove', { name: s.name })}
                  data-testid={`skill-remove-${s.name}`}
                  onClick={() => setConfirmRemove(s.name)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <StyleNotes />

      <details>
        <summary className="cursor-pointer text-muted-foreground">
          {t('skills.builtin', { count: builtin.length })}
        </summary>
        <ul className="mt-2 space-y-1">
          {builtin.map((s) => (
            <li key={s.name} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <span className="font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground"> — {s.description}</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                aria-label={t('skills.view', { name: s.name })}
                onClick={async () => setViewing(await api.skills.get('builtin', s.name))}
              >
                <Eye />
              </Button>
            </li>
          ))}
        </ul>
      </details>

      {preview && (
        <PreviewDialog
          preview={preview}
          onClose={() => setPreview(null)}
          onInstalled={() => {
            setPreview(null)
            void refresh()
          }}
        />
      )}
      {viewing && (
        <Dialog open onOpenChange={(open) => !open && setViewing(null)}>
          <DialogContent
            className="max-w-2xl"
            title={viewing.name}
            description={viewing.description}
          >
            <div className="space-y-2">
              {viewing.origin && (
                <p className="break-all text-xs text-muted-foreground">
                  {t('skills.preview.origin')}: <code>{viewing.origin}</code>
                </p>
              )}
              <SkillBody body={viewing.body} />
              <ThemeSwatches themes={viewing.themes} />
              <p className="text-xs text-muted-foreground">{viewing.files.join(', ')}</p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
