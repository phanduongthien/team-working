import { FolderOpen, RotateCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  EXPRESS_LEVELS,
  EXPRESS_MODES,
  type ExpressiveStatus,
  type ExpressMode
} from '@shared/expressive'
import { Button } from '@renderer/components/ui/button'
import { Input, Label, Select } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'

/** Cài đặt chat biểu cảm: mức độ (có "Tự động"), key GIPHY, thư mục sticker. */
export function ExpressiveSettings() {
  const { t } = useTranslation('chat')
  const [status, setStatus] = useState<ExpressiveStatus | null>(null)
  const [key, setKey] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)

  useEffect(() => void api.expressive.status().then(setStatus), [])
  if (!status) return null
  const { settings } = status

  const save = async (patch: Partial<ExpressiveStatus['settings']>): Promise<void> =>
    setStatus(await api.expressive.setSettings({ ...settings, ...patch }))
  const saveKey = async (value: string | null): Promise<void> => {
    setKeyError(null)
    try {
      const r = await api.expressive.setGiphyKey(value)
      if ('error' in r) setKeyError(r.error)
      else {
        setStatus(r)
        setKey('')
      }
    } catch {
      setKeyError('invalid_key')
    }
  }

  return (
    <div className="space-y-5" id="expressive" data-testid="expressive-settings">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="express-mode">{t('expressive.settings.mode')}</Label>
          <Select
            id="express-mode"
            value={settings.mode}
            onChange={(e) => void save({ mode: e.target.value as ExpressMode })}
          >
            {EXPRESS_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`expressive.modes.${m}`)}
              </option>
            ))}
          </Select>
        </div>
        {settings.mode === 'auto' && (
          <div className="space-y-1.5">
            <Label htmlFor="express-max">{t('expressive.settings.max')}</Label>
            <Select
              id="express-max"
              value={settings.max}
              onChange={(e) =>
                void save({ max: e.target.value as ExpressiveStatus['settings']['max'] })
              }
            >
              {EXPRESS_LEVELS.filter((l) => l !== 'off').map((l) => (
                <option key={l} value={l}>
                  {t(`expressive.modes.${l}`)}
                </option>
              ))}
            </Select>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {t(`expressive.settings.help.${settings.mode}`)}
      </p>
      {settings.mode === 'auto' && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md bg-muted/50 px-3 py-2 text-sm"
          data-testid="express-auto-status"
        >
          <span>
            {t('expressive.settings.current', { level: t(`expressive.modes.${status.autoLevel}`) })}
            {status.trend !== 'steady' && ` → ${t(`expressive.settings.trend.${status.trend}`)}`}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={status.autoLevel === 'low'}
            onClick={() => void api.expressive.resetAuto().then(setStatus)}
          >
            <RotateCcw />
            {t('expressive.settings.reset')}
          </Button>
          <p className="w-full text-xs text-muted-foreground">
            {t('expressive.settings.autoPrivacy')}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="giphy-key">{t('expressive.settings.giphyKey')}</Label>
        <p className="text-xs text-muted-foreground" data-testid="giphy-key-status">
          {t(`expressive.settings.giphyKeyStatus.${status.giphyKey ?? 'none'}`)}
        </p>
        <div className="flex gap-2">
          <Input
            id="giphy-key"
            type="password"
            autoComplete="off"
            value={key}
            placeholder={t('expressive.settings.giphyKeyPlaceholder')}
            onChange={(e) => setKey(e.target.value)}
          />
          <Button variant="outline" disabled={!key.trim()} onClick={() => void saveKey(key.trim())}>
            {t('common:actions.save')}
          </Button>
          {status.giphyKey === 'user' && (
            <Button variant="ghost" onClick={() => void saveKey(null)}>
              {t('expressive.settings.removeKey')}
            </Button>
          )}
        </div>
        {keyError && (
          <p className="text-xs text-destructive" role="alert">
            {t(`expressive.settings.keyErrors.${keyError}`, {
              defaultValue: t('expressive.settings.keyErrors.invalid_key')
            })}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {t('expressive.settings.giphyHelp')}{' '}
          <button
            type="button"
            className="text-primary underline"
            onClick={() => void api.app.openExternal('https://developers.giphy.com/dashboard/')}
          >
            developers.giphy.com
          </button>
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          onClick={() => void api.expressive.openStickersFolder()}
          data-testid="open-stickers"
        >
          <FolderOpen />
          {t('expressive.settings.openStickers')}
        </Button>
        <span className="text-xs break-all text-muted-foreground">{status.stickersDir}</span>
      </div>
    </div>
  )
}
