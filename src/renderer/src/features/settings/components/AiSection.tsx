import { KeyRound, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AI_PROVIDERS, apiKeySchema, type AiProviderId, type AiSettings } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { Input, Label } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'

type AiState = AiSettings & { hasApiKey: boolean; secureStorage: boolean }

const CONSOLE_URL = 'https://platform.claude.com/settings/keys'

export function AiSection() {
  const { t } = useTranslation('settings')
  const [state, setState] = useState<AiState | null>(null)
  const [key, setKey] = useState('')
  const [keyError, setKeyError] = useState(false)

  const reload = async (): Promise<void> => setState(await api.settings.getAi())
  useEffect(() => {
    void api.settings.getAi().then(setState)
  }, [])

  if (!state) return null

  const save = async (patch: Partial<AiSettings>): Promise<void> => {
    await api.settings.setAi({ provider: state.provider, autoSuggestMemory: state.autoSuggestMemory, ...patch })
    await reload()
  }

  const saveKey = async (): Promise<void> => {
    if (!apiKeySchema.safeParse(key).success) {
      setKeyError(true)
      return
    }
    await api.settings.setApiKey(key.trim())
    setKey('')
    setKeyError(false)
    await reload()
  }

  const canUse = (p: AiProviderId): boolean => p === 'claude-cli' || state.hasApiKey

  return (
    <div className="space-y-5">
      <div className="space-y-2" role="radiogroup" aria-label={t('ai.provider')}>
        <Label>{t('ai.provider')}</Label>
        {AI_PROVIDERS.map((p) => (
          <label
            key={p}
            className={cn(
              'flex cursor-pointer items-start gap-3 rounded-md border p-3',
              state.provider === p && 'border-primary bg-primary/5',
              !canUse(p) && 'cursor-not-allowed opacity-60'
            )}
          >
            <input
              type="radio"
              name="ai-provider"
              className="mt-1"
              checked={state.provider === p}
              disabled={!canUse(p)}
              onChange={() => void save({ provider: p })}
            />
            <span>
              <span className="block text-sm font-medium">{t(`ai.providers.${p}.name`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`ai.providers.${p}.description`)}</span>
            </span>
          </label>
        ))}
        <Button asChild variant="link" size="sm" className="px-0">
          <Link to="/claude">{t('claude.open')}</Link>
        </Button>
      </div>

      <div className="space-y-2">
        <Label htmlFor="api-key">{t('ai.apiKey')}</Label>
        {!state.secureStorage ? (
          <p className="text-sm text-destructive">{t('ai.noSecureStorage')}</p>
        ) : state.hasApiKey ? (
          <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
            <span className="flex items-center gap-2">
              <KeyRound className="size-4" />
              {t('ai.keySaved')}
            </span>
            <Button variant="ghost" size="sm" onClick={async () => (await api.settings.clearApiKey(), reload())}>
              <Trash2 />
              {t('ai.removeKey')}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              id="api-key"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={key}
              onChange={(e) => {
                setKey(e.target.value)
                setKeyError(false)
              }}
            />
            <Button onClick={() => void saveKey()} disabled={!key.trim()}>
              {t('common:actions.save')}
            </Button>
          </div>
        )}
        {keyError && <p className="text-sm text-destructive">{t('ai.invalidKey')}</p>}
        <p className="text-xs text-muted-foreground">
          {t('ai.keyHelp')}{' '}
          <button type="button" className="text-primary underline" onClick={() => void api.app.openExternal(CONSOLE_URL)}>
            {t('ai.getKey')}
          </button>
        </p>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={state.autoSuggestMemory}
          onChange={(e) => void save({ autoSuggestMemory: e.target.checked })}
        />
        <span>
          <span className="block text-sm font-medium">{t('ai.autoSuggest')}</span>
          <span className="block text-xs text-muted-foreground">{t('ai.autoSuggestHelp')}</span>
        </span>
      </label>
    </div>
  )
}
