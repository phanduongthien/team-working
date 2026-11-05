import { Monitor } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { ComputerOverlay } from './components/ComputerOverlay'
import { ComputerPage } from './components/ComputerPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'
import { setupComputer } from './store'

/** Điều khiển máy tính (thử nghiệm, mặc định tắt). Không có trên menu — vào từ Cài đặt. */
export const computerFeature: FeatureDefinition = {
  id: 'computer',
  titleKey: 'title',
  icon: Monitor,
  route: '/computer',
  roles: [],
  component: ComputerPage,
  i18n: { vi, en },
  nav: false,
  setup: setupComputer,
  overlay: ComputerOverlay
}
