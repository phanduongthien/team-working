import { Mail } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { ConnectorsPage } from './components/ConnectorsPage'
import { DraftOverlay } from './components/DraftOverlay'
import en from './i18n/en.json'
import vi from './i18n/vi.json'
import { setupConnectors } from './store'

/** Gmail / Telegram cá nhân (thử nghiệm, mặc định tắt): chỉ đọc + soạn nháp. Không có trên menu — vào từ Cài đặt. */
export const connectorsFeature: FeatureDefinition = {
  id: 'connectors',
  titleKey: 'title',
  icon: Mail,
  route: '/connectors',
  roles: [],
  component: ConnectorsPage,
  i18n: { vi, en },
  nav: false,
  setup: setupConnectors,
  overlay: DraftOverlay
}
