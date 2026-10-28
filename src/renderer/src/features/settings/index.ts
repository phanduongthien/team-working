import { Settings } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { SettingsPage } from './components/SettingsPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'

export const settingsFeature: FeatureDefinition = {
  id: 'settings',
  titleKey: 'title',
  icon: Settings,
  route: '/settings',
  roles: [],
  component: SettingsPage,
  i18n: { vi, en },
  nav: 'bottom'
}
