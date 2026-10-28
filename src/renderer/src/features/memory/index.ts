import { Brain } from 'lucide-react'
import { api } from '@renderer/lib/api'
import type { FeatureDefinition } from '../types'
import { MemoryPage } from './components/MemoryPage'
import en from './i18n/en.json'
import vi from './i18n/vi.json'
import { useMemory } from './store'

export const memoryFeature: FeatureDefinition = {
  id: 'memory',
  titleKey: 'title',
  icon: Brain,
  route: '/memory',
  roles: [],
  component: MemoryPage,
  i18n: { vi, en },
  nav: 'top',
  useBadge: () => useMemory((s) => s.pendingCount),
  setup: () => {
    void useMemory.getState().loadSuggestions()
    return api.memory.onEvent((payload) => useMemory.getState().handleEvent(payload))
  }
}
