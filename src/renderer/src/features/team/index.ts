import { Users } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { TeamPage } from './components/TeamPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'

export const teamFeature: FeatureDefinition = {
  id: 'team',
  titleKey: 'title',
  icon: Users,
  route: '/team',
  roles: [],
  component: TeamPage,
  i18n: { vi, en },
  nav: 'top'
}
