import { Check, Copy, OctagonX, Plus, ShieldAlert, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import type { NewAgentToken } from '@shared/agents'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Label } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useSync } from '@renderer/lib/sync'
import { cn } from '@renderer/lib/utils'
import { hhmm, useAgents } from '../store'
import { McpServersSection } from './McpServersSection'

function Card({ title, description, children, testId }: { title: string; description?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="space-y-4 rounded-lg border bg-card p-5" data-testid={testId}>
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function CopyBlock({ label, value, testId }: { label: string; value: string; testId?: string }) {
  const { t } = useTranslation('agents')
  const [copied, setCopied] = useState(false)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs font-medium">
        {label}
        <Button
          variant="ghost"
          size="sm"
          className="h-6"
          onClick={() => {
            void navigator.clipboard.writeText(value)
            setCopied(true)
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? t('common:actions.copied') : t('common:actions.copy')}
        </Button>
      </div>
      <pre className="max-h-48 overflow-auto rounded-md border bg-muted/50 p-2 text-[11px] break-all whitespace-pre-wrap" data-testid={testId}>
        {value}
      </pre>
    </div>
  )
}

export function AgentsPage() {
  const { t } = useTranslation('agents')
  const { status, exchanges, error, refreshStatus, refreshExchanges, setError, patchStatus } = useAgents()
  const [name, setName] = useState('')
  const [created, setCreated] = useState<NewAgentToken | null>(null)
  const [limits, setLimits] = useState<{ perHour: number; concurrency: number } | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  // Hỏi lại khi mở trang, khi quay về app và khi main báo đồng bộ — không làm mới định kỳ nữa.
  useSync('agents', refreshStatus)
  useSync('agentExchanges', refreshExchanges)

  if (!status) return null
  const currentLimits = limits ?? status.limits

  const toggle = async (on: boolean): Promise<void> => {
    setError(null)
    await patchStatus((s) => ({ ...s, enabled: on }), () => api.agents.setEnabled(on))
  }
  const create = async (): Promise<void> => {
    if (!name.trim()) return
    setCreated(await api.agents.createClient(name.trim()))
    setName('')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-6 py-8">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {t('title')}
            <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
              {t('experimental')}
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>

        <Card title={t('server.heading')} description={t('server.help')} testId="agents-server">
          <label className="flex items-start gap-3">
            <input type="checkbox" className="mt-1" checked={status.enabled} onChange={(e) => void toggle(e.target.checked)} data-testid="agents-enable" />
            <span>
              <span className="block text-sm font-medium">{t('server.enable')}</span>
              <span className="block text-xs text-muted-foreground">{t('server.enableHelp')}</span>
            </span>
          </label>
          {(error || status.error) && (
            <p className="text-sm text-destructive" role="alert" data-testid="agents-error">
              {t(`errors.${error ?? status.error}`, { defaultValue: error ?? status.error ?? '', port: status.port })}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm" data-testid="agents-server-status">
            <span className={cn('size-2 rounded-full', status.running ? 'bg-green-500' : 'bg-muted-foreground/40')} />
            {status.running ? t('server.running', { url: status.url }) : t('server.stopped')}
            {status.armed && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <ShieldAlert className="size-3.5" />
                {t('server.hotkey')}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="per-hour">{t('limits.perHour')}</Label>
              <Input
                id="per-hour"
                type="number"
                min={1}
                max={500}
                className="w-28"
                value={currentLimits.perHour}
                onChange={(e) => setLimits({ ...currentLimits, perHour: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="concurrency">{t('limits.concurrency')}</Label>
              <Input
                id="concurrency"
                type="number"
                min={1}
                max={4}
                className="w-28"
                value={currentLimits.concurrency}
                onChange={(e) => setLimits({ ...currentLimits, concurrency: Number(e.target.value) })}
              />
            </div>
            <Button
              variant="outline"
              disabled={!limits || currentLimits.perHour < 1 || currentLimits.concurrency < 1}
              onClick={() => {
                setLimits(null)
                void patchStatus((s) => ({ ...s, limits: currentLimits }), () => api.agents.setLimits(currentLimits))
              }}
              data-testid="agents-save-limits"
            >
              {t('common:actions.save')}
            </Button>
            <Button variant="destructive" className="ml-auto" disabled={!status.enabled} onClick={() => void api.agents.stopAll()} data-testid="agents-stop-all">
              <OctagonX />
              {t('server.stopAll')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('limits.help')}</p>
        </Card>

        <Card title={t('clients.heading')} description={t('clients.help')} testId="agents-clients">
          <div className="flex gap-2">
            <Input
              aria-label={t('clients.name')}
              placeholder={t('clients.namePlaceholder')}
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void create()}
            />
            <Button onClick={() => void create()} disabled={!name.trim()} data-testid="agents-add">
              <Plus />
              {t('clients.add')}
            </Button>
          </div>
          {status.clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('clients.empty')}</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {status.clients.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2" data-testid="agent-client">
                  <span className="font-medium">{c.name}</span>
                  <span className={cn('rounded px-1.5 py-0.5 text-xs', c.approved ? 'bg-green-500/15 text-green-700 dark:text-green-300' : 'bg-muted text-muted-foreground')}>
                    {c.approved ? t('clients.approved') : t('clients.waiting')}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {c.lastSeenAt ? t('clients.lastSeen', { time: new Date(c.lastSeenAt).toLocaleString() }) : t('clients.never')} ·{' '}
                    {t('clients.requests', { count: c.requestCount })}
                  </span>
                  <Button variant="ghost" size="sm" className="ml-auto" onClick={() =>
                      void patchStatus((s) => ({ ...s, clients: s.clients.filter((x) => x.id !== c.id) }), () => api.agents.revoke(c.id))
                    }
                    data-testid="agent-revoke"
                  >
                    <Trash2 />
                    {t('clients.revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t('history.heading')} description={t('history.help')} testId="agents-history">
          {exchanges.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
          ) : (
            <ul className="divide-y rounded-md border text-sm">
              {exchanges.map((e) => (
                <li key={e.id} data-testid="agent-exchange">
                  <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted/50" onClick={() => setExpanded(expanded === e.id ? null : e.id)}>
                    <span className="w-12 shrink-0 text-xs text-muted-foreground">{hhmm(e.createdAt)}</span>
                    <span className="w-28 shrink-0 truncate font-medium">{e.clientName}</span>
                    <span className="w-24 shrink-0 text-xs text-muted-foreground">{e.tool}</span>
                    <span className={cn('w-20 shrink-0 text-xs', e.status === 'done' ? 'text-green-700 dark:text-green-400' : e.status === 'error' || e.status === 'rejected' ? 'text-destructive' : 'text-muted-foreground')}>
                      {t(`history.status.${e.status}`)}
                    </span>
                    <span className="min-w-0 truncate text-xs">{e.input}</span>
                  </button>
                  {expanded === e.id && (
                    <div className="space-y-2 border-t bg-muted/30 px-3 py-2 text-xs">
                      <div>
                        <div className="font-medium">{t('history.request')}</div>
                        <p className="whitespace-pre-wrap">{e.input}</p>
                      </div>
                      {e.output && (
                        <div>
                          <div className="font-medium">{t('history.response')}</div>
                          <p className="whitespace-pre-wrap">{e.output}</p>
                        </div>
                      )}
                      {e.error && <p className="text-destructive">{t(`history.errors.${e.error}`, { defaultValue: e.error })}</p>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <McpServersSection />
      </div>

      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        {created && (
          <DialogContent title={t('token.title', { name: created.client.name })} className="max-w-2xl" data-testid="agent-token">
            <div className="space-y-3 text-sm">
              <p className="rounded-md bg-orange-500/10 p-2 text-orange-800 dark:text-orange-200">{t('token.once')}</p>
              <CopyBlock label={t('token.token')} value={created.token} testId="agent-token-value" />
              <CopyBlock label={t('token.claudeCode')} value={created.claudeCode} />
              <CopyBlock label={t('token.claudeDesktop')} value={created.claudeDesktop} />
              <p className="text-xs text-muted-foreground">{t('token.next')}</p>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
