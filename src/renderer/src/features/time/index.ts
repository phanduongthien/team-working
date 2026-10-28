import { Timer } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { TimePage } from './components/TimePage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'
import { setupTime, useTime } from './store'

export const timeFeature: FeatureDefinition = {
  id: 'time',
  titleKey: 'title',
  icon: Timer,
  route: '/time',
  roles: [],
  component: TimePage,
  i18n: { vi, en },
  nav: 'top',
  setup: setupTime,
  // Chấm đỏ trên menu khi đang bấm giờ / Pomodoro.
  useDot: () => useTime((s) => s.current !== null || s.pomodoro.phase !== 'idle')
}
