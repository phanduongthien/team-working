import { LogOut, MessageCircle, RefreshCw, ShieldAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  TELEGRAM_MODES,
  telegramCodeSchema,
  telegramCredentialsSchema,
  telegramPasswordSchema,
  telegramPhoneSchema,
  type TelegramMode,
  type TelegramStatus
} from '@shared/connectors'
import { Button } from '@renderer/components/ui/button'
import { Input, Label, Select } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { invalid, isError, safeCall, toggleChat, useConnectors } from '../store'
import { ConnectionBadge, ErrorText, SetupSteps } from './shared'

function Credentials({
  status,
  onError
}: {
  status: TelegramStatus
  onError(e: string | null): void
}) {
  const { t } = useTranslation('connectors')
  const [apiId, setApiId] = useState(status.apiId ? String(status.apiId) : '')
  const [hash, setHash] = useState('')
  const [saved, setSaved] = useState(false)
  const save = async (): Promise<void> => {
    setSaved(false)
    const input = { apiId: Number(apiId), apiHash: hash.trim() || undefined }
    const bad = invalid(telegramCredentialsSchema, input)
    if (bad) return onError(bad)
    const r = await safeCall(api.telegram.setCredentials(input))
    if (isError(r)) return onError(r.error)
    onError(null)
    setHash('')
    setSaved(true)
  }
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor="tg-api-id">api_id</Label>
        <Input
          id="tg-api-id"
          inputMode="numeric"
          value={apiId}
          onChange={(e) => setApiId(e.target.value.replace(/\D/g, ''))}
          data-testid="tg-api-id"
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="tg-api-hash">api_hash</Label>
        <Input
          id="tg-api-hash"
          type="password"
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder={status.configured ? t('savedSecret') : ''}
          autoComplete="off"
          data-testid="tg-api-hash"
        />
      </div>
      <div className="flex items-center gap-2 sm:col-span-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void save()}
          disabled={!apiId}
          data-testid="tg-save"
        >
          {t('save')}
        </Button>
        {saved && <span className="text-xs text-green-700 dark:text-green-400">{t('saved')}</span>}
      </div>
    </div>
  )
}

