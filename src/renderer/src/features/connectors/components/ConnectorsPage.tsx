import { ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useConnectors } from '../store'
import { GmailSection } from './GmailSection'
import { TelegramSection } from './TelegramSection'

export function ConnectorsPage() {
  const { t } = useTranslation('connectors')
  const gmail = useConnectors((s) => s.gmail)
  const telegram = useConnectors((s) => s.telegram)
  const points = t('privacy.points', { returnObjects: true }) as string[]

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 px-6 py-8">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            {t('title')}
            <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
              {t('experimental')}
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
        </div>
        <section className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="flex items-center gap-2 font-medium">
            <ShieldCheck className="size-4 text-primary" />
            {t('privacy.title')}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            {points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
        {gmail && <GmailSection key={gmail.clientId ?? ''} status={gmail} />}
        {telegram && <TelegramSection key={String(telegram.apiId)} status={telegram} />}
      </div>
    </div>
  )
}
