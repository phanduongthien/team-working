import { create } from 'zustand'
import type { ChatMode } from '@shared/ai'
import type { ChatStreamPayload, Conversation, Message } from '@shared/types'
import { api } from '@renderer/lib/api'
import { applyChatEvent, isTerminalEvent } from './chatEvents'

type Streaming = { requestId: string; messageId: string }

/** Sự kiện tới trước khi `send` trả về (hiếm) — đệm lại theo messageId rồi áp sau. */
const early = new Map<string, ChatStreamPayload[]>()

type ChatState = {
  conversations: Conversation[]
  query: string
  activeId: string | null
  messages: Record<string, Message[]>
  streaming: Record<string, Streaming>
  error: string | null

  loadConversations(): Promise<void>
  setQuery(query: string): Promise<void>
  select(id: string | null): Promise<void>
  create(mode?: ChatMode): Promise<Conversation>
  rename(id: string, title: string): Promise<void>
  togglePin(id: string): Promise<void>
  setMode(id: string, mode: ChatMode): Promise<void>
  remove(id: string): Promise<void>
  send(text: string, mode: ChatMode): Promise<void>
  stop(): Promise<void>
  handleEvent(payload: ChatStreamPayload): void
  clearError(): void
}

export const useChat = create<ChatState>((set, get) => {
  const replaceConversation = (c: Conversation): void =>
    set((s) => ({ conversations: s.conversations.map((x) => (x.id === c.id ? c : x)) }))

  return {
    conversations: [],
    query: '',
    activeId: null,
    messages: {},
    streaming: {},
    error: null,

    async loadConversations() {
      const conversations = await api.conversations.list(get().query || undefined)
      set({ conversations })
    },

    async setQuery(query) {
      set({ query })
      await get().loadConversations()
    },

    async select(id) {
      set({ activeId: id })
      if (id && !get().streaming[id]) {
        const list = await api.messages.list(id)
        set((s) => ({ messages: { ...s.messages, [id]: list } }))
      }
    },

    async create(mode = 'free') {
      const conv = await api.conversations.create(mode)
      set((s) => ({ conversations: [conv, ...s.conversations], activeId: conv.id, messages: { ...s.messages, [conv.id]: [] } }))
      return conv
    },

    async rename(id, title) {
      replaceConversation(await api.conversations.update({ id, title }))
    },

    async togglePin(id) {
      const conv = get().conversations.find((c) => c.id === id)
      if (!conv) return
      await api.conversations.update({ id, pinned: !conv.pinned })
      await get().loadConversations()
    },

    async setMode(id, mode) {
      replaceConversation(await api.conversations.update({ id, mode }))
    },

    async remove(id) {
      const streaming = get().streaming[id]
      if (streaming) await api.chat.abort(streaming.requestId)
      await api.conversations.remove(id)
      set((s) => {
        const messages = { ...s.messages }
        delete messages[id]
        return {
          messages,
          conversations: s.conversations.filter((c) => c.id !== id),
          activeId: s.activeId === id ? null : s.activeId
        }
      })
    },

    async send(text, mode) {
      let id = get().activeId
      if (!id) id = (await get().create(mode)).id
      else if (get().conversations.find((c) => c.id === id)?.mode !== mode) await get().setMode(id, mode)
      const conversationId = id

      try {
        const res = await api.chat.send(conversationId, text)
        set((s) => ({
          messages: {
            ...s.messages,
            [conversationId]: [...(s.messages[conversationId] ?? []), res.userMessage, res.assistantMessage]
          },
          streaming: {
            ...s.streaming,
            [conversationId]: { requestId: res.requestId, messageId: res.assistantMessage.id }
          }
        }))
        const buffered = early.get(res.assistantMessage.id) ?? []
        early.delete(res.assistantMessage.id)
        for (const payload of buffered) get().handleEvent(payload)
        await get().loadConversations()
      } catch (err) {
        set({ error: (err as Error).message })
      }
    },

    async stop() {
      const id = get().activeId
      const streaming = id ? get().streaming[id] : undefined
      if (streaming) await api.chat.abort(streaming.requestId)
    },

    handleEvent(payload) {
      const { conversationId, messageId, event } = payload
      if (!get().messages[conversationId]?.some((m) => m.id === messageId)) {
        early.set(messageId, [...(early.get(messageId) ?? []), payload])
        return
      }
      set((s) => {
        const list = s.messages[conversationId] ?? []
        const next: Partial<ChatState> = {
          messages: { ...s.messages, [conversationId]: applyChatEvent(list, messageId, event) }
        }
        if (isTerminalEvent(event)) {
          const streaming = { ...s.streaming }
          delete streaming[conversationId]
          next.streaming = streaming
        }
        return next
      })
      if (isTerminalEvent(event)) void get().loadConversations()
    },

    clearError() {
      set({ error: null })
    }
  }
})
