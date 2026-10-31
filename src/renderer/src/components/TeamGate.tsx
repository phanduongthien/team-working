import { LoaderCircle, LogIn, Plus } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AccountList } from '@renderer/components/AccountSwitcher'
import { Button } from '@renderer/components/ui/button'
import { Input, Label } from '@renderer/components/ui/input'
import { useAuth } from '@renderer/stores/auth'
import { useTeam } from '@renderer/stores/team'

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-lg space-y-4 px-6 py-16">{children}</div>
    </div>
  )
}

/** Hiện lỗi theo mã (tra trong namespace team rồi work), mã lạ thì hiện nguyên văn. */
export function TeamError({ code }: { code: string | null }) {
  const { t } = useTranslation(['team', 'work', 'feedback'])
  if (!code) return null
  return <p className="text-sm text-destructive">{t(`errors.${code}`, { ns: ['team', 'work', 'feedback'], defaultValue: code })}</p>
}

function SignIn() {
  const { t } = useTranslation('team')
  const { status, error, accounts, signInWithGitHub, cancelSignIn } = useAuth()
  const [remember, setRemember] = useState(true)
  return (
    <Card>
      <h1 className="text-2xl font-semibold">{t('signIn.heading')}</h1>
      <p className="text-sm text-muted-foreground">{t('signIn.body')}</p>
      {status === 'signing_in' ? (
        <div className="flex items-center gap-3">
          <LoaderCircle className="size-5 animate-spin" />
          <span className="text-sm">{t('signIn.waiting')}</span>
          <Button variant="ghost" size="sm" onClick={() => void cancelSignIn()}>
            {t('signIn.cancel')}
          </Button>
        </div>
      ) : (
        <>
          {accounts.length > 0 && (
            <div className="space-y-1 rounded-lg border p-2">
              <div className="px-1 text-xs font-medium text-muted-foreground">{t('accounts.quickSignIn')}</div>
              <AccountList />
            </div>
          )}
          <Button
            size="lg"
            onClick={() => void signInWithGitHub({ remember, selectAccount: accounts.length > 0 })}
          >
            <LogIn />
            {accounts.length > 0 ? t('accounts.add') : t('signIn.button')}
          </Button>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} data-testid="signin-remember" />
            {t('accounts.rememberLabel')}
          </label>
        </>
      )}
      <TeamError code={error} />
    </Card>
  )
}

export function CreateOrJoin({ compact = false, onDone }: { compact?: boolean; onDone?(): void }) {
  const { t } = useTranslation('team')
  const { createTeam, acceptInvite, pendingInvites } = useTeam()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      onDone?.()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onCreate = (e: FormEvent): void => {
    e.preventDefault()
    if (name.trim()) void run(() => createTeam(name.trim()))
  }
  const onJoin = (e: FormEvent): void => {
    e.preventDefault()
    if (code.trim()) void run(() => acceptInvite(code))
  }

  return (
    <div className="space-y-5">
      {!compact && <h1 className="text-2xl font-semibold">{t('onboard.heading')}</h1>}
      {pendingInvites.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-card p-4">
          <h2 className="font-medium">{t('onboard.pending')}</h2>
          {pendingInvites.map((inv) => (
            <Button key={inv.code} variant="outline" disabled={busy} onClick={() => void run(() => acceptInvite(inv.code))}>
              <LogIn />
              {t('onboard.accept', { team: inv.team_name, role: t(`roles.${inv.role}`) })}
            </Button>
          ))}
        </div>
      )}
      <form onSubmit={onCreate} className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="font-medium">{t('onboard.create')}</h2>
        <Label htmlFor="team-name">{t('onboard.teamName')}</Label>
        <div className="flex gap-2">
          <Input id="team-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" disabled={busy || !name.trim()}>
            <Plus />
            {t('onboard.createButton')}
          </Button>
        </div>
      </form>
      <form onSubmit={onJoin} className="space-y-2 rounded-lg border bg-card p-4">
        <h2 className="font-medium">{t('onboard.join')}</h2>
        <Label htmlFor="invite-code">{t('onboard.code')}</Label>
        <div className="flex gap-2">
          <Input id="invite-code" value={code} maxLength={20} className="font-mono uppercase" onChange={(e) => setCode(e.target.value)} />
          <Button type="submit" variant="outline" disabled={busy || !code.trim()}>
            {t('onboard.joinButton')}
          </Button>
        </div>
      </form>
      <TeamError code={error} />
    </div>
  )
}

/**
 * Bọc các màn hình cần team: chưa cấu hình → giải thích; chưa đăng nhập → đăng nhập GitHub;
 * chưa có team → tạo/tham gia; có team → hiện nội dung.
 */
export function TeamGate({ children, requireTeam = true }: { children: ReactNode; requireTeam?: boolean }) {
  const { t } = useTranslation('team')
  const status = useAuth((s) => s.status)
  const { loaded, currentTeamId } = useTeam()

  if (status === 'disabled') {
    return (
      <Card>
        <h1 className="text-2xl font-semibold">{t('notConfigured.heading')}</h1>
        <p className="text-sm text-muted-foreground">{t('notConfigured.body')}</p>
      </Card>
    )
  }
  if (status === 'loading' || (status === 'signed_in' && !loaded)) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }
  if (status !== 'signed_in') return <SignIn />
  if (!currentTeamId && requireTeam) {
    return (
      <Card>
        <CreateOrJoin />
      </Card>
    )
  }
  return <>{children}</>
}
