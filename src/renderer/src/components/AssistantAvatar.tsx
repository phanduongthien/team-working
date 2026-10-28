import { cn } from '@renderer/lib/utils'

/** Avatar trợ lý: emoji chọn sẵn hoặc ảnh upload (data URL). */
export function AssistantAvatar({ avatar, className }: { avatar: string; className?: string }) {
  const base = 'inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted'
  if (avatar.startsWith('data:image/')) {
    return <img src={avatar} alt="" className={cn(base, 'object-cover', className)} />
  }
  return (
    <span aria-hidden className={cn(base, 'text-lg leading-none', className)}>
      {avatar}
    </span>
  )
}
