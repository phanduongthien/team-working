import { Camera, Eye, EyeOff, FolderOpen, OctagonX, ShieldAlert, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ScreenPreview } from '@shared/computer'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { api } from '@renderer/lib/api'
import { useRefreshOnFocus } from '@renderer/lib/useRefreshOnFocus'
import { formatHotkey, useComputer } from '../store'
import { SidecarSection } from './SidecarSection'

/** Hộp thoại cảnh báo bắt buộc trước lần bật đầu tiên. */
function WarningDialog({ open, onOpenChange, hotkey }: { open: boolean; onOpenChange(open: boolean): void; hotkey: string }) {
  const { t } = useTranslation('computer')
  const setEnabled = useComputer((s) => s.setEnabled)
  useRefreshOnFocus(useComputer((s) => s.refresh))
  const error = useComputer((s) => s.error)
  const [read, setRead] = useState(false)
  const points = t('warning.points', { returnObjects: true, hotkey }) as string[]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('warning.title')} className="max-w-lg" data-testid="computer-warning">
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2 rounded-md bg-orange-500/10 p-3 text-orange-800 dark:text-orange-200">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {t('warning.lead')}
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={read} onChange={(e) => setRead(e.target.checked)} />
            <span>{t('warning.confirm')}</span>
          </label>
          {/* Lỗi phải hiện NGAY trong hộp thoại — trang phía sau bị lớp phủ che. */}
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive" role="alert" data-testid="computer-warning-error">
              {t(`errors.${error}`, { defaultValue: error, hotkey })}
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="outline">{t('common:actions.cancel')}</Button>
          </DialogClose>
          <Button
            disabled={!read}
            onClick={async () => {
              if (await setEnabled(true, true)) onOpenChange(false)
            }}
          >
            {t('warning.accept')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ComputerPage() {
  const { t } = useTranslation('computer')
  const { status, error, setEnabled, setScreenAccess, emergencyStop, clearError } = useComputer()
  const [warning, setWarning] = useState(false)
  const [preview, setPreview] = useState<ScreenPreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)

  if (!status) return null
  const hotkey = formatHotkey(status.hotkey)

  const toggleEnabled = async (on: boolean): Promise<void> => {
    clearError()
    if (on && !status.warningAccepted) setWarning(true)
    else await setEnabled(on)
  }

  const takePreview = async (): Promise<void> => {
    const r = await api.computer.preview()
    if ('error' in r) {
      setPreview(null)
      setPreviewError(r.error)
    } else {
      setPreview(r)
      setPreviewError(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 px-6 py-8">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {t('title')}
            <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
              {t('experimental')}
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>

        <section className="space-y-4 rounded-lg border bg-card p-5">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={status.enabled}
              onChange={(e) => void toggleEnabled(e.target.checked)}
              data-testid="computer-enable"
            />
            <span>
              <span className="block text-sm font-medium">{t('enable')}</span>
              <span className="block text-xs text-muted-foreground">{t('enableHelp')}</span>
            </span>
          </label>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {t(`errors.${error}`, { defaultValue: error, hotkey })}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-sm" data-testid="hotkey-status">
            <ShieldAlert className="size-4 text-primary" />
            <span>{t('hotkey.label')}</span>
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs">{hotkey}</kbd>
            <span className={status.armed ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground'}>
              {status.armed ? t('hotkey.armed') : status.enabled ? t('hotkey.failed') : t('hotkey.off')}
            </span>
          </div>

          <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{t('modeView')}</div>
        </section>

        {status.enabled && status.armed && (
          <section className="space-y-4 rounded-lg border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">{t('screen.heading')}</h2>
                <p className="text-sm text-muted-foreground">{t('screen.help')}</p>
              </div>
              <Button
                variant={status.screenAccess ? 'default' : 'outline'}
                onClick={() => void setScreenAccess(!status.screenAccess)}
                data-testid="screen-access-page"
              >
                {status.screenAccess ? <Eye /> : <EyeOff />}
                {status.screenAccess ? t('screen.on') : t('screen.off')}
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => void takePreview()} data-testid="screen-preview">
                <Camera />
                {t('preview.button')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => void api.computer.openLogs()}>
                <FolderOpen />
                {t('logs')}
              </Button>
              <Button variant="destructive" size="sm" onClick={() => void emergencyStop()} data-testid="emergency-stop">
                <OctagonX />
                {t('stop.button')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('preview.help')}</p>
            {previewError && <p className="text-sm text-destructive">{previewError}</p>}
            {preview && (
              <figure className="space-y-1">
                <img
                  src={preview.dataUrl}
                  width={preview.width}
                  height={preview.height}
                  alt={t('preview.alt')}
                  className="max-w-full rounded border"
                  data-testid="screen-preview-image"
                />
                <figcaption className="text-xs whitespace-pre-line text-muted-foreground">{preview.description}</figcaption>
              </figure>
            )}
          </section>
        )}

        {status.enabled && <SidecarSection />}
      </div>
      <WarningDialog open={warning} onOpenChange={setWarning} hotkey={hotkey} />
    </div>
  )
}
