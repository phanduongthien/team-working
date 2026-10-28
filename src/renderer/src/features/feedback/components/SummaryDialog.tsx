import { Copy, LoaderCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
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
import { summaryItems, type SummaryScope } from '../logic'

const PERIODS = [7, 30, 90] as const

/** Tóm tắt feedback theo kỳ bằng feedback-coach. Chỉ gửi nội dung — không tên người. */
export function SummaryDialog({ open, onOpenChange, list }: { open: boolean; onOpenChange(o: boolean): void; list: FeedbackRow[] }) {
  const { t } = useTranslation('feedback')
  const language = usePreferences((s) => s.assistant.language)
  const { currentTeamId, members } = useTeam()
  const projects = useProjects(currentTeamId).data ?? []
  const [scopeKey, setScopeKey] = useState('team')
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const [result, setResult] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const scopeOf = (key: string): { scope: SummaryScope; label: string } => {
    const [type, id] = key.split(':')
    if (type === 'project') return { scope: { type, id }, label: t('summary.scopeProject', { name: projects.find((p) => p.id === id)?.name }) }
    if (type === 'person') return { scope: { type, id }, label: t('summary.scopePerson', { name: members.find((m) => m.id === id)?.display_name }) }
    return { scope: { type: 'team' }, label: t('summary.scopeTeam') }
  }

  const run = async (): Promise<void> => {
    if (!currentTeamId) return
    setBusy(true)
    setResult(null)
    try {
      const { scope, label } = scopeOf(scopeKey)
      const items = summaryItems(list, await fetchTeamReplies(currentTeamId), scope, addDays(localDate(new Date()), -days))
      if (items.length === 0) {
        setResult(t('summary.none'))
        return
      }
      const res = await api.feedback.summarize({ scope: label, period: t('summary.days', { count: days }), language, items })
      setResult('error' in res ? t(`work:errors.${res.error}`, { defaultValue: res.error }) : res.text)
    } catch (err) {
      setResult((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={t('summary.heading')} description={t('summary.intro')} className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sum-scope">{t('summary.scope')}</Label>
              <Select id="sum-scope" value={scopeKey} onChange={(e) => setScopeKey(e.target.value)}>
                <option value="team">{t('summary.scopeTeam')}</option>
                {projects.map((p) => (
                  <option key={p.id} value={`project:${p.id}`}>
                    {t('summary.scopeProject', { name: p.name })}
                  </option>
                ))}
                {members.map((m) => (
                  <option key={m.id} value={`person:${m.id}`}>
                    {t('summary.scopePerson', { name: m.display_name })}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sum-period">{t('summary.period')}</Label>
              <Select id="sum-period" value={days} onChange={(e) => setDays(Number(e.target.value) as (typeof PERIODS)[number])}>
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
