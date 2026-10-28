import { create } from 'zustand'
import type { MemoryCategory, UserProfile } from '@shared/schemas'
import type { Memory, MemoryEventPayload, MemorySuggestion } from '@shared/types'
import { api } from '@renderer/lib/api'
import { pushProfileIfSignedIn, syncProfile } from '@renderer/stores/assistantSync'
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
  /** Đổi tài khoản: main đổi phạm vi trí nhớ, đồng bộ hồ sơ, tải lại. */
  switchAccount(uid: string | null): Promise<void>
  /** Tăng khi hồ sơ có thể đã đổi từ bên ngoài (đổi tài khoản / đồng bộ) → form tải lại. */
  profileVersion: number
  handleEvent(payload: MemoryEventPayload): void
}

export const useMemory = create<MemoryState>((set, get) => ({
  memories: [],
  suggestions: [],
  pendingCount: 0,
  extracting: {},
  query: '',
  profileVersion: 0,

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

  async saveProfile(profile) {
    const saved = await api.memory.setProfile(profile)
    // Hồ sơ đi theo tài khoản GitHub (chỉ chính chủ đọc).
    void pushProfileIfSignedIn(saved)
    return saved
  },

  async switchAccount(uid) {
    set({ memories: [], suggestions: [], pendingCount: 0, query: '' })
    await api.account.set(uid)
    if (uid) await syncProfile(uid)
    await get().loadAll()
    set((s) => ({ profileVersion: s.profileVersion + 1 }))
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
