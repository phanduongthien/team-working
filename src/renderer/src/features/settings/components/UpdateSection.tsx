import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UPDATE_CHANNELS, type UpdateSettings } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { optimistic, useSyncedState } from '@renderer/lib/sync'
import { useUpdate } from '@renderer/stores/update'

/** Tự kiểm tra bản mới, kênh stable/beta, nút "Kiểm tra ngay". */
export function UpdateSection() {
  const { t } = useTranslation('settings')
  const { data: settings, setData: setSettings } = useSyncedState('update', () => api.update.getSettings())
  const update = useUpdate((s) => s.state)

  if (!settings) return null

  // Hiện ngay khi bấm (không đợi IPC), lưu sau; lỗi → hoàn tác + báo lỗi chung.
  const save = async (patch: Partial<UpdateSettings>): Promise<void> => {
    const next = { autoCheck: settings.autoCheck, channel: settings.channel, ...patch }
    await optimistic({
      topic: 'update',
      apply: () => setSettings({ ...settings, ...next }),
      rollback: () => setSettings(settings),
      save: () => api.update.setSettings(next)
    })
  }

  const status = (() => {
    switch (update.state) {
      case 'unsupported':
        return t('update.status.unsupported')
      case 'checking':
        return t('update.status.checking')
      case 'none':
        return t('update.status.none')
      case 'available':
        return t('update.status.available', { version: update.info.version })
      case 'downloading':
        return t('update.status.downloading', { version: update.info.version, percent: Math.round(update.percent) })
      case 'downloaded':
        return t('update.status.downloaded', { version: update.info.version })
      case 'error':
        return t('update.status.error', { message: update.message })
      default:
        return ''
    }
  })()

  const busy = update.state === 'checking' || update.state === 'downloading'
  const pending = update.state === 'available' || update.state === 'downloaded'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <div>{t('update.current', { version: settings.currentVersion })}</div>
          {status && (
            <div className="text-xs text-muted-foreground" data-testid="update-status">
              {status}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {pending && (
            <Button size="sm" onClick={() => void api.update.check()}>
              {t('update.view')}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={busy || update.state === 'unsupported'}
            onClick={() => void api.update.check()}
          >
            <RefreshCw />
            {t('update.checkNow')}
          </Button>
        </div>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={settings.autoCheck}
          onChange={(e) => void save({ autoCheck: e.target.checked })}
          data-testid="update-auto-check"
        />
        <span>
          <span className="block text-sm font-medium">{t('update.autoCheck')}</span>
          <span className="block text-xs text-muted-foreground">{t('update.autoCheckHelp')}</span>
        </span>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t('update.channel')}</legend>
        {UPDATE_CHANNELS.map((c) => (
          <label key={c} className="flex items-start gap-3">
            <input
              type="radio"
              name="update-channel"
              className="mt-1"
              checked={settings.channel === c}
              onChange={() => void save({ channel: c })}
            />
            <span>
              <span className="block text-sm">{t(`update.channels.${c}.name`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`update.channels.${c}.description`)}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  )
}
