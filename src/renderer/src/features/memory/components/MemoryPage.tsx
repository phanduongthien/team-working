import { Download } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import { usePreferences } from '@renderer/stores/preferences'
import { useMemory } from '../store'
import { BackupSection } from './BackupSection'
import { MemoryList } from './MemoryList'
import { ProfileForm } from './ProfileForm'
import { SuggestionList } from './SuggestionList'

function Section({
  title,
  description,
  badge,
  children
}: {
  title: string
  description?: string
  badge?: number
  children: ReactNode
}) {
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="flex items-center gap-2 font-semibold">
        {title}
        {!!badge && <span className="rounded-full bg-primary px-2 text-xs text-primary-foreground">{badge}</span>}
      </h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  )
}

export function MemoryPage() {
  const { t } = useTranslation('memory')
  const name = usePreferences((s) => s.assistant.name)
  const profile = useAuth((s) => s.profile)
  const loadAll = useMemory((s) => s.loadAll)
  const pending = useMemory((s) => s.pendingCount)
  const [exported, setExported] = useState<string | null>(null)

  useEffect(() => {
    void loadAll()
  }, [loadAll])

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-5 px-6 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{t('heading', { name })}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('intro')}</p>
            <p className="mt-1 text-sm font-medium" data-testid="memory-account">
              {profile ? t('account', { name: profile.github_username ? `@${profile.github_username}` : profile.display_name }) : t('accountLocal')}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              const path = await api.memory.export()
              if (path) setExported(path)
            }}
          >
            <Download />
            {t('export')}
          </Button>
        </div>
        {exported && <p className="text-sm text-muted-foreground break-all">{t('exported', { path: exported })}</p>}

        <Section title={t('suggestions.heading')} badge={pending}>
          <SuggestionList />
        </Section>
        <Section title={t('profile.heading')} description={t('profile.description')}>
          <ProfileForm />
        </Section>
        <Section title={t('list.heading')}>
          <MemoryList />
        </Section>
        <Section title={t('backup.heading')}>
          <BackupSection />
        </Section>
      </div>
    </div>
  )
}
