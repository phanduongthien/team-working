import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import type { FeatureDefinition } from '@renderer/features/types'
import { AssistantAvatar } from '@renderer/components/AssistantAvatar'
import { ThemeToggle } from '@renderer/components/ThemeToggle'
import { appEnv, supabaseConfig } from '@renderer/lib/supabase'
import { cn } from '@renderer/lib/utils'
import { usePreferences } from '@renderer/stores/preferences'

const noBadge = (): number => 0
const noDot = (): boolean => false

function NavItem({ feature }: { feature: FeatureDefinition }) {
  const { t } = useTranslation(feature.id)
  const Icon = feature.icon
  const label = t(feature.titleKey)
  const badge = (feature.useBadge ?? noBadge)()
  const dot = (feature.useDot ?? noDot)()
  const to = feature.route.replace(/\/\*$/, '')
  return (
    <NavLink
      to={to}
      end={to === '/'}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'relative flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground',
          isActive && 'bg-primary/10 text-primary'
        )
      }
    >
      <Icon className="size-5" />
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      {dot && badge === 0 && <span className="absolute top-1 right-1 size-2 animate-pulse rounded-full bg-red-500" data-testid={`dot-${feature.id}`} />}
    </NavLink>
  )
}

export function AppShell({ features }: { features: FeatureDefinition[] }) {
  const assistant = usePreferences((s) => s.assistant)
  const top = features.filter((f) => f.nav === 'top')
  const bottom = features.filter((f) => f.nav === 'bottom')

  return (
    <div className="flex h-full">
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-3">
        <div title={assistant.name} className="mb-3">
          <AssistantAvatar avatar={assistant.avatar} className="size-9" />
        </div>
        {top.map((f) => (
          <NavItem key={f.id} feature={f} />
        ))}
        <div className="flex-1" />
        <ThemeToggle />
        {bottom.map((f) => (
          <NavItem key={f.id} feature={f} />
        ))}
        {appEnv !== 'production' && (
          <span
            className="mt-1 rounded bg-orange-500/20 px-1 text-[10px] font-bold text-orange-700 dark:text-orange-300"
            title={supabaseConfig?.url ?? ''}
            data-testid="env-badge"
          >
            DEV
          </span>
        )}
      </nav>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
      {features.map((f) => (f.overlay ? <f.overlay key={f.id} /> : null))}
    </div>
  )
}
