import { Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router'
import { TeamGate } from '@renderer/components/TeamGate'
import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'
import { useAuth } from '@renderer/stores/auth'
import { isManagerRole, useMyRole, useTeam } from '@renderer/stores/team'
import { useMemberMap } from '../../work/components/helpers'
import { useMyPaths, useSharedPaths, useSteps } from '../api'
import { stepProgress } from '../logic'
import { NewPathDialog } from './NewPathDialog'
import { PathDetail } from './PathDetail'

type Tab = 'mine' | 'team'

function Body() {
  const { t } = useTranslation('learning')
  const uid = useAuth((s) => s.session?.user.id)
  const teamId = useTeam((s) => s.currentTeamId)
  const manager = isManagerRole(useMyRole())
  const members = useMemberMap()
  const [tab, setTab] = useState<Tab>('mine')
  const [params, setParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const mine = useMyPaths(uid)
  const shared = useSharedPaths(teamId, uid, manager)
  const paths = useMemo(() => (tab === 'mine' ? (mine.data ?? []) : (shared.data ?? [])), [tab, mine.data, shared.data])
  const steps = useSteps(paths.map((p) => p.id)).data ?? []
  const selected = paths.find((p) => p.id === params.get('path'))

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <h1 className="mr-auto text-xl font-semibold">{t('heading')}</h1>
        <Button onClick={() => setCreating(true)}>
          <Plus />
          {t('newPath')}
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-80 shrink-0 flex-col border-r">
          {manager && (
            <div className="flex gap-1 border-b p-2" role="tablist">
              {(['mine', 'team'] as const).map((x) => (
                <button
                  key={x}
                  role="tab"
                  aria-selected={tab === x}
                  className={cn('rounded px-2.5 py-1 text-sm', tab === x ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                  onClick={() => (setTab(x), setParams({}))}
                >
                  {t(`tabs.${x}`)}
                </button>
              ))}
            </div>
          )}
          <ul className="flex-1 divide-y overflow-y-auto">
            {paths.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">{tab === 'mine' ? t('empty') : t('emptyTeam')}</li>}
            {paths.map((p) => {
              const pr = stepProgress(steps.filter((s) => s.path_id === p.id))
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={cn('w-full space-y-1.5 px-4 py-3 text-left hover:bg-muted/50', p.id === selected?.id && 'bg-muted')}
                    onClick={() => setParams({ path: p.id })}
                    data-testid="learning-path"
                  >
                    <div className="text-sm font-medium">{p.title}</div>
                    {tab === 'team' && <div className="text-xs text-muted-foreground">{t('by', { name: members.get(p.owner_id)?.display_name ?? '?' })}</div>}
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary" style={{ width: `${pr.percent}%` }} />
                    </div>
                    <div className="text-xs text-muted-foreground">{t('progress', pr)}</div>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>
        <section className="min-w-0 flex-1 overflow-y-auto p-6">
          {selected ? (
            <PathDetail
              key={selected.id}
              path={selected}
              steps={steps.filter((s) => s.path_id === selected.id)}
              editable={selected.owner_id === uid}
              onDeleted={() => setParams({})}
            />
          ) : (
            <p className="text-sm text-muted-foreground">{t('select')}</p>
          )}
        </section>
      </div>
      {creating && <NewPathDialog onClose={() => setCreating(false)} onCreated={(id) => (setCreating(false), setTab('mine'), setParams({ path: id }))} />}
    </div>
  )
}

/** Học tập cần đăng nhập (dữ liệu lưu Supabase), không bắt buộc có team. */
export function LearningPage() {
  return (
    <TeamGate requireTeam={false}>
      <Body />
    </TeamGate>
  )
}
