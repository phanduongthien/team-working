import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_PROFILE,
  aiSettingsSchema,
  userProfileSchema,
  type MemoryCategory,
  type UserProfile
} from '@shared/schemas'
import type { ExtractResult, Memory, MemoryEventPayload } from '@shared/types'
import { completeText, type AIProvider } from '../ai/AIProvider'
import type { UserProfileContext } from '../ai/systemPrompt'
import type {
  ConversationRepository,
  MemoryRepository,
  MessageRepository,
  SettingsRepository,
  SuggestionRepository
} from '../db/repositories'
import { buildExtractionPrompt, parseSuggestions } from './extraction'
import { selectMemories } from './selectMemories'

export type MemoryServiceDeps = {
  conversations: ConversationRepository
  messages: MessageRepository
  memories: MemoryRepository
  suggestions: SuggestionRepository
  settings: SettingsRepository
  getProvider(): AIProvider
  loadSkill(name: string): Promise<string | undefined>
  workspaceDir: string
  emit(payload: MemoryEventPayload): void
  log: { info(msg: string): void; warn(msg: string): void }
}

/** Số tin nhắn mới của người dùng tối thiểu để tự đề xuất khi rời cuộc trò chuyện. */
export const AUTO_EXTRACT_MIN_USER_MESSAGES = 2
const EXTRACT_TIMEOUT_MS = 180_000

export type ResolveInput = { id: string; accept: boolean; content?: string; category?: MemoryCategory }

export class MemoryService {
  private running = new Set<string>()

  constructor(private readonly deps: MemoryServiceDeps) {}

  getProfile(): UserProfile {
    return this.deps.settings.get('profile', userProfileSchema, DEFAULT_PROFILE)
  }

  setProfile(profile: UserProfile): UserProfile {
    return this.deps.settings.set('profile', profile)
  }

  /** Hồ sơ + memory liên quan để chèn vào system prompt; đánh dấu memory đã dùng. */
  contextFor(query: string): { user: UserProfileContext; memories: string[] } {
    const picked = selectMemories(this.deps.memories.list(), query)
    this.deps.memories.markUsed(picked.map((m) => m.id))
    return { user: this.getProfile(), memories: picked.map((m) => m.content) }
  }

  /**
   * Nhờ trợ lý đọc phần hội thoại mới và ĐỀ XUẤT memory (không tự lưu).
   * Đề xuất vào hàng chờ để người dùng duyệt.
   */
  async extract(conversationId: string): Promise<ExtractResult> {
    const { deps } = this
    const conversation = deps.conversations.get(conversationId)
    if (!conversation) return { error: 'conversation_not_found' }
    if (this.running.has(conversationId)) return { error: 'already_running' }

    const fresh = deps.messages
      .since(conversationId, conversation.memoryExtractedAt)
      .filter((m) => m.status === 'done')
    if (!fresh.some((m) => m.role === 'user')) return { added: 0 }

    this.running.add(conversationId)
    deps.emit({ type: 'extracting', conversationId, running: true })
    try {
      const existing = deps.memories.list()
      const skill = (await deps.loadSkill('memory-keeper')) ?? ''
      const result = await completeText(
        deps.getProvider(),
        {
          prompt: buildExtractionPrompt(fresh, existing),
          systemPrompt: `${skill}\n\nChỉ trả lời bằng đúng một khối JSON theo định dạng trên.`,
          mode: 'free',
          cwd: deps.workspaceDir,
          ephemeral: true
        },
        AbortSignal.timeout(EXTRACT_TIMEOUT_MS)
      )
      if ('error' in result) {
        deps.log.warn(`Trích memory lỗi: ${result.error}`)
        return { error: result.error }
      }
      const parsed = parseSuggestions(result.text, existing)
      if (!parsed) {
        deps.log.warn(`Trích memory: đầu ra không đúng định dạng: ${result.text.slice(0, 300)}`)
        return { error: 'invalid_output' }
      }
      deps.suggestions.insertMany(parsed.map((s) => ({ ...s, conversationId })))
      deps.conversations.setMemoryExtractedAt(conversationId, fresh[fresh.length - 1].createdAt)
      this.emitCount()
      return { added: parsed.length }
    } finally {
      this.running.delete(conversationId)
      deps.emit({ type: 'extracting', conversationId, running: false })
    }
  }

  /** Gọi khi người dùng rời một cuộc trò chuyện: tự đề xuất nếu bật và có đủ tin mới. */
  async maybeAutoExtract(conversationId: string): Promise<void> {
    const ai = this.deps.settings.get('ai', aiSettingsSchema, DEFAULT_AI_SETTINGS)
    if (!ai.autoSuggestMemory) return
    const conversation = this.deps.conversations.get(conversationId)
    if (!conversation) return
    const newUserMessages = this.deps.messages
      .since(conversationId, conversation.memoryExtractedAt)
      .filter((m) => m.role === 'user' && m.status === 'done').length
    if (newUserMessages >= AUTO_EXTRACT_MIN_USER_MESSAGES) await this.extract(conversationId)
  }

  /** Người dùng duyệt (có thể sửa) hoặc bỏ qua một đề xuất. */
  resolve(input: ResolveInput): void {
    const { memories, suggestions } = this.deps
    const s = suggestions.getPending(input.id)
    if (!s) throw new Error('suggestion_not_found')

    if (input.accept) {
      const content = input.content ?? s.content
      const category = input.category ?? s.category
      if (s.action === 'add') {
        memories.create(content, category, s.conversationId)
      } else if (s.action === 'update') {
        const updated = s.targetMemoryId ? memories.update(s.targetMemoryId, content, category) : null
        if (!updated) memories.create(content, category, s.conversationId)
      } else if (s.targetMemoryId) {
        memories.remove(s.targetMemoryId)
      }
    }
    suggestions.setStatus(s.id, input.accept ? 'accepted' : 'rejected')
    this.emitCount()
  }

  exportData(): { app: string; exportedAt: string; profile: UserProfile; memories: Memory[] } {
    return {
      app: 'Team Working',
      exportedAt: new Date().toISOString(),
      profile: this.getProfile(),
      memories: this.deps.memories.list()
    }
  }

  emitCount(): void {
    this.deps.emit({ type: 'suggestions', pending: this.deps.suggestions.countPending() })
  }
}