/** Đăng nhập từng bước: số điện thoại → mã → (mật khẩu 2 bước). */
function Login({ status, onError }: { status: TelegramStatus; onError(e: string | null): void }) {
  const { t } = useTranslation('connectors')
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const step = status.connection
  const submit = async (): Promise<void> => {
    onError(null)
    const v = step === 'password_needed' ? value : value.trim()
    const schema =
      step === 'code_sent'
        ? telegramCodeSchema
        : step === 'password_needed'
          ? telegramPasswordSchema
          : telegramPhoneSchema
    const bad = invalid(schema, v)
    if (bad) return onError(bad)
    setBusy(true)
    const r = await safeCall(
      step === 'code_sent'
        ? api.telegram.signIn(v)
        : step === 'password_needed'
          ? api.telegram.password(v)
          : api.telegram.sendCode(v)
    )
    setBusy(false)
    if (isError(r)) return onError(r.error)
    setValue('')
  }
  const label =
    step === 'code_sent'
      ? t('telegram.code')
      : step === 'password_needed'
        ? t('telegram.password')
        : t('telegram.phone')
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Label htmlFor="tg-login">{label}</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="tg-login"
          className="max-w-xs"
          type={step === 'password_needed' ? 'password' : 'text'}
          inputMode={step === 'code_sent' ? 'numeric' : undefined}
          placeholder={step === 'disconnected' ? '+84 912 345 678' : ''}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          data-testid="tg-login-input"
        />
        <Button
          size="sm"
          type="submit"
          disabled={busy || !value.trim() || !status.configured}
          data-testid="tg-login-submit"
        >
          {step === 'disconnected' ? t('telegram.sendCode') : t('telegram.signIn')}
        </Button>
        {step !== 'disconnected' && (
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={() => void api.telegram.cancelLogin()}
          >
            <X />
            {t('cancel')}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {step === 'code_sent'
          ? t('telegram.codeHelp')
          : step === 'password_needed'
            ? t('telegram.passwordHelp')
            : t('telegram.phoneHelp')}
      </p>
    </form>
  )
}

function Chats({ status }: { status: TelegramStatus }) {
  const { t } = useTranslation('connectors')
  const chats = useConnectors((s) => s.chats)
  const loadChats = useConnectors((s) => s.loadChats)
  const patchTelegram = useConnectors((s) => s.patchTelegram)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void loadChats().then(setError)
  }, [loadChats])

  // Hiện ngay (allowed tính lại tại chỗ), lưu sau; lỗi → hoàn tác. Không phải gọi Telegram lại.
  const setLists = async (lists: {
    mode: TelegramMode
    allow: string[]
    block: string[]
  }): Promise<void> => {
    setError(null)
    if (await patchTelegram((s) => ({ ...s, ...lists }), () => api.telegram.setLists(lists), setError))
      await loadChats()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="tg-mode">{t('telegram.mode')}</Label>
          <Select
            id="tg-mode"
            value={status.mode}
            onChange={(e) =>
              void setLists({
                mode: e.target.value as TelegramMode,
                allow: status.allow,
                block: status.block
              })
            }
            data-testid="tg-mode"
          >
            {TELEGRAM_MODES.map((m) => (
              <option key={m} value={m}>
                {t(`telegram.modes.${m}`)}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void loadChats(true).then(setError)}
          data-testid="tg-refresh"
        >
          <RefreshCw />
          {t('telegram.refresh')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t(`telegram.modeHelp.${status.mode}`)}</p>
      <ErrorText error={error} />
      {chats && (
        <ul className="max-h-80 divide-y overflow-y-auto rounded-md border" data-testid="tg-chats">
          {chats.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">{t('telegram.noChats')}</li>
          )}
          {chats.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
              data-testid={`tg-chat-${c.id}`}
            >
              <input
                type="checkbox"
                checked={c.allowed}
                disabled={c.locked}
                aria-label={c.title}
                onChange={(e) =>
                  void setLists({ mode: status.mode, ...toggleChat(status, c, e.target.checked) })
                }
              />
              <span className="min-w-0 flex-1 truncate">
                {c.title}
                <span className="ml-1 text-xs text-muted-foreground">
                  · {t(`telegram.kinds.${c.kind}`)}
                </span>
              </span>
              {c.unread > 0 && <span className="rounded bg-muted px-1.5 text-xs">{c.unread}</span>}
              {(c.sensitive || c.locked) && (
                <span
                  className="flex items-center gap-1 text-xs text-orange-700 dark:text-orange-300"
                  title={t(c.locked ? 'telegram.lockedHelp' : 'telegram.sensitiveHelp')}
                >
                  <ShieldAlert className="size-3.5" />
                  {t(c.locked ? 'telegram.locked' : 'telegram.sensitive')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function TelegramSection({ status }: { status: TelegramStatus }) {
  const { t } = useTranslation('connectors')
  const [error, setError] = useState<string | null>(null)
  const patchTelegram = useConnectors((s) => s.patchTelegram)
  const connected = status.connection === 'connected'

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5" data-testid="telegram-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <MessageCircle className="size-4" />
          Telegram
        </h2>
        {status.enabled && <ConnectionBadge state={status.connection} testId="tg-connection" />}
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={status.enabled}
          onChange={(e) => {
            const on = e.target.checked
            setError(null)
            void patchTelegram((s) => ({ ...s, enabled: on }), () => api.telegram.setEnabled(on), setError)
          }}
          data-testid="tg-enable"
        />
        <span>
          <span className="block text-sm font-medium">{t('telegram.enable')}</span>
          <span className="block text-xs text-muted-foreground">{t('telegram.enableHelp')}</span>
        </span>
      </label>

      {status.enabled && (
        <>
          <SetupSteps
            title={t('telegram.setupTitle')}
            steps={t('telegram.setup', { returnObjects: true }) as string[]}
            open={!status.configured}
          />
          {!connected && <Credentials status={status} onError={setError} />}
          {!connected && <Login status={status} onError={setError} />}
          {connected && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm" data-testid="tg-account">
                {t('telegram.connectedAs', { name: status.account?.name ?? '?' })}
                {status.account?.username && (
                  <span className="text-muted-foreground"> @{status.account.username}</span>
                )}
                {status.account?.phone && (
                  <span className="text-muted-foreground"> · {status.account.phone}</span>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void api.telegram.logout().then((r) => setError(isError(r) ? r.error : null))
                }
                data-testid="tg-logout"
              >
                <LogOut />
                {t('telegram.logout')}
              </Button>
            </div>
          )}
          <ErrorText error={error} />
          {connected && <Chats status={status} />}
        </>
      )}
    </section>
  )
}
