import { cn } from '@renderer/lib/utils'

type Person = { display_name: string; avatar_url: string | null } | null | undefined

/** Avatar thành viên: ảnh GitHub nếu có, không thì chữ cái đầu. */
export function UserAvatar({ user, className }: { user: Person; className?: string }) {
  const base = 'inline-flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium'
  if (user?.avatar_url?.startsWith('https://')) {
    return <img src={user.avatar_url} alt="" className={cn(base, 'object-cover', className)} referrerPolicy="no-referrer" />
  }
  const initials = (user?.display_name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .slice(-2)
    .join('')
    .toUpperCase()
  return (
    <span aria-hidden className={cn(base, className)}>
      {initials}
    </span>
  )
}
