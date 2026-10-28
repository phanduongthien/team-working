import { Bug, Copy, ExternalLink, Lightbulb, LoaderCircle, PenLine, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { newIssueUrl, parseGithubRepo } from '@shared/release'
import { Button } from '@renderer/components/ui/button'
import { Input, Label, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { composeIssueBody, kindFromParam, manualDraft, type BugInfo, type IssueDraft, type IssueKind } from '../logic'

const repo = parseGithubRepo(import.meta.env.VITE_GITHUB_REPO)

/**
 * Người dùng viết ý tưởng/lỗi → (tùy chọn) trợ lý chuẩn hóa thành issue → người dùng sửa bản nháp
 * → mở trang tạo issue GitHub đã điền sẵn. App không tự gửi gì lên GitHub.
 */
export function IdeasPage() {
  const { t, i18n } = useTranslation('ideas')
  const [params] = useSearchParams()
  const [kind, setKind] = useState<IssueKind>(() => kindFromParam(params.get('kind')))
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [draft, setDraft] = useState<IssueDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attach, setAttach] = useState(true)
  const [info, setInfo] = useState<BugInfo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (kind === 'bug' && !info) void api.app.bugInfo().then(setInfo)
  }, [kind, info])

  const switchKind = (next: IssueKind): void => {
    setKind(next)
    setDraft(null)
    setError(null)
  }

  const format = async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.ideas.format({ title, description, kind, language: i18n.language === 'en' ? 'en' : 'vi' })
      if ('error' in res) setError(res.error)
      else setDraft(res)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const finalBody = draft
    ? composeIssueBody(draft.body, kind === 'bug' && attach ? info : null, { env: t('issue.env'), log: t('issue.log') })
    : ''

  const open = (): void => {
    if (!draft || !repo) return
    void api.app.openExternal(newIssueUrl(repo, { title: draft.title, body: finalBody, labels: draft.labels }))
  }

  const copy = async (): Promise<void> => {
    if (!draft) return
    await navigator.clipboard.writeText(`${draft.title}\n\n${finalBody}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const canDraft = description.trim().length > 0 && !loading

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 px-6 py-8">
        <div>
          <h1 className="text-2xl font-semibold">{t('heading')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('intro')}</p>
        </div>

        <div className="flex gap-2" role="tablist">
          {(['idea', 'bug'] as const).map((k) => {
            const Icon = k === 'idea' ? Lightbulb : Bug
            return (
              <button
                key={k}
                role="tab"
                aria-selected={kind === k}
                onClick={() => switchKind(k)}
                className={cn(
                  'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm',
                  kind === k ? 'border-primary bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                )}
              >
                <Icon className="size-4" />
                {t(`kind.${k}`)}
              </button>
            )
          })}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="idea-title">{t('form.title')}</Label>
          <Input id="idea-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(`form.titlePlaceholder.${kind}`)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="idea-desc">{t('form.description')}</Label>
          <Textarea
            id="idea-desc"
            rows={6}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t(`form.descriptionPlaceholder.${kind}`)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={() => void format()} disabled={!canDraft}>
            {loading ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {t('form.format')}
          </Button>
          <Button variant="outline" onClick={() => setDraft(manualDraft(kind, title, description))} disabled={!canDraft || !title.trim()}>
            <PenLine />
            {t('form.manual')}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{t('failed', { message: t(`errors.${error}`, { defaultValue: error }) })}</p>}

        {draft && (
          <div className="space-y-4 rounded-lg border bg-card p-5" data-testid="issue-draft">
            <h2 className="font-medium">{t('draft.heading')}</h2>
            <div className="space-y-1.5">
              <Label htmlFor="draft-title">{t('form.title')}</Label>
              <Input id="draft-title" maxLength={200} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-body">{t('draft.body')}</Label>
              <Textarea id="draft-body" rows={12} className="font-mono" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
            </div>
            <p className="text-xs text-muted-foreground">{t('draft.labels', { list: draft.labels.join(', ') })}</p>

            {kind === 'bug' && (
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
                  {t('draft.attach')}
                </label>
                {attach && info && (
                  <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap" data-testid="bug-info">
                    {`Team Working ${info.version} · ${info.os}\n\n${info.logTail || t('draft.noLog')}`}
                  </pre>
                )}
                <p className="text-xs text-muted-foreground">{t('draft.privacy')}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {repo && (
                <Button onClick={open} disabled={!draft.title.trim()}>
                  <ExternalLink />
                  {t('draft.open')}
                </Button>
              )}
              <Button variant={repo ? 'outline' : 'default'} onClick={() => void copy()}>
                <Copy />
                {copied ? t('draft.copied') : t('draft.copy')}
              </Button>
            </div>
            {!repo && <p className="text-xs text-muted-foreground">{t('draft.noRepo')}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
