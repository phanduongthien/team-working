import { MessagesSquare } from 'lucide-react'
import { api } from '@renderer/lib/api'
import { onSync } from '@renderer/lib/sync'
import type { FeatureDefinition } from '../types'
import { ChatPage } from './components/ChatPage'
import { CodeApprovalOverlay } from './components/CodeApprovalOverlay'
import { useChat } from './store'
import { setupVoice } from './voice/store'
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
  setup: () => {
    const offChat = api.chat.onEvent((payload) => useChat.getState().handleEvent(payload))
    // Thanh bên: tiêu đề AI đặt, gợi ý nhóm, thay đổi từ nơi khác → cập nhật ngay.
    const offSidebar = onSync('conversations', () => useChat.getState().refreshSidebar())
    const offVoice = setupVoice()
    return () => {
      offChat()
      offSidebar()
      offVoice()
    }
  },
  overlay: CodeApprovalOverlay
}
