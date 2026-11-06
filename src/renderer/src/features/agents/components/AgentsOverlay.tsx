import { Bot, TriangleAlert, Wrench, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { api } from '@renderer/lib/api'
import { hhmm, useAgents } from '../store'

/** Luôn gắn trong app: duyệt agent mới, duyệt lần gọi tool MCP, thông báo nhỏ (chạm giới hạn…). */
export function AgentsOverlay() {
  const { t } = useTranslation('agents')
  const status = useAgents((s) => s.status)
  const notices = useAgents((s) => s.notices)
  const approvals = useAgents((s) => s.approvals)
  const { dismissNotice, respondApproval } = useAgents()
  const pairing = status?.pending[0]
  const approval = approvals[0]

  return (
    <>
      {pairing && (
        <Dialog open>
          <DialogContent title={t('pairing.title')} data-testid="agent-pairing">
            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <Bot className="size-4" />
                {t('pairing.body', { name: pairing.name })}
              </p>
              <p className="text-muted-foreground">{t('pairing.hint')}</p>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="outline" onClick={() => void api.agents.respondPairing(pairing.clientId, false)}>
                {t('pairing.deny')}
              </Button>
              <Button onClick={() => void api.agents.respondPairing(pairing.clientId, true)}>{t('pairing.allow')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {!pairing && approval && (
        <Dialog open>
          <DialogContent title={t('mcpApproval.title')} className="max-w-lg" data-testid="mcp-approval">
            <div className="space-y-3 text-sm">
              <p className="flex items-center gap-2">
                <Wrench className="size-4" />
                {t('mcpApproval.body', { tool: approval.tool, server: approval.server })}
              </p>
              <pre className="max-h-60 overflow-auto rounded-md border bg-muted/50 p-3 text-xs whitespace-pre-wrap" data-testid="mcp-approval-input">
                {JSON.stringify(approval.input, null, 2)}
              </pre>
              <p className="text-xs text-muted-foreground">{t('mcpApproval.hint')}</p>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => void respondApproval(approval.id, 'deny')}>
                {t('mcpApproval.deny')}
              </Button>
              <Button variant="outline" onClick={() => void respondApproval(approval.id, 'always')}>
                {t('mcpApproval.always')}
              </Button>
              <Button onClick={() => void respondApproval(approval.id, 'once')}>{t('mcpApproval.once')}</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {notices.length > 0 && (
        <div className="pointer-events-none fixed top-14 right-4 z-50 flex flex-col items-end gap-2">
          {notices.map((n) => (
            <div
              key={n.key}
              role="status"
              data-testid={`agent-notice-${n.kind}`}
              className="pointer-events-auto flex max-w-sm items-start gap-2 rounded-lg border border-orange-500/40 bg-card px-3 py-2 text-xs shadow-lg"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-orange-600" />
              <span>
                {n.kind === 'rate_limited'
                  ? t('notice.rateLimited', { name: n.clientName, time: hhmm(n.at), minutes: Math.ceil(n.retryAfterSec / 60) })
                  : n.kind === 'queue_full'
                    ? t('notice.queueFull', { name: n.clientName, time: hhmm(n.at) })
                    : t('notice.stopped', { time: hhmm(n.at) })}
              </span>
              <button type="button" aria-label={t('notice.close')} onClick={() => dismissNotice(n.key)}>
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
