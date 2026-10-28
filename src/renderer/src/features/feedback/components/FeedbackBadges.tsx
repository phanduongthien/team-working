import { EyeOff, Globe, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { FeedbackCategory, FeedbackRow, FeedbackStatus, FeedbackVisibility } from '@shared/supabase.types'
import { cn } from '@renderer/lib/utils'

const CATEGORY_STYLE: Record<FeedbackCategory, string> = {
  praise: 'bg-green-500/15 text-green-700 dark:text-green-300',
  improve: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  suggestion: 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
}

const STATUS_STYLE: Record<FeedbackStatus, string> = {
  open: 'bg-primary/15 text-primary',
  acknowledged: 'bg-muted text-muted-foreground',
  resolved: 'bg-green-500/15 text-green-700 dark:text-green-300'
}

const VISIBILITY_ICON: Record<FeedbackVisibility, typeof Globe> = { public: Globe, anonymous: EyeOff, private: Lock }

export function FeedbackBadges({ feedback }: { feedback: Pick<FeedbackRow, 'category' | 'visibility' | 'status' | 'kind'> }) {
  const { t } = useTranslation('feedback')
  const Icon = VISIBILITY_ICON[feedback.visibility]
  const chip = 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs whitespace-nowrap'
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn(chip, CATEGORY_STYLE[feedback.category])}>{t(`categories.${feedback.category}`)}</span>
      <span className={cn(chip, 'bg-muted text-muted-foreground')}>
        <Icon className="size-3" />
        {t(`visibility.${feedback.visibility}`)}
      </span>
      <span className={cn(chip, 'bg-muted text-muted-foreground')}>{t(`kinds.${feedback.kind}`)}</span>
      <span className={cn(chip, STATUS_STYLE[feedback.status])}>{t(`status.${feedback.status}`)}</span>
    </div>
  )
}
