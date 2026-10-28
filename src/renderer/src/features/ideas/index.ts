import { Lightbulb } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { IdeasPage } from './components/IdeasPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'

export const ideasFeature: FeatureDefinition = {
  id: 'ideas',
  titleKey: 'title',
  icon: Lightbulb,
  route: '/ideas',
  roles: [],
  component: IdeasPage,
  i18n: { vi, en },
  nav: 'bottom'
}
