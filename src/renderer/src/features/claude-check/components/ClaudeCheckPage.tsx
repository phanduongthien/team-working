import { CircleAlert, CircleCheck, ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { useCliStatus } from '@renderer/stores/cli'

const INSTALL_COMMAND = 'irm https://claude.ai/install.ps1 | iex'
const LOGIN_COMMAND = 'claude'
const SETUP_DOCS = 'https://code.claude.com/docs/en/setup'

function Command({ value }: { value: string }) {
  return <code className="block rounded-md bg-muted px-3 py-2 font-mono text-sm select-all">{value}</code>
}

function Steps({ prefix, command }: { prefix: 'install' | 'login'; command: string }) {
  const { t } = useTranslation('claude-check')
  return (
    <ol className="list-decimal space-y-2 pl-5 text-sm">
      <li>{t(`${prefix}.step1`)}</li>
      <li className="space-y-2">
        <span>{t(`${prefix}.step2`)}</span>
        <Command value={command} />
      </li>
      <li>{t(`${prefix}.step3`)}</li>
    </ol>
  )
}

export function ClaudeCheckPage() {
  const { t } = useTranslation('claude-check')
  const { status, checking, check } = useCliStatus()

  useEffect(() => {
    if (!status) void check()
  }, [status, check])

  const ok = status?.state === 'ok'

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-5 px-6 py-10">
        <h1 className="text-2xl font-semibold">{t('heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('intro')}</p>

        <div className="rounded-lg border bg-card p-5" data-testid="cli-status">
          {checking || !status ? (
            <div className="flex items-center gap-2 text-sm">
              <LoaderCircle className="size-5 animate-spin" />
              {t('checking')}
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`flex items-center gap-2 font-medium ${ok ? 'text-green-600' : 'text-destructive'}`}>
                {ok ? <CircleCheck className="size-5" /> : <CircleAlert className="size-5" />}
                {t(`state.${status.state}`)}
              </div>
              <div className="space-y-0.5 text-sm text-muted-foreground">
                {status.version && <div>{t('details.version', { version: status.version })}</div>}
                {status.subscriptionType && <div>{t('details.plan', { plan: status.subscriptionType })}</div>}
                {status.executablePath && <div className="break-all">{t('details.path', { path: status.executablePath })}</div>}
                {status.message && <div className="break-all text-destructive">{status.message}</div>}
              </div>
              {status.state === 'not_installed' && <Steps prefix="install" command={INSTALL_COMMAND} />}
              {status.state === 'not_logged_in' && <Steps prefix="login" command={LOGIN_COMMAND} />}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void check()} disabled={checking}>
            <RefreshCw />
            {t('recheck')}
          </Button>
          {ok && (
            <Button asChild>
              <Link to="/">{t('continue')}</Link>
            </Button>
          )}
          <Button variant="ghost" onClick={() => void api.app.openExternal(SETUP_DOCS)}>
            <ExternalLink />
            {t('docs')}
          </Button>
        </div>
      </div>
    </div>
  )
}
