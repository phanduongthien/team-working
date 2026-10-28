import { useTranslation } from 'react-i18next'
import { NavLink, Outlet } from 'react-router'
import type { FeatureDefinition } from '@renderer/features/types'
import { AssistantAvatar } from '@renderer/components/AssistantAvatar'
import { cn } from '@renderer/lib/utils'
import { usePreferences } from '@renderer/stores/preferences'

function NavItem({ feature }: { feature: FeatureDefinition }) {
  const { t } = useTranslation(feature.id)
  const Icon = feature.icon
  const label = t(feature.titleKey)
  return (
    <NavLink
      to={feature.route}
      end={feature.route === '/'}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        cn(
          'flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground',
          isActive && 'bg-primary/10 text-primary'
        )
      }
    >
      <Icon className="size-5" />
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
        {bottom.map((f) => (
          <NavItem key={f.id} feature={f} />
        ))}
      </nav>
      <main className="min-w-0 flex-1">
        <Outlet />
      </main>
    </div>
  )
}
