import { useTranslation } from 'react-i18next'
import type { TaskPriority, TaskStatus } from '@shared/schemas'
import { cn } from '@renderer/lib/utils'

const STATUS_STYLE: Record<TaskStatus, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  review: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  done: 'bg-green-500/15 text-green-700 dark:text-green-300',
  blocked: 'bg-destructive/15 text-destructive'
}

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: 'text-muted-foreground',
  medium: 'text-foreground',
  high: 'text-orange-600 dark:text-orange-400',
  urgent: 'text-destructive font-semibold'
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useTranslation('work')
  return <span className={cn('rounded px-1.5 py-0.5 text-xs whitespace-nowrap', STATUS_STYLE[status])}>{t(`status.${status}`)}</span>
}

export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  const { t } = useTranslation('work')
  return <span className={cn('text-xs whitespace-nowrap', PRIORITY_STYLE[priority])}>{t(`priority.${priority}`)}</span>
}
