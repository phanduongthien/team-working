import { Check, Copy, LogOut, Plus, Trash2, UserMinus } from 'lucide-react'
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { TEAM_ROLES, type TeamRole } from '@shared/schemas'
import type { TeamInviteRow } from '@shared/supabase.types'
import { CreateOrJoin, TeamError, TeamGate } from '@renderer/components/TeamGate'
import { UserAvatar } from '@renderer/components/UserAvatar'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@renderer/components/ui/dialog'
import { Input, Label, Select } from '@renderer/components/ui/input'
import { useAuth } from '@renderer/stores/auth'
import { isManagerRole, useMyRole, useTeam } from '@renderer/stores/team'

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** Chạy thao tác, giữ mã lỗi để hiển thị. */
function useAction(): [string | null, (fn: () => Promise<unknown>) => Promise<void>] {
  const [error, setError] = useState<string | null>(null)
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message)
    }
  }, [])
  return [error, run]
}

function Members() {
  const { t } = useTranslation('team')
  const { members, changeRole, removeMember } = useTeam()
  const myRole = useMyRole()
  const uid = useAuth((s) => s.session?.user.id)
  const [error, run] = useAction()
  const [removing, setRemoving] = useState<{ id: string; name: string } | null>(null)

  return (
    <Section title={t('members.heading', { count: members.length })}>
      <ul className="divide-y">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2" data-testid="team-member">
            <UserAvatar user={m} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {m.display_name || m.github_username}
                {m.id === uid && <span className="ml-1 text-xs text-muted-foreground">({t('members.you')})</span>}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {[m.github_username && `@${m.github_username}`, m.skills.join(', ')].filter(Boolean).join(' · ')}
              </div>
            </div>
            {myRole === 'owner' ? (
              <Select
                aria-label={t('invites.role')}
                className="h-8 w-32 text-xs"
                value={m.role}
                onChange={(e) => void run(() => changeRole(m.id, e.target.value as TeamRole))}
              >
                {TEAM_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`roles.${r}`)}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="rounded bg-muted px-2 py-0.5 text-xs">{t(`roles.${m.role}`)}</span>
            )}
            {myRole === 'owner' && m.id !== uid && (
              <Button
                variant="ghost"
                size="icon-sm"
                title={t('members.remove')}
                onClick={() => setRemoving({ id: m.id, name: m.display_name })}
              >
                <UserMinus />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <TeamError code={error} />
      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent title={t('members.removeConfirm', { name: removing?.name })}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                if (removing) void run(() => removeMember(removing.id))
                setRemoving(null)
              }}
            >
              {t('members.remove')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Section>
  )
}

