import { GraduationCap } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { LearningPage } from './components/LearningPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'

export const learningFeature: FeatureDefinition = {
  id: 'learning',
  titleKey: 'title',
  icon: GraduationCap,
  route: '/learning',
  roles: [],
  component: LearningPage,
  i18n: { vi, en },
  nav: 'top'
}
