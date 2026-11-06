import { useTranslation } from 'react-i18next'
import { cn } from '@renderer/lib/utils'

const TONE: Record<string, string> = {
  connected: 'bg-green-500/15 text-green-700 dark:text-green-300',
  expired: 'bg-orange-500/15 text-orange-700 dark:text-orange-300',
  connecting: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  code_sent: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  password_needed: 'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  disconnected: 'bg-muted text-muted-foreground'
}

export function ConnectionBadge({ state, testId }: { state: string; testId: string }) {
  const { t } = useTranslation('connectors')
  return (
    <span
      className={cn('rounded px-2 py-0.5 text-xs font-medium', TONE[state])}
      data-testid={testId}
      data-state={state}
    >
      {t(`state.${state}`)}
    </span>
  )
}

export function ErrorText({ error }: { error: string | null }) {
  const { t } = useTranslation('connectors')
  if (!error) return null
  return (
    <p className="text-sm text-destructive" role="alert">
      {t(`errors.${error}`, { defaultValue: t('errors.generic', { message: error }) })}
    </p>
  )
}

/** Hướng dẫn tự tạo key / OAuth client — mở sẵn khi chưa cấu hình. */
export function SetupSteps({
  title,
  steps,
  open
}: {
  title: string
  steps: string[]
  open: boolean
}) {
  return (
    <details className="rounded-md border bg-muted/30 px-3 py-2 text-sm" open={open}>
      <summary className="cursor-pointer font-medium">{title}</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </details>
  )
}
