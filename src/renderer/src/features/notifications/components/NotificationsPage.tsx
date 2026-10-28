import { CheckCheck, Circle } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { TeamGate } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useTeam } from '@renderer/stores/team'
import { describeNotification } from '../describe'
import { useNotifications } from '../store'

function List() {
  const { t, i18n } = useTranslation('notifications')
  const navigate = useNavigate()
  const { items, unread, load, markRead, markAllRead } = useNotifications()
  const members = useTeam((s) => s.members)
  const nameOf = (id: string | undefined): string | undefined => members.find((m) => m.id === id)?.display_name

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 px-6 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">{t('heading')}</h1>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
              <CheckCheck />
              {t('markAll')}
            </Button>
          )}
        </div>
        {items.length === 0 && <p className="py-10 text-center text-muted-foreground">{t('empty')}</p>}
        <ul className="divide-y rounded-lg border bg-card">
          {items.map((n) => {
            const d = describeNotification(n, i18n.t, nameOf)
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={cn('flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50', !n.read_at && 'bg-primary/5')}
                  onClick={() => {
                    void markRead(n.id)
                    if (d.route) void navigate(d.route)
                  }}
                >
                  <Circle className={cn('mt-1.5 size-2 shrink-0', n.read_at ? 'invisible' : 'fill-primary text-primary')} aria-label={n.read_at ? undefined : t('markRead')} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{d.title}</div>
                    <div className="text-sm text-muted-foreground">{d.body}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(n.created_at).toLocaleString(i18n.language, { dateStyle: 'short', timeStyle: 'short' })}
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export function NotificationsPage() {
  return (
    <TeamGate>
      <List />
    </TeamGate>
  )
}
