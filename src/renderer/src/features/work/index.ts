import { FolderKanban } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { WorkPage } from './components/WorkPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'

export const workFeature: FeatureDefinition = {
  id: 'work',
  titleKey: 'title',
  icon: FolderKanban,
  route: '/projects/*',
  roles: [],
  component: WorkPage,
  i18n: { vi, en },
  nav: 'top'
}