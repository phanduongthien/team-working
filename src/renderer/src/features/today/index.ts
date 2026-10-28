import { Sun } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { TodayPage } from './components/TodayPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'
import { setupToday } from './store'

export const todayFeature: FeatureDefinition = {
  id: 'today',
  titleKey: 'title',
  icon: Sun,
  route: '/today',
  roles: [],
  component: TodayPage,
  i18n: { vi, en },
  nav: 'top',
  setup: setupToday
}
