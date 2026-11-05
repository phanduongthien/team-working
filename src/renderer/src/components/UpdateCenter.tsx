import { CircleAlert, Download, RefreshCw, TriangleAlert } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import type { UpdateSummary } from '@shared/update'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { api } from '@renderer/lib/api'
import { formatBytes, pendingCritical, useUpdate } from '@renderer/stores/update'

function ReleaseNotes({ info }: { info: UpdateSummary }) {
  const { t, i18n } = useTranslation()
  const date = info.releaseDate ? new Date(info.releaseDate) : null
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium" data-testid="update-version">
          {t('update.version', { version: info.version })}
        </span>
        {date && !Number.isNaN(date.getTime()) && (
          <span className="text-muted-foreground">· {date.toLocaleDateString(i18n.language)}</span>
        )}
        {info.critical && (
          <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
            {t('update.criticalTag')}
          </span>
        )}
      </div>
      {info.notes.length > 0 ? (
        // Ghi chú đã được main chuyển thành chữ thuần — hiển thị như text, không render HTML.
        <div
          className="max-h-64 space-y-3 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm"
          data-testid="update-notes"
        >
          {info.notes.map((n) => (
            <div key={n.version}>
              {info.notes.length > 1 && (
                <div className="mb-1 text-xs font-semibold text-muted-foreground">{n.version}</div>
              )}
              <p className="whitespace-pre-wrap">{n.text}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t('update.noNotes')}</p>
      )}
    </div>
  )
}

/** Hộp thoại cập nhật (có bản mới → tải có tiến trình → hỏi khởi động lại). Gắn một lần trong AppShell. */
export function UpdateDialog() {
  const { t } = useTranslation()
  const s = useUpdate((x) => x.state)
  useEffect(() => useUpdate.getState().init(), [])

  const open =
    (s.state === 'available' && s.prompt) ||
    s.state === 'downloading' ||
    (s.state === 'downloaded' && s.prompt) ||
    (s.state === 'error' && !!s.info)

  const onOpenChange = (next: boolean): void => {
    // Đóng hộp thoại (Esc, bấm ra ngoài) = "Để sau". Đang tải thì đóng được, tải vẫn chạy nền.
    if (!next && (s.state === 'available' || s.state === 'downloaded' || s.state === 'error'))
      void api.update.postpone()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {s.state === 'available' && (
        <DialogContent
          title={t('update.availableTitle')}
          description={s.info.title}
          className="max-w-lg"
          data-testid="update-dialog"
        >
          <ReleaseNotes info={s.info} />
          {s.info.critical && (
            <p className="mt-3 text-xs text-orange-700 dark:text-orange-300">
              {t('update.criticalHint')}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {!s.info.critical && (
              <Button variant="ghost" onClick={() => void api.update.skip()}>
                {t('update.skip')}
              </Button>
            )}
            <Button variant="outline" onClick={() => void api.update.postpone()}>
              {t('update.later')}
            </Button>
            <Button onClick={() => void api.update.download()}>
              <Download />
              {t('update.now')}
            </Button>
          </div>
        </DialogContent>
      )}
      {s.state === 'downloading' && (
        <DialogContent
          title={t('update.downloadingTitle', { version: s.info.version })}
          description={t('update.downloadingHint')}
          data-testid="update-progress"
        >
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(s.percent)}
          >
            <div
              className="h-full bg-primary transition-[width]"
              style={{ width: `${s.percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {Math.round(s.percent)}%
            {s.total > 0 && ` · ${formatBytes(s.transferred)} / ${formatBytes(s.total)}`}
          </p>
        </DialogContent>
      )}
      {s.state === 'downloaded' && (
        <DialogContent
          title={t('update.readyTitle', { version: s.info.version })}
          description={t('update.readyHint')}
          data-testid="update-ready"
        >
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => void api.update.postpone()}>
              {t('update.laterInstall')}
            </Button>
            <Button onClick={() => void api.update.install()}>
              <RefreshCw />
              {t('update.restart')}
            </Button>
          </div>
        </DialogContent>
      )}
      {s.state === 'error' && s.info && (
        <DialogContent title={t('update.errorTitle')} data-testid="update-error">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            {t('update.errorHint', { message: s.message })}
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => void api.update.postpone()}>
              {t('update.later')}
            </Button>
            <Button onClick={() => void api.update.download()}>{t('common:actions.retry')}</Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}

/** Banner cam mảnh trên đầu app khi còn bản bắt buộc chưa cài — không che nội dung (đẩy layout xuống). */
export function CriticalUpdateBanner() {
  const { t } = useTranslation()
  const s = useUpdate((x) => x.state)
  if (!pendingCritical(s) || !('info' in s) || !s.info) return null
  const label =
    s.state === 'downloaded'
      ? t('update.bannerReady', { version: s.info.version })
      : s.state === 'downloading'
        ? t('update.bannerDownloading', { version: s.info.version, percent: Math.round(s.percent) })
        : t('update.bannerAvailable', { version: s.info.version })
  const onClick = (): void => {
    if (s.state === 'downloaded') void api.update.install()
    else if (s.state !== 'downloading') void api.update.download()
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={s.state === 'downloading'}
      data-testid="critical-update-banner"
      className="flex w-full shrink-0 items-center justify-center gap-2 bg-orange-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-orange-600 disabled:cursor-default disabled:hover:bg-orange-500"
    >
      <TriangleAlert className="size-3.5" />
      {label}
    </button>
  )
}
