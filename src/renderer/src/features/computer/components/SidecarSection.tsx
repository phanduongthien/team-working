import { CircleAlert, Download, Loader2, Search, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { api } from '@renderer/lib/api'
import { toMb, useComputer } from '../store'

/** Cài / huỷ / gỡ Python sidecar (đọc danh sách cửa sổ và cây UI). */
export function SidecarSection() {
  const { t } = useTranslation('computer')
  const state = useComputer((s) => s.sidecar)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [check, setCheck] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  if (!state) return null

  const install = async (): Promise<void> => {
    setActionError(null)
    setCheck(null)
    const r = await api.sidecar.install()
    if ('error' in r) setActionError(r.error)
  }
  const runCheck = async (): Promise<void> => {
    const r = await api.sidecar.check()
    setCheck('error' in r ? t('sidecar.checkFailed', { message: r.error }) : t('sidecar.checkOk', r))
  }
  const remove = async (): Promise<void> => {
    setConfirmRemove(false)
    setCheck(null)
    const r = await api.sidecar.uninstall()
    if ('error' in r) setActionError(r.error)
  }

  return (
    <section className="space-y-3 rounded-lg border bg-card p-5" data-testid="sidecar-section">
      <div>
        <h2 className="font-semibold">{t('sidecar.heading')}</h2>
        <p className="text-sm text-muted-foreground">{t('sidecar.help')}</p>
      </div>

      {(state.state === 'not_installed' || state.state === 'error') && (
        <>
          <p className="text-sm" data-testid="sidecar-size">
            {t('sidecar.size', { downloadMb: state.downloadMb, diskMb: state.diskMb })}
          </p>
          {state.state === 'error' && (
            <p className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert" data-testid="sidecar-error">
              <CircleAlert className="mt-0.5 size-4 shrink-0" />
              {t(`sidecar.errors.${state.code}`, { message: state.message })}
            </p>
          )}
          <Button onClick={() => void install()} data-testid="sidecar-install">
            <Download />
            {state.state === 'error' ? t('sidecar.retry') : t('sidecar.install')}
          </Button>
        </>
      )}

      {state.state === 'installing' && (
        <div className="space-y-2" data-testid="sidecar-progress">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>
              {t('sidecar.stepOf', { index: state.stepIndex, count: state.stepCount })} {t(`sidecar.steps.${state.step}`)}
            </span>
            {state.received !== undefined && (
              <span className="text-xs text-muted-foreground">
                {toMb(state.received)}
                {state.total ? ` / ${toMb(state.total)}` : ''} MB
              </span>
            )}
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.total ? Math.round(((state.received ?? 0) / state.total) * 100) : undefined}
          >
            {state.total ? (
              <div className="h-full bg-primary transition-[width]" style={{ width: `${((state.received ?? 0) / state.total) * 100}%` }} />
            ) : (
              <div className="h-full w-1/3 animate-pulse bg-primary/70" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t('sidecar.installingHint')}</p>
          <Button variant="outline" size="sm" onClick={() => void api.sidecar.cancel()} data-testid="sidecar-cancel">
            <X />
            {t('sidecar.cancel')}
          </Button>
        </div>
      )}

      {state.state === 'uninstalling' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('sidecar.removing')}
        </p>
      )}

      {state.state === 'installed' && (
        <>
          <p className="text-sm" data-testid="sidecar-installed">
            {t('sidecar.installed', { python: state.python, uv: state.uv, sizeMb: Math.round(state.sizeBytes / 1024 / 1024) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => void runCheck()} data-testid="sidecar-check">
              <Search />
              {t('sidecar.check')}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmRemove(true)} data-testid="sidecar-remove">
              <Trash2 />
              {t('sidecar.remove')}
            </Button>
          </div>
          {check && <p className="text-sm text-muted-foreground" data-testid="sidecar-check-result">{check}</p>}
        </>
      )}

      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      <Dialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <DialogContent title={t('sidecar.removeTitle')} description={t('sidecar.removeHint')}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => void remove()} data-testid="sidecar-remove-confirm">
              {t('sidecar.remove')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}