function Invites() {
  const { t, i18n } = useTranslation('team')
  const { currentTeamId, listInvites, createInvite, deleteInvite } = useTeam()
  const myRole = useMyRole()
  const [invites, setInvites] = useState<TeamInviteRow[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TeamRole>('member')
  const [copied, setCopied] = useState<string | null>(null)
  const [error, run] = useAction()

  const reload = useCallback(() => listInvites().then(setInvites), [listInvites])
  useEffect(() => {
    void listInvites().then(setInvites)
  }, [currentTeamId, listInvites])

  const onCreate = (e: FormEvent): void => {
    e.preventDefault()
    void run(async () => {
      await createInvite({ email: email.trim() || null, role })
      setEmail('')
      await reload()
    })
  }

  const roles: TeamRole[] = myRole === 'owner' ? ['member', 'manager'] : ['member']

  return (
    <Section title={t('invites.heading')}>
      <form className="space-y-2" onSubmit={onCreate}>
        <Label htmlFor="invite-email">{t('invites.byEmail')}</Label>
        <div className="flex gap-2">
          <Input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ten@example.com" />
          <Select aria-label={t('invites.role')} className="w-36" value={role} onChange={(e) => setRole(e.target.value as TeamRole)}>
            {roles.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </Select>
          <Button type="submit">
            <Plus />
            {t('invites.create')}
          </Button>
        </div>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">{t('invites.hint')}</p>
      <ul className="mt-3 divide-y">
        {invites.length === 0 && <li className="py-2 text-sm text-muted-foreground">{t('invites.empty')}</li>}
        {invites.map((inv) => (
          <li key={inv.id} className="flex items-center gap-3 py-2 text-sm" data-testid="team-invite">
            <code className="rounded bg-muted px-2 py-0.5 font-mono">{inv.code}</code>
            <span className="min-w-0 flex-1 truncate">
              {inv.email ?? t('invites.shareCode')} · {t(`roles.${inv.role}`)} ·{' '}
              <span className="text-muted-foreground">
                {t('invites.expires', { date: new Date(inv.expires_at).toLocaleDateString(i18n.language) })}
              </span>
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              title={t('invites.copy')}
              onClick={async () => {
                await navigator.clipboard.writeText(inv.code)
                setCopied(inv.id)
              }}
            >
              {copied === inv.id ? <Check /> : <Copy />}
            </Button>
            <Button variant="ghost" size="icon-sm" title={t('invites.revoke')} onClick={() => void run(async () => (await deleteInvite(inv.id), reload()))}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      <TeamError code={error} />
    </Section>
  )
}

function MyProfile() {
  const { t } = useTranslation('team')
  const { profile, updateProfile } = useAuth()
  const loadMembers = useTeam((s) => s.loadMembers)
  const [name, setName] = useState(profile?.display_name ?? '')
  const [skills, setSkills] = useState(profile?.skills.join(', ') ?? '')
  const [saved, setSaved] = useState(false)
  const [error, run] = useAction()

  return (
    <Section title={t('profile.heading')}>
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="display-name">{t('profile.displayName')}</Label>
          <Input id="display-name" value={name} maxLength={80} onChange={(e) => (setName(e.target.value), setSaved(false))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="skills">{t('profile.skills')}</Label>
          <Input id="skills" value={skills} placeholder="React, UI/UX, SQL" onChange={(e) => (setSkills(e.target.value), setSaved(false))} />
        </div>
        <div className="flex items-center justify-end gap-3">
          {saved && <Check className="size-4 text-muted-foreground" />}
          <Button
            onClick={() =>
              void run(async () => {
                const list = skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30)
                await updateProfile({ display_name: name.trim(), skills: list })
                await loadMembers()
                setSaved(true)
              })
            }
          >
            {t('profile.save')}
          </Button>
        </div>
        <TeamError code={error} />
      </div>
    </Section>
  )
}

function TeamHeader() {
  const { t } = useTranslation('team')
  const { teams, currentTeamId, select, renameTeam, leaveTeam } = useTeam()
  const signOut = useAuth((s) => s.signOut)
  const myRole = useMyRole()
  const team = teams.find((x) => x.id === currentTeamId)
  const [dialog, setDialog] = useState<'new' | 'rename' | 'leave' | null>(null)
  const [newName, setNewName] = useState('')
  const [error, run] = useAction()

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="mr-auto text-2xl font-semibold">{team?.name}</h1>
        {teams.length > 1 && (
          <Select aria-label={t('page.switch')} className="w-48" value={currentTeamId ?? ''} onChange={(e) => void select(e.target.value)}>
            {teams.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        )}
        {myRole === 'owner' && (
          <Button variant="outline" size="sm" onClick={() => (setNewName(team?.name ?? ''), setDialog('rename'))}>
            {t('page.rename')}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setDialog('new')}>
          <Plus />
          {t('page.newTeam')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setDialog('leave')}>
          {t('page.leave')}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut />
          {t('signIn.signOut')}
        </Button>
      </div>
      <TeamError code={error} />

      <Dialog open={dialog === 'new'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={t('page.newTeam')} className="max-w-lg">
          <CreateOrJoin compact />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === 'rename'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={t('page.rename')}>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              if (newName.trim()) void run(() => renameTeam(newName.trim()))
              setDialog(null)
            }}
          >
            <Input value={newName} maxLength={80} onChange={(e) => setNewName(e.target.value)} autoFocus />
            <div className="flex justify-end">
              <Button type="submit">{t('common:actions.save')}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === 'leave'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={t('page.leaveConfirm', { team: team?.name })}>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button variant="outline">{t('common:actions.cancel')}</Button>
            </DialogClose>
            <Button variant="destructive" onClick={() => (void run(leaveTeam), setDialog(null))}>
              {t('page.leave')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function TeamPage() {
  const myRole = useMyRole()
  return (
    <TeamGate>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5 px-6 py-8">
          <TeamHeader />
          <Members />
          {isManagerRole(myRole) && <Invites />}
          <MyProfile />
        </div>
      </div>
    </TeamGate>
  )
}
