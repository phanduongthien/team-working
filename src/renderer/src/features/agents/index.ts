import { Network } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { AgentsOverlay } from './components/AgentsOverlay'
import { AgentsPage } from './components/AgentsPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'
import { setupAgents } from './store'

/** Kết nối agent (thử nghiệm, mặc định tắt). Không có trên menu — vào từ Cài đặt → Tính năng thử nghiệm. */
export const agentsFeature: FeatureDefinition = {
  id: 'agents',
  titleKey: 'title',
  icon: Network,
  route: '/agents',
  roles: [],
  component: AgentsPage,
  i18n: { vi, en },
  nav: false,
  setup: setupAgents,
  overlay: AgentsOverlay
}
