import { Check, Copy, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { teamInitials } from '@renderer/features/team/logic'
import { CreateOrJoin } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { cn } from '@renderer/lib/utils'
import { useAuth } from '@renderer/stores/auth'
import { useTeam } from '@renderer/stores/team'

/** Nút team trên thanh bên: đổi nhanh giữa các team, tạo hoặc tham gia thêm team từ bất kỳ màn hình nào. */
export function TeamSwitcher() {
  const { t } = useTranslation('team')
  const signedIn = useAuth((s) => s.status === 'signed_in')
  const { teams, currentTeamId, select } = useTeam()
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const current = teams.find((x) => x.id === currentTeamId)
  if (!signedIn || !current) return null

  const close = (): void => (setOpen(false), setAdding(false))

  return (
    <>
      <button
        type="button"
        title={t('switcher.label', { team: current.name })}
        aria-label={t('switcher.label', { team: current.name })}
        className="mb-2 flex size-10 items-center justify-center rounded-lg border bg-card text-xs font-semibold hover:bg-muted"
        onClick={() => setOpen(true)}
        data-testid="team-switcher"
      >
        {teamInitials(current.name) || '?'}
      </button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent title={adding ? t('switcher.add') : t('switcher.title')} className="max-w-lg">
          {adding ? (
            <CreateOrJoin compact onDone={close} />
          ) : (
            <div className="space-y-3">
              <ul className="space-y-1">
                {teams.map((x) => (
                  <li key={x.id}>
                    <button
                      type="button"
                      className={cn(
                        'flex w-full items-center gap-3 rounded-md border p-2 text-left hover:bg-muted',
                        x.id === currentTeamId && 'border-primary bg-primary/5'
                      )}
                      onClick={() => (void select(x.id), close())}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                        {teamInitials(x.name) || '?'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{x.name}</span>
                        <span className="block text-xs text-muted-foreground">{t(`roles.${x.role}`)}</span>
                      </span>
                      {x.id === currentTeamId && <Check className="size-4 text-primary" />}
                    </button>
                  </li>
                ))}
              </ul>
              <Button variant="outline" className="w-full" onClick={() => setAdding(true)}>
                <Plus />
                {t('switcher.add')}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

/** Hiện mã khôi phục sau khi người cuối cùng rời mà vẫn giữ team. */
export function RecoveryCodeDialog() {
  const { t } = useTranslation('team')
  const { recoveryCode, dismissRecoveryCode } = useTeam()
  const [copied, setCopied] = useState(false)

  return (
    <Dialog open={!!recoveryCode} onOpenChange={(o) => !o && (dismissRecoveryCode(), setCopied(false))}>
      <DialogContent title={t('recovery.title', { team: recoveryCode?.teamName })} description={t('recovery.body')}>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-muted px-3 py-2 text-center font-mono text-lg tracking-widest" data-testid="recovery-code">
              {recoveryCode?.code}
            </code>
            <Button
              variant="outline"
              size="icon"
              title={t('recovery.copy')}
              onClick={async () => {
                await navigator.clipboard.writeText(recoveryCode?.code ?? '')
                setCopied(true)
              }}
            >
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => (dismissRecoveryCode(), setCopied(false))}>{t('recovery.done')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
