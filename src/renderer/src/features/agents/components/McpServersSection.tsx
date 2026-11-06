import { Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { McpServerType } from '@shared/agents'
import { Button } from '@renderer/components/ui/button'
import { Input, Label, Select, Textarea } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { useSync } from '@renderer/lib/sync'
import { parsePairs, useAgents } from '../store'

const EMPTY = { name: '', type: 'stdio' as McpServerType, command: '', args: '', url: '', secrets: '' }

/** MCP server người dùng thêm — Mizuki dùng như tool, mỗi lần gọi phải duyệt (trừ tool "luôn cho phép"). */
export function McpServersSection() {
  const { t } = useTranslation('agents')
  const { servers, refreshServers, patchServers } = useAgents()
  const [form, setForm] = useState(EMPTY)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Danh sách đổi cả khi duyệt tool "luôn cho phép" ở trang Chat → tự hỏi lại khi main báo.
  useSync('mcpServers', refreshServers)

  const save = async (): Promise<void> => {
    setError(null)
    const base = { name: form.name.trim(), enabled: true }
    const input =
      form.type === 'stdio'
        ? { ...base, type: 'stdio' as const, command: form.command.trim(), args: form.args.split(/\r?\n/).map((a) => a.trim()).filter(Boolean), env: parsePairs(form.secrets, '='), headers: {} }
        : { ...base, type: 'http' as const, url: form.url.trim(), headers: parsePairs(form.secrets, ':'), env: {} }
    const r = await api.mcp.save(input).catch((err: Error) => ({ error: err.message }))
    if ('error' in r) return setError(r.error)
    setForm(EMPTY)
    setAdding(false)
    await refreshServers()
  }

  return (
    <section className="space-y-4 rounded-lg border bg-card p-5" data-testid="mcp-servers">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t('mcp.heading')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('mcp.help')}</p>
        </div>
        {!adding && (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)} data-testid="mcp-add">
            <Plus />
            {t('mcp.add')}
          </Button>
        )}
      </div>

      {servers.length === 0 && !adding && <p className="text-sm text-muted-foreground">{t('mcp.empty')}</p>}
      {servers.length > 0 && (
        <ul className="divide-y rounded-md border text-sm">
          {servers.map((s) => (
            <li key={s.id} className="space-y-1.5 px-3 py-2" data-testid="mcp-server">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    onChange={(e) => {
                      const enabled = e.target.checked
                      void patchServers(
                        (list) => list.map((x) => (x.id === s.id ? { ...x, enabled } : x)),
                        () => api.mcp.setEnabled(s.id, enabled)
                      )
                    }}
                    data-testid="mcp-server-enabled"
                  />
                  <span className="font-medium">{s.name}</span>
                </label>
                <code className="min-w-0 truncate text-xs text-muted-foreground">{s.type === 'stdio' ? [s.command, ...s.args].join(' ') : s.url}</code>
                {s.secretKeys.length > 0 && <span className="text-xs text-muted-foreground">{t('mcp.secretKeys', { keys: s.secretKeys.join(', ') })}</span>}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() =>
                    void patchServers(
                      (list) => list.filter((x) => x.id !== s.id),
                      () => api.mcp.remove(s.id)
                    )
                  }
                >
                  <Trash2 />
                  {t('mcp.remove')}
                </Button>
              </div>
              {s.alwaysAllow.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">{t('mcp.alwaysAllowed')}</span>
                  {s.alwaysAllow.map((tool) => (
                    <span key={tool} className="inline-flex items-center gap-1 rounded border bg-muted/60 px-1.5 py-0.5" data-testid="mcp-always-allowed">
                      {tool}
                      <button
                        type="button"
                        aria-label={t('mcp.revokeTool', { tool })}
                        onClick={async () => {
                          await api.mcp.revokeAlways(s.id, tool)
                          await refreshServers()
                        }}
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <div className="space-y-3 rounded-md border p-3" data-testid="mcp-form">
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label htmlFor="mcp-name">{t('mcp.name')}</Label>
              <Input id="mcp-name" placeholder="notion" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="mcp-type">{t('mcp.type')}</Label>
              <Select id="mcp-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as McpServerType })}>
                <option value="stdio">{t('mcp.types.stdio')}</option>
                <option value="http">{t('mcp.types.http')}</option>
              </Select>
            </div>
          </div>
          {form.type === 'stdio' ? (
            <>
              <div className="space-y-1">
                <Label htmlFor="mcp-command">{t('mcp.command')}</Label>
                <Input id="mcp-command" placeholder="npx" value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="mcp-args">{t('mcp.args')}</Label>
                <Textarea id="mcp-args" rows={3} value={form.args} onChange={(e) => setForm({ ...form, args: e.target.value })} />
              </div>
            </>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="mcp-url">URL</Label>
              <Input id="mcp-url" placeholder="https://…/mcp" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="mcp-secrets">{form.type === 'stdio' ? t('mcp.env') : t('mcp.headers')}</Label>
            <Textarea id="mcp-secrets" rows={2} value={form.secrets} placeholder={form.type === 'stdio' ? 'API_KEY=…' : 'Authorization: Bearer …'} onChange={(e) => setForm({ ...form, secrets: e.target.value })} />
            <p className="text-xs text-muted-foreground">{t('mcp.secretsHelp')}</p>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {t(`mcp.errors.${error}`, { defaultValue: error })}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => (setAdding(false), setForm(EMPTY), setError(null))}>
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={!form.name.trim()} data-testid="mcp-save">
              {t('common:actions.save')}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
