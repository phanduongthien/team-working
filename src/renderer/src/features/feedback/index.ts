import { MessageSquareHeart } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { FeedbackPage } from './components/FeedbackPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'

export const feedbackFeature: FeatureDefinition = {
  id: 'feedback',
  titleKey: 'title',
  icon: MessageSquareHeart,
  route: '/feedback',
  roles: [],
  component: FeedbackPage,
  i18n: { vi, en },
  nav: 'top'
}
