import { ChartColumn } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { DashboardPage } from './components/DashboardPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'

export const dashboardFeature: FeatureDefinition = {
  id: 'dashboard',
  titleKey: 'title',
  icon: ChartColumn,
  route: '/dashboard',
  roles: [],
  component: DashboardPage,
  i18n: { vi, en },
  nav: 'top'
}
