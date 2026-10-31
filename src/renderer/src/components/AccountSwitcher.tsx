import { Check, KeyRound, LoaderCircle, LogOut, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Popover } from 'radix-ui'
import type { SavedAccount } from '@shared/types'
import { UserAvatar } from '@renderer/components/UserAvatar'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useAuth } from '@renderer/stores/auth'

const person = (a: Pick<SavedAccount, 'name' | 'login' | 'avatarUrl'>) => ({ display_name: a.name || a.login, avatar_url: a.avatarUrl })

/** Danh sách tài khoản đã đăng nhập trên máy: bấm để đổi (đã ghi nhớ thì đổi ngay, chưa thì mở trình duyệt). */
export function AccountList({ onPicked }: { onPicked?(): void }) {
  const { t } = useTranslation('team')
  const { accounts, session, switchingTo, switchAccount, forgetAccount } = useAuth()
  const others = accounts.filter((a) => a.id !== session?.user.id)
  if (others.length === 0) return null

  return (
    <ul className="space-y-1" data-testid="account-list">
      {others.map((a) => (
        <li key={a.id} className="group flex items-center gap-1">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-2 text-left hover:bg-muted disabled:opacity-60"
            disabled={!!switchingTo}
            onClick={() => void switchAccount(a.id).then(() => onPicked?.())}
            data-testid="account-item"
          >
            <UserAvatar user={person(a)} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{a.name || a.login}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {a.login && `@${a.login} · `}
                {a.remembered ? t('accounts.remembered') : t('accounts.needsSignIn')}
              </span>
            </span>
            {switchingTo === a.id ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              a.remembered && <KeyRound className="size-3.5 text-muted-foreground" aria-label={t('accounts.remembered')} />
            )}
          </button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            title={t('accounts.forget')}
            aria-label={t('accounts.forget')}
            onClick={() => void forgetAccount(a.id)}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  )
}

/** Nút tài khoản ở thanh bên: xem tài khoản đang dùng, ghi nhớ đăng nhập, đổi nhanh hoặc thêm tài khoản GitHub khác. */
export function AccountSwitcher() {
  const { t } = useTranslation('team')
  const { status, session, accounts, error, signInWithGitHub, signOut, setRemember } = useAuth()
  const [open, setOpen] = useState(false)
  if (status !== 'signed_in' || !session) return null
  const me = accounts.find((a) => a.id === session.user.id)
  const label = me ? me.name || me.login : session.user.email ?? ''

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          title={t('accounts.label', { name: label })}
          aria-label={t('accounts.label', { name: label })}
          className="mt-1 flex size-10 items-center justify-center rounded-lg hover:bg-muted"
          data-testid="account-switcher"
        >
          <UserAvatar user={me ? person(me) : null} className="size-8" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="right"
          align="end"
          sideOffset={8}
          className="z-50 w-80 space-y-3 rounded-lg border bg-card p-3 shadow-xl data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <div className="flex items-center gap-3">
            <UserAvatar user={me ? person(me) : null} className="size-10" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{label}</div>
              <div className="truncate text-xs text-muted-foreground">{me?.login ? `@${me.login}` : session.user.email}</div>
            </div>
            <Check className="size-4 text-primary" aria-label={t('accounts.current')} />
          </div>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border p-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={me?.remembered ?? false}
              onChange={(e) => void setRemember(e.target.checked)}
              data-testid="account-remember"
            />
            <span>
              <span className="block text-sm">{t('accounts.rememberLabel')}</span>
              <span className="block text-xs text-muted-foreground">{t('accounts.rememberHint')}</span>
            </span>
          </label>

          <div className={cn('space-y-1', accounts.length <= 1 && 'hidden')}>
            <div className="px-1 text-xs font-medium text-muted-foreground">{t('accounts.others')}</div>
            <AccountList onPicked={() => setOpen(false)} />
          </div>
          {error && <p className="text-sm text-destructive">{t(`errors.${error}`, { defaultValue: error })}</p>}

          <div className="space-y-1 border-t pt-2">
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={() => (setOpen(false), void signInWithGitHub({ remember: true, selectAccount: true }))}
              data-testid="account-add"
            >
              <UserPlus />
              {t('accounts.add')}
            </Button>
            <p className="px-2 text-xs text-muted-foreground">{t('accounts.addHint')}</p>
            <Button variant="ghost" className="w-full justify-start" onClick={() => (setOpen(false), void signOut())}>
              <LogOut />
              {t('signIn.signOut')}
            </Button>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
