import { PlugZap } from 'lucide-react'
import type { FeatureDefinition } from '../types'
import { ClaudeCheckPage } from './components/ClaudeCheckPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'

export const claudeCheckFeature: FeatureDefinition = {
  id: 'claude-check',
  titleKey: 'title',
  icon: PlugZap,
  route: '/claude',
  roles: [],
  component: ClaudeCheckPage,
  i18n: { vi, en },
  nav: false
}
