import { useQueryClient } from '@tanstack/react-query'
import { MessageSquare, Plus, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { TeamGate } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useAuth } from '@renderer/stores/auth'
import { isManagerRole, useMyRole, useTeam } from '@renderer/stores/team'
import { useNotifications } from '../../notifications/store'
import { useMemberMap } from '../../work/components/helpers'
import { useFeedbackList } from '../api'
import { filterTab, type FeedbackTab } from '../logic'
import { ComposeDialog } from './ComposeDialog'
import { FeedbackBadges } from './FeedbackBadges'
import { FeedbackDetail } from './FeedbackDetail'
import { SummaryDialog } from './SummaryDialog'

function Body() {
  const { t, i18n } = useTranslation('feedback')
  const qc = useQueryClient()
  const uid = useAuth((s) => s.session?.user.id)
  const teamId = useTeam((s) => s.currentTeamId)
  const manager = isManagerRole(useMyRole())
  const members = useMemberMap()
  const list = useFeedbackList(teamId)
  const [params, setParams] = useSearchParams()
  const selectedId = params.get('id')
  const [tab, setTab] = useState<FeedbackTab>('board')
  const [dialog, setDialog] = useState<'compose' | 'summary' | null>(null)

  // Thông báo feedback mới tới (Realtime) → làm mới danh sách.
  const latestNotification = useNotifications((s) => s.items[0]?.id)
  useEffect(() => {
    if (latestNotification) void qc.invalidateQueries({ queryKey: ['feedback'] })
  }, [latestNotification, qc])

  const all = useMemo(() => list.data ?? [], [list.data])
  const tabs: FeedbackTab[] = manager ? ['board', 'received', 'sent', 'all'] : ['board', 'received', 'sent']
  const shown = filterTab(all, tab, uid)
  const selected = all.find((f) => f.id === selectedId)

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <h1 className="mr-auto text-xl font-semibold">{t('heading')}</h1>
        {manager && (
          <Button variant="outline" onClick={() => setDialog('summary')}>
            <Sparkles />
            {t('summarize')}
          </Button>
        )}
        <Button onClick={() => setDialog('compose')}>
          <Plus />
          {t('new')}
        </Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-96 shrink-0 flex-col border-r">
          <div className="flex gap-1 border-b p-2" role="tablist">
            {tabs.map((x) => (
              <button
                key={x}
                role="tab"
                aria-selected={tab === x}
                className={cn('rounded px-2.5 py-1 text-sm', tab === x ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                onClick={() => setTab(x)}
              >
                {t(`tabs.${x}`)}
              </button>
            ))}
          </div>
          <ul className="flex-1 divide-y overflow-y-auto">
            {shown.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">{t(`empty.${tab}`)}</li>}
            {shown.map((f) => {
              const author = f.author_id ? members.get(f.author_id)?.display_name : t('detail.anonymous')
              const recipient = f.recipient_id ? members.get(f.recipient_id)?.display_name : null
              return (
                <li key={f.id}>
                  <button
                    type="button"
                    className={cn('w-full space-y-1.5 px-4 py-3 text-left hover:bg-muted/50', f.id === selectedId && 'bg-muted')}
                    onClick={() => setParams({ id: f.id })}
                    data-testid="feedback-item"
                  >
                    <FeedbackBadges feedback={f} />
                    <p className="line-clamp-2 text-sm">{f.title || f.body}</p>
                    <p className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        {author}
                        {recipient && ` → ${recipient}`}
                      </span>
                      <span>·</span>
                      <span>{new Date(f.created_at).toLocaleDateString(i18n.language)}</span>
                      {f.reply_count > 0 && (
                        <span className="ml-auto flex items-center gap-1">
                          <MessageSquare className="size-3" />
                          {f.reply_count}
                        </span>
                      )}
                    </p>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>
        <section className="min-w-0 flex-1 overflow-y-auto p-6">
          {selected ? (
            <FeedbackDetail key={selected.id} feedback={selected} onDeleted={() => setParams({})} />
          ) : (
            <p className="text-sm text-muted-foreground">{t('detail.select')}</p>
          )}
        </section>
      </div>

      {dialog === 'compose' && <ComposeDialog open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === 'summary' && <SummaryDialog open onOpenChange={(o) => !o && setDialog(null)} list={all} />}
    </div>
  )
}

export function FeedbackPage() {
  return (
    <TeamGate>
      <Body />
    </TeamGate>
  )
}
