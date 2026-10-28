import { create } from 'zustand'
import type { MemoryCategory, UserProfile } from '@shared/schemas'
import type { Memory, MemoryEventPayload, MemorySuggestion } from '@shared/types'
import { api } from '@renderer/lib/api'
import { scheduleBackup } from './backup'

type MemoryState = {
  memories: Memory[]
  suggestions: MemorySuggestion[]
  pendingCount: number
  /** Các cuộc trò chuyện đang được trích đề xuất. */
  extracting: Record<string, boolean>
  query: string

  loadAll(): Promise<void>
  loadMemories(): Promise<void>
  loadSuggestions(): Promise<void>
  setQuery(query: string): Promise<void>
  create(content: string, category: MemoryCategory): Promise<void>
  update(id: string, content: string, category: MemoryCategory): Promise<void>
  remove(id: string): Promise<void>
  resolve(id: string, accept: boolean, edits?: { content?: string; category?: MemoryCategory }): Promise<void>
  saveProfile(profile: UserProfile): Promise<UserProfile>
  handleEvent(payload: MemoryEventPayload): void
}

export const useMemory = create<MemoryState>((set, get) => ({
  memories: [],
  suggestions: [],
  pendingCount: 0,
  extracting: {},
  query: '',

  async loadAll() {
    await Promise.all([get().loadMemories(), get().loadSuggestions()])
  },

  async loadMemories() {
    set({ memories: await api.memory.list(get().query || undefined) })
  },

  async loadSuggestions() {
    const suggestions = await api.memory.suggestions()
    set({ suggestions, pendingCount: suggestions.length })
  },

  async setQuery(query) {
    set({ query })
    await get().loadMemories()
  },

  async create(content, category) {
    await api.memory.create(content, category)
    await get().loadMemories()
    scheduleBackup()
  },

  async update(id, content, category) {
    await api.memory.update(id, content, category)
    await get().loadMemories()
    scheduleBackup()
  },

  async remove(id) {
    await api.memory.remove(id)
    set((s) => ({ memories: s.memories.filter((m) => m.id !== id) }))
    scheduleBackup()
  },

  async resolve(id, accept, edits = {}) {
    await api.memory.resolve({ id, accept, ...edits })
    await get().loadAll()
    if (accept) scheduleBackup()
  },

  saveProfile(profile) {
    return api.memory.setProfile(profile)
  },

  handleEvent(payload) {
    if (payload.type === 'suggestions') {
      set({ pendingCount: payload.pending })
      void get().loadSuggestions()
    } else {
      set((s) => ({ extracting: { ...s.extracting, [payload.conversationId]: payload.running } }))
    }
  }
}))
