import { Download, Loader2, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  EDGE_VOICES,
  STT_MODELS,
  type VoiceComponent,
  type VoiceSettings as Settings
} from '@shared/voice'
import { Button } from '@renderer/components/ui/button'
import { Label, Select, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useVoice } from './store'

const mb = (n: number): string => (n >= 1000 ? `${(n / 1024).toFixed(1)} GB` : `${n} MB`)

/** Cài đặt giọng nói: bật/tắt, tải gói + model (báo dung lượng trước), nghe / đọc. */
export function VoiceSettings() {
  const { t } = useTranslation('chat')
  const status = useVoice((s) => s.status)
  const refresh = useVoice((s) => s.refresh)
  const speak = useVoice((s) => s.speak)
  const [vocab, setVocab] = useState<string | null>(null)
  if (!status) return null
  const { settings, installed, sizesMb, pack, outdated } = status
  const save = async (patch: Partial<Settings>): Promise<void> => {
    await api.voice.setSettings({ ...settings, ...patch })
    await refresh()
  }
  const busy = pack.state === 'installing'
  const install = async (c: VoiceComponent): Promise<void> => {
    await api.voice.install(c)
    await refresh()
  }

  const row = (c: VoiceComponent, label: string) => (
    <li
      key={c}
      className="flex flex-wrap items-center gap-2 py-1.5"
      data-testid={`voice-part-${c}`}
    >
      <span className="min-w-0 flex-1">
        {label} <span className="text-xs text-muted-foreground">({mb(sizesMb[c])})</span>
      </span>
      {installed[c] ? (
        <>
          <span className="text-xs text-green-700 dark:text-green-400">
            {t('voice.settings.installed')}
          </span>
          {c !== 'packages' && c !== 'cuda' && (
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('voice.settings.remove', { name: label })}
              onClick={() => void api.voice.removeModel(c).then(refresh)}
            >
              <Trash2 />
            </Button>
          )}
        </>
      ) : pack.state === 'installing' && pack.component === c ? (
        <span className="flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          {pack.total
            ? `${Math.round(((pack.received ?? 0) / pack.total) * 100)}%`
            : t('voice.settings.installing')}
          <Button
            variant="ghost"
            size="sm"
            aria-label={t('voice.settings.cancel')}
            onClick={() => void api.voice.cancel()}
          >
            <X />
          </Button>
        </span>
      ) : (c === 'packages' || c === 'cuda') && outdated.includes(c) ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void install(c)}
          data-testid={`voice-update-${c}`}
        >
          <Download />
          {t('voice.settings.update')}
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={busy || (c !== 'packages' && !installed.packages)}
          onClick={() => void install(c)}
        >
          <Download />
          {t('voice.settings.download', { size: mb(sizesMb[c]) })}
        </Button>
      )}
    </li>
  )

  return (
    <div className="space-y-5" id="voice" data-testid="voice-settings">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={settings.enabled}
          onChange={(e) => void save({ enabled: e.target.checked })}
          data-testid="voice-enable"
        />
        <span>
          <span className="block text-sm font-medium">{t('voice.settings.enable')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('voice.settings.enableHelp')}
          </span>
        </span>
      </label>

      {settings.enabled && (
        <>
          {!status.sidecarInstalled ? (
            <p className="rounded-md bg-muted/50 p-3 text-sm">{t('voice.settings.needSidecar')}</p>
          ) : (
            <div className="space-y-1">
              <div className="text-sm font-medium">{t('voice.settings.downloads')}</div>
              <p className="text-xs text-muted-foreground">
                {status.gpu
                  ? t('voice.settings.gpu', { name: status.gpu.name, vram: mb(status.gpu.vramMb) })
                  : t('voice.settings.noGpu')}
              </p>
              <ul className="divide-y text-sm">
                {row('packages', t('voice.settings.parts.packages'))}
                {status.gpu && row('cuda', t('voice.settings.parts.cuda'))}
                {row(
                  status.effectiveModel,
                  t('voice.settings.parts.model', { model: status.effectiveModel })
                )}
                {status.device === 'cuda' &&
                  status.effectiveModel !== 'small' &&
                  row('small', t('voice.settings.parts.fallback'))}
                {row('piper', t('voice.settings.parts.piper'))}
              </ul>
              {pack.state === 'error' && (
                <p className="text-xs text-destructive" role="alert">
                  {t(`voice.settings.errors.${pack.code}`, { message: pack.message })}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="stt-model">{t('voice.settings.sttModel')}</Label>
              <Select
                id="stt-model"
                value={settings.sttModel}
                onChange={(e) => void save({ sttModel: e.target.value as Settings['sttModel'] })}
              >
                <option value="auto">{t('voice.settings.auto')}</option>
                {STT_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m} ({mb(sizesMb[m])})
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                {t('voice.settings.using', {
                  model: status.effectiveModel,
                  device: status.device === 'cuda' ? 'GPU' : 'CPU'
                })}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="after-speech">{t('voice.settings.afterSpeech')}</Label>
              <Select
                id="after-speech"
                value={settings.afterSpeech}
                onChange={(e) =>
                  void save({ afterSpeech: e.target.value as Settings['afterSpeech'] })
                }
              >
                <option value="fill">{t('voice.settings.fill')}</option>
                <option value="send">{t('voice.settings.send')}</option>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vocab">{t('voice.settings.vocabulary')}</Label>
            <Textarea
              id="vocab"
              rows={2}
              placeholder="Unity, Blender, prefab, arigatou…"
              value={vocab ?? settings.vocabulary.join(', ')}
              onChange={(e) => setVocab(e.target.value)}
              onBlur={() => {
                if (vocab === null) return
                const words = [
                  ...new Set(
                    vocab
                      .split(/[,\n]/)
                      .map((w) => w.trim().slice(0, 40))
                      .filter(Boolean)
                  )
                ].slice(0, 200)
                setVocab(null)
                void save({ vocabulary: words })
              }}
            />
            <p className="text-xs text-muted-foreground">{t('voice.settings.vocabularyHelp')}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tts-engine">{t('voice.settings.engine')}</Label>
              <Select
                id="tts-engine"
                value={settings.engine}
                onChange={(e) => void save({ engine: e.target.value as Settings['engine'] })}
              >
                <option value="edge">{t('voice.settings.edge')}</option>
                <option value="piper">{t('voice.settings.piper')}</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tts-voice">{t('voice.settings.voice')}</Label>
              <Select
                id="tts-voice"
                value={settings.edgeVoice}
                disabled={settings.engine !== 'edge'}
                onChange={(e) => void save({ edgeVoice: e.target.value as Settings['edgeVoice'] })}
              >
                {EDGE_VOICES.map((v) => (
                  <option key={v} value={v}>
                    {t(`voice.settings.voices.${v}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tts-rate">{t('voice.settings.rate', { rate: settings.rate })}</Label>
              <input
                id="tts-rate"
                type="range"
                min={-50}
                max={100}
                step={10}
                value={settings.rate}
                className="w-full"
                onChange={(e) => void save({ rate: Number(e.target.value) })}
              />
            </div>
          </div>
          {settings.engine === 'edge' && (
            <p className="text-xs text-muted-foreground">{t('voice.settings.edgePrivacy')}</p>
          )}

          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.autoRead}
                onChange={(e) => void save({ autoRead: e.target.checked })}
              />
              {t('voice.settings.autoRead')}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.bargeIn}
                onChange={(e) => void save({ bargeIn: e.target.checked })}
              />
              {t('voice.settings.bargeIn')}
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              disabled={!installed.packages}
              onClick={() => void speak('voice-test', t('voice.settings.sample'))}
              data-testid="voice-test"
            >
              {t('voice.settings.test')}
            </Button>
            <span className="text-xs text-muted-foreground">{t('voice.settings.privacy')}</span>
          </div>
        </>
      )}
    </div>
  )
}
