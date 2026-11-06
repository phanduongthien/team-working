import { Eye, LogIn, LogOut, Mail, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { gmailCredentialsSchema, type GmailPreviewItem, type GmailStatus } from '@shared/connectors'
import { Button } from '@renderer/components/ui/button'
import { Input, Label, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { daysLeft, invalid, isError, safeCall } from '../store'
import { ConnectionBadge, ErrorText, SetupSteps } from './shared'

function Credentials({
  status,
  onError
}: {
  status: GmailStatus
  onError(e: string | null): void
}) {
  const { t } = useTranslation('connectors')
  const [clientId, setClientId] = useState(status.clientId ?? '')
  const [secret, setSecret] = useState('')
  const [saved, setSaved] = useState(false)
  const save = async (): Promise<void> => {
    setSaved(false)
    const input = { clientId: clientId.trim(), clientSecret: secret.trim() || undefined }
    const bad = invalid(gmailCredentialsSchema, input)
    if (bad) return onError(bad)
    const r = await safeCall(api.gmail.setCredentials(input))
    if (isError(r)) return onError(r.error)
    onError(null)
    setSecret('')
    setSaved(true)
  }
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="gmail-client-id">{t('gmail.clientId')}</Label>
        <Input
          id="gmail-client-id"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          placeholder="123….apps.googleusercontent.com"
          data-testid="gmail-client-id"
        />
      </div>
      <div className="space-y-1 sm:col-span-2">
        <Label htmlFor="gmail-client-secret">{t('gmail.clientSecret')}</Label>
        <Input
          id="gmail-client-secret"
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={status.configured ? t('savedSecret') : ''}
          autoComplete="off"
          data-testid="gmail-client-secret"
        />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => void save()}
          disabled={!clientId.trim()}
          data-testid="gmail-save"
        >
          {t('save')}
        </Button>
        {saved && <span className="text-xs text-green-700 dark:text-green-400">{t('saved')}</span>}
      </div>
    </div>
  )
}

function Options({ status }: { status: GmailStatus }) {
  const { t } = useTranslation('connectors')
  const [blocked, setBlocked] = useState(status.blockedSenders.join('\n'))
  const save = (
    patch: Partial<Pick<GmailStatus, 'testingMode' | 'skipSensitive'>>,
    list = blocked
  ): void => {
    const blockedSenders = list
      .split(/[\n,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    void api.gmail.setOptions({
      testingMode: status.testingMode,
      skipSensitive: status.skipSensitive,
      blockedSenders,
      ...patch
    })
  }
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={status.skipSensitive}
          onChange={(e) => save({ skipSensitive: e.target.checked })}
          data-testid="gmail-skip-sensitive"
        />
        <span>
          <span className="block font-medium">{t('gmail.skipSensitive')}</span>
          <span className="block text-xs text-muted-foreground">
            {t('gmail.skipSensitiveHelp')}
          </span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={status.testingMode}
          onChange={(e) => save({ testingMode: e.target.checked })}
        />
        <span>
          <span className="block font-medium">{t('gmail.testingMode')}</span>
          <span className="block text-xs text-muted-foreground">{t('gmail.testingModeHelp')}</span>
        </span>
      </label>
      <div className="space-y-1">
        <Label htmlFor="gmail-blocked">{t('gmail.blocked')}</Label>
        <Textarea
          id="gmail-blocked"
          rows={3}
          value={blocked}
          onChange={(e) => setBlocked(e.target.value)}
          onBlur={() => save({})}
          placeholder={t('gmail.blockedPlaceholder')}
          data-testid="gmail-blocked"
        />
        <p className="text-xs text-muted-foreground">{t('gmail.blockedHelp')}</p>
      </div>
    </div>
  )
}

export function GmailSection({ status }: { status: GmailStatus }) {
  const { t } = useTranslation('connectors')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<GmailPreviewItem[] | null>(null)
  const left = daysLeft(status.expiresAt)

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setError(null)
    const r = await safeCall(fn())
    if (isError(r)) setError(r.error)
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5" data-testid="gmail-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Mail className="size-4" />
          Gmail
        </h2>
        {status.enabled && <ConnectionBadge state={status.connection} testId="gmail-connection" />}
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={status.enabled}
          onChange={(e) => void api.gmail.setEnabled(e.target.checked)}
          data-testid="gmail-enable"
        />
        <span>
          <span className="block text-sm font-medium">{t('gmail.enable')}</span>
          <span className="block text-xs text-muted-foreground">{t('gmail.enableHelp')}</span>
        </span>
      </label>

      {status.enabled && (
        <>
          <SetupSteps
            title={t('gmail.setupTitle')}
            steps={t('gmail.setup', { returnObjects: true }) as string[]}
            open={!status.configured}
          />
          <Credentials status={status} onError={setError} />

          {status.connection === 'expired' && (
            <p
              className="flex items-start gap-2 rounded-md bg-orange-500/10 p-3 text-sm text-orange-800 dark:text-orange-200"
              role="alert"
              data-testid="gmail-expired"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              {t('gmail.expired')}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {status.connection === 'connected' ? (
              <>
                <span className="text-sm" data-testid="gmail-email">
                  {t('gmail.connectedAs', { email: status.email })}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(async () => {
                      const r = await api.gmail.preview()
                      if (!isError(r)) setPreview(r)
                      return r
                    })
                  }
                  data-testid="gmail-preview"
                >
                  <Eye />
                  {t('gmail.preview')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void run(() => api.gmail.disconnect()).then(() => setPreview(null))
                  }
                  data-testid="gmail-disconnect"
                >
                  <LogOut />
                  {t('gmail.disconnect')}
                </Button>
              </>
            ) : status.connection === 'connecting' ? (
              <>
                <span className="text-sm text-muted-foreground">{t('gmail.waiting')}</span>
                <Button size="sm" variant="outline" onClick={() => void api.gmail.cancelConnect()}>
                  <X />
                  {t('cancel')}
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                disabled={!status.configured}
                onClick={() => void run(() => api.gmail.connect())}
                data-testid="gmail-connect"
              >
                <LogIn />
                {status.connection === 'expired' ? t('gmail.reconnect') : t('gmail.connect')}
              </Button>
            )}
          </div>
          {status.connection === 'connected' && left !== null && (
            <p
              className={
                left <= 1
                  ? 'text-xs text-orange-700 dark:text-orange-300'
                  : 'text-xs text-muted-foreground'
              }
              data-testid="gmail-expiry"
            >
              {t('gmail.expiresIn', { count: left })}
            </p>
          )}
          <ErrorText error={error} />

          {preview && (
            <ul
              className="space-y-1 rounded-md border p-3 text-xs"
              data-testid="gmail-preview-list"
            >
              {preview.length === 0 && (
                <li className="text-muted-foreground">{t('gmail.previewEmpty')}</li>
              )}
              {preview.map((m, i) => (
                <li key={i} className={m.hidden ? 'text-muted-foreground line-through' : ''}>
                  <span className="font-medium">{m.subject || t('gmail.noSubject')}</span> —{' '}
                  {m.from}
                  {m.hidden && <span className="ml-1 no-underline">({t('gmail.hidden')})</span>}
                </li>
              ))}
              <li className="pt-1 text-muted-foreground">{t('gmail.previewHelp')}</li>
            </ul>
          )}

          <Options key={status.blockedSenders.join(',')} status={status} />
        </>
      )}
    </section>
  )
}
