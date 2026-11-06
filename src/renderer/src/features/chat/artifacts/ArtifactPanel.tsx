import { Download, FileText, History, LayoutTemplate, RotateCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { EXPORT_FORMATS, type ArtifactVersion } from '@shared/artifacts'
import type { MessageArtifact } from '@shared/artifacts'
import { Button } from '@renderer/components/ui/button'
import { Select } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useSync } from '@renderer/lib/sync'
import { useChat } from '../store'
import { useArtifacts } from './store'

/** Tin nhắn từ iframe: chỉ vài lệnh cố định, kiểm tra nguồn + nội dung. */
const frameMessage = z.discriminatedUnion('cmd', [
  z.object({ source: z.literal('mmc-artifact'), cmd: z.literal('ready') }),
  z.object({
    source: z.literal('mmc-artifact'),
    cmd: z.literal('edit'),
    content: z.string().max(500_000)
  }),
  z.object({
    source: z.literal('mmc-artifact'),
    cmd: z.literal('svg'),
    svg: z.string().max(5_000_000)
  })
])

/** Thẻ artifact trong tin nhắn của trợ lý: bấm để mở; lỗi sửa → nút nhờ trợ lý sửa lại. */
export function ArtifactChips({ refs }: { refs: MessageArtifact[] }) {
  const { t } = useTranslation('chat')
  const show = useArtifacts((s) => s.show)
  const send = useChat((s) => s.send)
  const mode = useChat((s) => s.conversations.find((c) => c.id === s.activeId)?.mode ?? 'free')
  if (refs.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2" data-testid="artifact-chips">
      {refs.map((r, i) =>
        r.error ? (
          <div
            key={i}
            className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs text-destructive"
            data-testid="artifact-error"
          >
            {t(`artifacts.errors.${r.error}`, { title: r.title })}
            <button
              type="button"
              className="underline"
              onClick={() => void send(t('artifacts.retryMessage', { title: r.title }), mode)}
            >
              {t('artifacts.retry')}
            </button>
          </div>
        ) : (
          <button
            key={i}
            type="button"
            className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs hover:bg-muted"
            onClick={() => r.id && void show(r.id, r.version)}
            data-testid="artifact-chip"
          >
            <FileText className="size-3.5" />
            {r.title} <span className="text-muted-foreground">v{r.version}</span>
          </button>
        )
      )}
    </div>
  )
}

