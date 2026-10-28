import { Bell } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { NotificationsPage } from './components/NotificationsPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'
import { setupNotifications, useNotifications } from './store'

export const notificationsFeature: FeatureDefinition = {
  id: 'notifications',
  titleKey: 'title',
  icon: Bell,
  route: '/notifications',
  roles: [],
  component: NotificationsPage,
  i18n: { vi, en },
  nav: 'bottom',
  useBadge: () => useNotifications((s) => s.unread),
  setup: setupNotifications
}
