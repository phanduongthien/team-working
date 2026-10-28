import { Copy, LoaderCircle, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FeedbackRow } from '@shared/supabase.types'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent } from '@renderer/components/ui/dialog'
import { Label, Select } from '@renderer/components/ui/input'
import { api } from '@renderer/lib/api'
import { usePreferences } from '@renderer/stores/preferences'
import { useTeam } from '@renderer/stores/team'
import { Markdown } from '../../chat/components/Markdown'
import { useProjects } from '../../work/api'
import { addDays, localDate } from '../../work/logic'
import { fetchTeamReplies } from '../api'
import { countByScope, parseScopeKey, summaryItems } from '../logic'

const PERIODS = [7, 30, 90] as const

/** Tóm tắt feedback theo kỳ bằng feedback-coach. Chỉ gửi nội dung — không tên người. */
export function SummaryDialog({ open, onOpenChange, list }: { open: boolean; onOpenChange(o: boolean): void; list: FeedbackRow[] }) {
  const { t } = useTranslation('feedback')
  const language = usePreferences((s) => s.assistant.language)
  const { currentTeamId, members } = useTeam()
  const projectsData = useProjects(currentTeamId).data
  const projects = useMemo(() => projectsData ?? [], [projectsData])
  const [scopeKey, setScopeKey] = useState('team')
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [result, setResult] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const [busy, setBusy] = useState(false)

  const since = addDays(localDate(new Date()), -days)
  const options = useMemo(
    () => [
      { key: 'team', label: t('summary.scopeTeam') },
      ...projects.map((p) => ({ key: `project:${p.id}`, label: t('summary.scopeProject', { name: p.name }) })),
      ...members.map((m) => ({ key: `person:${m.id}`, label: t('summary.scopePerson', { name: m.display_name }) }))
    ],
    [projects, members, t]
  )
  const counts = useMemo(() => countByScope(list, options.map((o) => o.key), since), [list, options, since])
  const labelOf = (key: string): string => options.find((o) => o.key === key)?.label ?? t('summary.scopeTeam')

  const run = async (): Promise<void> => {
    if (!currentTeamId) return
    setBusy(true)
    setResult(null)
    setEmpty(false)
    try {
      const items = summaryItems(list, await fetchTeamReplies(currentTeamId), parseScopeKey(scopeKey), since)
      if (items.length === 0) {
        setEmpty(true)
        return
      }
      const res = await api.feedback.summarize({ scope: labelOf(scopeKey), period: t('summary.days', { count: days }), language, items })
      setResult('error' in res ? t(`work:errors.${res.error}`, { defaultValue: res.error }) : res.text)
    } catch (err) {
      setResult((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const teamCount = counts.get('team') ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('summary.heading')} description={t('summary.intro')} className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sum-scope">{t('summary.scope')}</Label>
              <Select
                id="sum-scope"
                value={scopeKey}
                onChange={(e) => (setScopeKey(e.target.value), setEmpty(false))}
              >
                {options.map((o) => (
                  <option key={o.key} value={o.key}>
                    {t('summary.withCount', { label: o.label, count: counts.get(o.key) ?? 0 })}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sum-period">{t('summary.period')}</Label>
              <Select id="sum-period" value={days} onChange={(e) => (setDays(Number(e.target.value) as (typeof PERIODS)[number]), setEmpty(false))}>
                {PERIODS.map((d) => (
                  <option key={d} value={d}>
                    {t('summary.days', { count: d })}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            {busy ? t('summary.running') : t('summary.run')}
          </Button>

          {empty && (
            <div className="space-y-2 rounded-md border border-dashed p-3 text-sm" data-testid="summary-empty">
              <p>{t('summary.emptyScope', { scope: labelOf(scopeKey), period: t('summary.days', { count: days }) })}</p>
              {scopeKey !== 'team' && teamCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{t('summary.teamHas', { count: teamCount })}</span>
                  <Button size="sm" variant="outline" onClick={() => (setScopeKey('team'), setEmpty(false))}>
                    {t('summary.useTeam')}
                  </Button>
                </div>
              )}
              {teamCount === 0 && days < 90 && <p className="text-muted-foreground">{t('summary.tryLonger')}</p>}
            </div>
          )}

          {result && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <Markdown text={result} />
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(result)}>
                  <Copy />
                  {t('summary.copy')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
