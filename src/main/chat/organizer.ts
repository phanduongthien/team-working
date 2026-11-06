import type { ChatOrganizeSettings } from '@shared/schemas'
import { completeText, type AIProvider } from '../ai/AIProvider'
import type { ConversationGroupRepository, ConversationRepository, MessageRepository } from '../db/repositories'
import type { Logger } from '../services/logger'
import {
  fixRawTitle,
  organizePrompt,
  organizeSystemPrompt,
  parseOrganize,
  suggestByKeywords,
  titleFromPrompt
} from './organize'

const ORGANIZE_TIMEOUT_MS = 60_000
/** Số tiêu đề mỗi nhóm dùng làm từ khoá. */
const SAMPLE_TITLES = 20

export type OrganizerDeps = {
  conversations: ConversationRepository
  groups: ConversationGroupRepository
  messages: MessageRepository
  getProvider(): AIProvider
  getSettings(): ChatOrganizeSettings
  workspaceDir: string
  log: Pick<Logger, 'info' | 'warn'>
  /** Báo thanh bên cập nhật (sync 'conversations'). */
  changed(): void
}

/**
 * Tiêu đề + gợi ý nhóm cho cuộc trò chuyện mới:
 * 1. Tin đầu: tiêu đề tạm (titleFromPrompt) + gợi ý nhóm bằng từ khoá — ngay, không tốn hạn mức.
 * 2. Sau lượt trả lời đầu: MỘT lần gọi model rẻ (Haiku) đặt tiêu đề ngắn, và chọn nhóm nếu từ khoá chưa tìm ra.
 * Gợi ý chỉ là gợi ý: người dùng bấm đồng ý mới chuyển nhóm. Người dùng tự đổi tên → AI không đặt lại.
 */
export class ConversationOrganizer {
  private readonly running = new Set<string>()

  constructor(private readonly deps: OrganizerDeps) {}

  private groupSamples() {
    const groups = this.deps.groups.list()
    if (groups.length === 0) return []
    const all = this.deps.conversations.list()
    return groups.map((g) => ({
      ...g,
      titles: all
        .filter((c) => c.groupId === g.id)
        .slice(0, SAMPLE_TITLES)
        .map((c) => c.title)
    }))
  }

  /** Tin nhắn đầu của một cuộc chưa có tiêu đề. */
  onFirstMessage(conversationId: string, text: string): void {
    const { conversations } = this.deps
    const conv = conversations.get(conversationId)
    if (!conv) return
    const settings = this.deps.getSettings()
    const samples = settings.suggestGroups && !conv.groupId ? this.groupSamples() : []
    const suggested = samples.length ? suggestByKeywords(text, samples) : null
    if (suggested) conversations.setSuggestedGroup(conversationId, suggested)
    // Còn việc cho AI (đặt tiêu đề / chọn nhóm khi từ khoá không ra) → 'auto', không thì giữ nguyên.
    const needAi = settings.aiTitles || (samples.length > 0 && !suggested)
    conversations.setAutoTitle(conversationId, titleFromPrompt(text) || '…', needAi ? 'auto' : 'fixed')
  }

  /** Sau mỗi lượt chạy: chỉ làm khi tiêu đề còn 'auto' (một lần cho mỗi cuộc). */
  async afterRun(conversationId: string): Promise<void> {
    const { conversations, messages, log } = this.deps
    const conv = conversations.get(conversationId)
    if (!conv || conv.titleSource !== 'auto' || this.running.has(conversationId)) return
    const recent = messages.recent(conversationId, 4)
    const reply = [...recent].reverse().find((m) => m.role === 'assistant')
    if (!reply || reply.status !== 'done') return // lỗi / dừng → thử lại ở lượt sau
    const user = [...recent].reverse().find((m) => m.role === 'user' && m.createdAt <= reply.createdAt)
    const settings = this.deps.getSettings()
    const groups = settings.suggestGroups && !conv.groupId && !conv.suggestedGroupId ? this.deps.groups.list() : []

    this.running.add(conversationId)
    try {
      const result = await completeText(
        this.deps.getProvider(),
        {
          prompt: organizePrompt({
            user: user?.content || conv.title,
            reply: reply.content,
            groups: groups.length ? groups.map((g) => g.name) : null
          }),
          systemPrompt: organizeSystemPrompt(),
          mode: 'free',
          cwd: this.deps.workspaceDir,
          ephemeral: true,
          model: 'cheap'
        },
        AbortSignal.timeout(ORGANIZE_TIMEOUT_MS)
      )
      const parsed = 'error' in result ? null : parseOrganize(result.text, groups)
      if ('error' in result) log.warn(`Đặt tiêu đề tự động lỗi: ${result.error}`)
      else if (!parsed) log.warn(`Đặt tiêu đề tự động: đầu ra không đúng định dạng: ${result.text.slice(0, 200)}`)
      // Đọc lại: người dùng có thể đã đổi tên / xếp nhóm trong lúc chờ.
      const now = conversations.get(conversationId)
      if (!now) return
      if (now.titleSource === 'auto')
        conversations.setAutoTitle(conversationId, settings.aiTitles && parsed?.title ? parsed.title : now.title, parsed ? 'ai' : 'fixed')
      if (parsed?.groupId && !now.groupId && !now.suggestedGroupId)
        conversations.setSuggestedGroup(conversationId, parsed.groupId)
      this.deps.changed()
    } finally {
      this.running.delete(conversationId)
    }
  }

  /** Sửa tiêu đề lỗi của bản cũ ('Tạo artifact type="doc" title=...'). Chạy một lần lúc khởi động. */
  fixLegacyTitles(): number {
    let fixed = 0
    for (const c of this.deps.conversations.listAllForMaintenance()) {
      if (c.titleSource === 'user') continue
      const title = fixRawTitle(c.title)
      if (!title) continue
      this.deps.conversations.setAutoTitle(c.id, title, 'fixed')
      fixed++
    }
    if (fixed) this.deps.changed()
    return fixed
  }
}