/** Panel cạnh khung chat: iframe sandbox (chỉ allow-scripts), chọn artifact / phiên bản, xuất file, khôi phục. */
export function ArtifactPanel({ conversationId }: { conversationId: string | null }) {
  const { t } = useTranslation('chat')
  const { open, list, selected, setOpen, load, show } = useArtifacts()
  const send = useChat((s) => s.send)
  const mode = useChat((s) => s.conversations.find((c) => c.id === s.activeId)?.mode ?? 'free')
  const [versions, setVersions] = useState<Omit<ArtifactVersion, 'content'>[]>([])
  const [reload, setReload] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [templates, setTemplates] = useState<{ id: string; name: string; prompt: string }[]>([])
  const [width, setWidth] = useState(520)
  const frame = useRef<HTMLIFrameElement>(null)

  useEffect(() => void load(conversationId), [conversationId, load])
  // Trợ lý tạo / sửa artifact, người dùng sửa / khôi phục phiên bản → main báo → tải lại danh sách + phiên bản.
  useSync('artifacts', () => load(conversationId))
  useEffect(() => void api.artifacts.templates().then(setTemplates), [])
  useEffect(() => {
    if (selected) void api.artifacts.versions(selected.id).then(setVersions)
  }, [selected, list])

  useEffect(() => {
    const onMessage = (e: MessageEvent): void => {
      // Chỉ nhận từ đúng iframe đang mở (origin "null" vì sandbox không same-origin).
      if (!frame.current || e.source !== frame.current.contentWindow || !selected) return
      const msg = frameMessage.safeParse(e.data)
      if (!msg.success) return
      if (msg.data.cmd === 'edit') {
        void api.artifacts.saveVersion(selected.id, msg.data.content).then(async (a) => {
          if (!a) return
          await load(conversationId)
          useArtifacts.setState({ selected: { id: a.id, version: a.version } })
          setNotice(t('artifacts.savedVersion', { version: a.version }))
        })
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [selected, conversationId, load, t])

  if (!open) return null
  const current = list.find((a) => a.id === selected?.id)
  const isLatest = current && selected && selected.version === current.version

  const doExport = async (format: string): Promise<void> => {
    if (!selected) return
    const r = await api.artifacts.export(selected.id, selected.version, format)
    setNotice(
      'path' in r
        ? t('artifacts.exported', { path: r.path })
        : 'error' in r
          ? t('artifacts.exportFailed', { code: r.error })
          : null
    )
  }

  return (
    <aside
      className="relative flex h-full shrink-0 flex-col border-l bg-background"
      style={{ width }}
      data-testid="artifact-panel"
    >
      <div
        className="absolute inset-y-0 -left-1 w-2 cursor-col-resize"
        onMouseDown={(e) => {
          const startX = e.clientX
          const startW = width
          const move = (ev: MouseEvent): void =>
            setWidth(Math.min(1100, Math.max(320, startW + startX - ev.clientX)))
          const up = (): void => (
            window.removeEventListener('mousemove', move),
            window.removeEventListener('mouseup', up)
          )
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      />
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {list.length > 0 && (
          <Select
            aria-label={t('artifacts.pick')}
            className="h-8 w-44 text-xs"
            value={selected?.id ?? ''}
            onChange={(e) => void show(e.target.value)}
          >
            {list.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </Select>
        )}
        {current && (
          <Select
            aria-label={t('artifacts.version')}
            className="h-8 w-28 text-xs"
            value={selected?.version ?? current.version}
            onChange={(e) =>
              useArtifacts.setState({
                selected: { id: current.id, version: Number(e.target.value) }
              })
            }
            data-testid="artifact-version"
          >
            {versions.map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
                {v.by === 'user' ? ` (${t('artifacts.byUser')})` : ''}
              </option>
            ))}
          </Select>
        )}
        {current && !isLatest && (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              void api.artifacts.restore(current.id, selected!.version).then(async (a) => {
                if (!a) return
                await load(conversationId)
                useArtifacts.setState({ selected: { id: a.id, version: a.version } })
              })
            }
          >
            <History />
            {t('artifacts.restore')}
          </Button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {current &&
            EXPORT_FORMATS[current.type].map((f) => (
              <Button
                key={f}
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={() => void doExport(f)}
                data-testid={`export-${f}`}
              >
                <Download className="size-3.5" />
                {f.toUpperCase()}
              </Button>
            ))}
          {current && (
            <Button
              size="icon-sm"
              variant="ghost"
              title={t('artifacts.reload')}
              aria-label={t('artifacts.reload')}
              onClick={() => setReload((n) => n + 1)}
            >
              <RotateCw />
            </Button>
          )}
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={t('artifacts.close')}
            onClick={() => setOpen(false)}
          >
            <X />
          </Button>
        </div>
      </div>
      {notice && (
        <p className="border-b px-3 py-1 text-xs break-all text-muted-foreground" role="status">
          {notice}
        </p>
      )}
      {current && selected ? (
        <iframe
          key={`${selected.id}:${selected.version}:${reload}`}
          ref={frame}
          title={current.title}
          // CHỈ allow-scripts: không same-origin, không popup, không form, không điều hướng trang chính.
          sandbox="allow-scripts"
          src={`mmc-artifact://view/${selected.id}/${selected.version}`}
          className="min-h-0 w-full flex-1 bg-white"
          data-testid="artifact-frame"
        />
      ) : (
        <div className="space-y-3 p-4 text-sm">
          <p className="text-muted-foreground">{t('artifacts.empty')}</p>
          <div className="text-xs font-medium">{t('artifacts.templates')}</div>
          <div className="grid gap-2">
            {templates.map((tpl) => (
              <Button
                key={tpl.id}
                variant="outline"
                className="justify-start"
                onClick={() => void send(tpl.prompt, mode)}
                data-testid={`template-${tpl.id}`}
              >
                <LayoutTemplate />
                {tpl.name}
              </Button>
            ))}
          </div>
        </div>
      )}
      {current && templates.length > 0 && (
        <details className="border-t px-3 py-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            {t('artifacts.templates')}
          </summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {templates.map((tpl) => (
              <Button
                key={tpl.id}
                size="sm"
                variant="outline"
                onClick={() => void send(tpl.prompt, mode)}
              >
                {tpl.name}
              </Button>
            ))}
          </div>
        </details>
      )}
    </aside>
  )
}
