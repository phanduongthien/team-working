import { MessagesSquare } from 'lucide-react'
import { api } from '@renderer/lib/api'
import type { FeatureDefinition } from '../types'
import { ChatPage } from './components/ChatPage'
import { CodeApprovalOverlay } from './components/CodeApprovalOverlay'
import { useChat } from './store'
import en from './i18n/en.json'
import vi from './i18n/vi.json'

export const chatFeature: FeatureDefinition = {
  id: 'chat',
  titleKey: 'title',
  icon: MessagesSquare,
  route: '/',
  roles: [],
  component: ChatPage,
  i18n: { vi, en },
  nav: 'top',
  // Nghe stream ở cấp app để không mất sự kiện khi người dùng sang trang khác.
  setup: () => api.chat.onEvent((payload) => useChat.getState().handleEvent(payload)),
  overlay: CodeApprovalOverlay
}
