import { Eye, LogIn, LogOut, Mail, Plus, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  gmailAccountUpdateSchema,
  gmailCredentialsSchema,
  type GmailAccountStatus,
  type GmailAccountUpdate,
  type GmailPreviewItem,
  type GmailStatus
} from '@shared/connectors'
import { Button } from '@renderer/components/ui/button'
import { Input, Label, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { daysLeft, invalid, isError, parseBlocked, safeCall, useConnectors } from '../store'
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

/** Một tài khoản Gmail: tên gọi, cho trợ lý đọc, hạn đăng nhập, lọc riêng tư, kết nối lại / ngắt. */
function AccountRow({ account, busy }: { account: GmailAccountStatus; busy: boolean }) {
  const { t } = useTranslation('connectors')
  const [label, setLabel] = useState(account.label)
  const [blocked, setBlocked] = useState(account.blockedSenders.join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<GmailPreviewItem[] | null>(null)
  const patchGmail = useConnectors((s) => s.patchGmail)
  const left = daysLeft(account.expiresAt)
  // Đổi từ nơi khác (đồng bộ / hoàn tác) → ô nhập theo giá trị mới.
  const blockedText = account.blockedSenders.join('\n')
  // Chỉnh state ngay lúc render khi giá trị gốc đổi (cách React khuyên, không dùng effect).
  const [shown, setShown] = useState({ label: account.label, blocked: blockedText })
  if (shown.label !== account.label || shown.blocked !== blockedText) {
    setShown({ label: account.label, blocked: blockedText })
    if (shown.label !== account.label) setLabel(account.label)
    if (shown.blocked !== blockedText) setBlocked(blockedText)
  }
  const connected = account.connection === 'connected'

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setError(null)
    const r = await safeCall(fn())
    if (isError(r)) setError(r.error)
  }
  const save = (patch: Partial<GmailAccountUpdate>): void => {
    const input: GmailAccountUpdate = {
      id: account.id,
      label: label.trim(),
      enabled: account.enabled,
      skipSensitive: account.skipSensitive,
      blockedSenders: parseBlocked(blocked),
      ...patch
    }
    const bad = invalid(gmailAccountUpdateSchema, input)
    if (bad) {
      setError(bad)
      setLabel(account.label)
      return
    }
    setError(null)
    // Hiện ngay; lưu lỗi → hoàn tác (ô nhập tự về giá trị cũ theo account) + báo lỗi tại chỗ.
    void patchGmail(
      (s) => ({
        ...s,
        accounts: s.accounts.map((a) =>
          a.id === input.id
            ? { ...a, label: input.label, enabled: input.enabled, skipSensitive: input.skipSensitive, blockedSenders: input.blockedSenders }
            : a
        )
      }),
      () => api.gmail.updateAccount(input),
      (code) => {
        setError(code)
        setLabel(account.label)
        setBlocked(blockedText)
      }
    )
  }

  return (
    <li
      className="space-y-3 rounded-md border p-3"
      data-testid="gmail-account"
      data-email={account.email}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label={t('gmail.label')}
          className="h-8 w-40"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label.trim() !== account.label && save({ label: label.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          maxLength={40}
          data-testid="gmail-account-label"
        />
        <span className="text-sm text-muted-foreground" data-testid="gmail-email">
          {account.email}
        </span>
        <span className="ml-auto">
          <ConnectionBadge state={account.connection} testId="gmail-connection" />
        </span>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={account.enabled}
          onChange={(e) => save({ enabled: e.target.checked })}
          data-testid="gmail-account-enabled"
        />
        {t('gmail.accountEnabled')}
      </label>

      {account.connection === 'expired' && (
        <p
          className="flex items-start gap-2 rounded-md bg-orange-500/10 p-2 text-xs text-orange-800 dark:text-orange-200"
          role="alert"
          data-testid="gmail-expired"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {t('gmail.expired')}
        </p>
      )}
      {connected && left !== null && (
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

      <div className="flex flex-wrap items-center gap-2">
        {account.connection === 'connecting' ? (
          <>
            <span className="text-sm text-muted-foreground">{t('gmail.waiting')}</span>
            <Button size="sm" variant="outline" onClick={() => void api.gmail.cancelConnect()}>
              <X />
              {t('cancel')}
            </Button>
          </>
        ) : (
          <>
            {connected && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  void run(async () => {
                    const r = await api.gmail.preview(account.id)
                    if (!isError(r)) setPreview(r)
                    return r
                  })
                }
                data-testid="gmail-preview"
              >
                <Eye />
                {t('gmail.preview')}
              </Button>
            )}
            <Button
              size="sm"
              variant={connected ? 'outline' : 'default'}
              disabled={busy}
              onClick={() => void run(() => api.gmail.connect(account.id))}
              data-testid="gmail-reconnect"
            >
              <RefreshCw />
              {t('gmail.reconnect')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void run(() => api.gmail.disconnect(account.id))}
              data-testid="gmail-disconnect"
            >
              <LogOut />
              {t('gmail.disconnect')}
            </Button>
          </>
        )}
      </div>
      <ErrorText error={error} />

      {preview && (
        <ul className="space-y-1 rounded-md border p-3 text-xs" data-testid="gmail-preview-list">
          {preview.length === 0 && (
            <li className="text-muted-foreground">{t('gmail.previewEmpty')}</li>
          )}
          {preview.map((m, i) => (
            <li key={i} className={m.hidden ? 'text-muted-foreground line-through' : ''}>
              <span className="font-medium">{m.subject || t('gmail.noSubject')}</span> — {m.from}
              {m.hidden && <span className="ml-1 no-underline">({t('gmail.hidden')})</span>}
            </li>
          ))}
          <li className="pt-1 text-muted-foreground">{t('gmail.previewHelp')}</li>
        </ul>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          {t('gmail.privacy')}
        </summary>
        <div className="mt-2 space-y-3">
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={account.skipSensitive}
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
          <div className="space-y-1">
            <Label htmlFor={`gmail-blocked-${account.id}`}>{t('gmail.blocked')}</Label>
            <Textarea
              id={`gmail-blocked-${account.id}`}
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
      </details>
    </li>
  )
}

export function GmailSection({ status }: { status: GmailStatus }) {
  const { t } = useTranslation('connectors')
  const [error, setError] = useState<string | null>(null)
  const patchGmail = useConnectors((s) => s.patchGmail)
  const busy = status.adding || status.accounts.some((a) => a.connection === 'connecting')

  const add = async (): Promise<void> => {
    setError(null)
    const r = await safeCall(api.gmail.connect())
    if (isError(r)) setError(r.error)
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5" data-testid="gmail-section">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Mail className="size-4" />
          Gmail
        </h2>
        {status.enabled && status.accounts.length > 0 && (
          <span className="text-xs text-muted-foreground" data-testid="gmail-account-count">
            {t('gmail.accountCount', { count: status.accounts.length })}
          </span>
        )}
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={status.enabled}
          onChange={(e) => {
            const on = e.target.checked
            setError(null)
            void patchGmail((s) => ({ ...s, enabled: on }), () => api.gmail.setEnabled(on), setError)
          }}
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
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={status.testingMode}
              onChange={(e) => {
                const testingMode = e.target.checked
                void patchGmail((s) => ({ ...s, testingMode }), () => api.gmail.setOptions({ testingMode }), setError)
              }}
              data-testid="gmail-testing-mode"
            />
            <span>
              <span className="block font-medium">{t('gmail.testingMode')}</span>
              <span className="block text-xs text-muted-foreground">
                {t('gmail.testingModeHelp')}
              </span>
            </span>
          </label>

          {status.accounts.length > 0 && (
            <ul className="space-y-3" data-testid="gmail-accounts">
              {status.accounts.map((a) => (
                <AccountRow
                  // Chỉ theo id: đổi tên / danh sách chặn không dựng lại hàng (giữ thông báo lỗi khi hoàn tác).
                  key={a.id}
                  account={a}
                  busy={busy}
                />
              ))}
            </ul>
          )}

          <div className="space-y-2 rounded-md border border-dashed p-3">
            {status.adding ? (
              <div className="flex flex-wrap items-center gap-2" data-testid="gmail-adding">
                <span className="text-sm text-muted-foreground">{t('gmail.waiting')}</span>
                <Button size="sm" variant="outline" onClick={() => void api.gmail.cancelConnect()}>
                  <X />
                  {t('cancel')}
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant={status.accounts.length ? 'outline' : 'default'}
                disabled={!status.configured || busy}
                onClick={() => void add()}
                data-testid="gmail-add"
              >
                {status.accounts.length ? <Plus /> : <LogIn />}
                {t('gmail.addAccount')}
              </Button>
            )}
            <p className="text-xs text-muted-foreground" data-testid="gmail-test-users-hint">
              {t('gmail.testUsersHint')}
            </p>
          </div>
          <ErrorText error={error} />
        </>
      )}
    </section>
  )
}
