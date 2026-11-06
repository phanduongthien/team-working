import { styleNotesOutputSchema, type StyleLearnResult } from '@shared/skills'
import type { Message } from '@shared/types'
import { completeText, type AIProvider } from '../ai/AIProvider'
import type { ConversationRepository, MessageRepository } from '../db/repositories'
import { extractJsonBlock } from '../memory/extraction'

export const STYLE_TRANSCRIPT_MAX = 15_000
const MESSAGE_MAX = 600
const MAX_NOTES = 8

/** Prompt nhờ trợ lý đọc hội thoại gần đây và ĐỀ XUẤT ghi chú phong cách (người dùng duyệt sau). */
export function buildStylePrompt(messages: Message[], existing: string[]): string {
  let transcript = messages
    .filter((m) => m.content.trim())
    .map((m) => {
      const text = m.content.trim()
      const short = text.length > MESSAGE_MAX ? `${text.slice(0, MESSAGE_MAX)}…` : text
      return `${m.role === 'user' ? 'NGƯỜI DÙNG' : 'TRỢ LÝ'}: ${short}`
    })
    .join('\n\n')
  if (transcript.length > STYLE_TRANSCRIPT_MAX)
    transcript = `…${transcript.slice(-STYLE_TRANSCRIPT_MAX)}`
  return [
    'Đọc các đoạn hội thoại dưới đây và đề xuất ghi chú về PHONG CÁCH người dùng thích, theo đúng hướng dẫn.',
    'Chỉ trả về MỘT khối JSON hợp lệ, không thêm lời giải thích.',
    '',
    '## Ghi chú phong cách đã có',
    existing.length ? existing.map((n) => `- ${n}`).join('\n') : '(chưa có)',
    '',
    '## Hội thoại',
    transcript
  ].join('\n')
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Lấy ghi chú mới (bỏ trùng ghi chú cũ / trùng nhau, cắt độ dài). null = sai định dạng. */
export function parseStyleNotes(text: string, existing: string[]): string[] | null {
  const parsed = styleNotesOutputSchema.safeParse(extractJsonBlock(text))
  if (!parsed.success) return null
  const seen = new Set(existing.map(norm))
  const out: string[] = []
  for (const raw of parsed.data.notes) {
    const note = raw.replace(/\s+/g, ' ').trim().slice(0, 300)
    if (!note || seen.has(norm(note))) continue
    seen.add(norm(note))
    out.push(note)
    if (out.length >= MAX_NOTES) break
  }
  return out
}

export const STYLE_CONVERSATIONS = 5
const STYLE_MESSAGES_PER_CONVERSATION = 30
const STYLE_TIMEOUT_MS = 180_000

export type LearnStyleDeps = {
  conversations: Pick<ConversationRepository, 'list'>
  messages: Pick<MessageRepository, 'recent'>
  getProvider(): AIProvider
  loadSkill(name: string): Promise<string | undefined>
  existingNotes(): Promise<string[]>
  workspaceDir: string
  log: { warn(msg: string): void }
}

/**
 * Đọc vài cuộc trò chuyện gần nhất và trả ĐỀ XUẤT ghi chú phong cách — không lưu gì;
 * người dùng chọn ghi chú nào giữ rồi mới ghi vào skill my-style.
 */
export async function learnStyle(deps: LearnStyleDeps): Promise<StyleLearnResult> {
  const recent = deps.conversations
    .list()
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, STYLE_CONVERSATIONS)
  const messages = recent.flatMap((c) =>
    deps.messages
      .recent(c.id, STYLE_MESSAGES_PER_CONVERSATION)
      .filter((m) => m.status === 'done' && (m.role === 'user' || m.role === 'assistant'))
  )
  if (!messages.some((m) => m.role === 'user')) return { error: 'no_messages' }
  const existing = await deps.existingNotes()
  const skill = (await deps.loadSkill('style-learner')) ?? ''
  const result = await completeText(
    deps.getProvider(),
    {
      prompt: buildStylePrompt(messages, existing),
      systemPrompt: `${skill}\n\nChỉ trả lời bằng đúng một khối JSON style_notes theo định dạng trên.`,
      mode: 'free',
      cwd: deps.workspaceDir,
      ephemeral: true
    },
    AbortSignal.timeout(STYLE_TIMEOUT_MS)
  )
  if ('error' in result) {
    deps.log.warn(`Học phong cách lỗi: ${result.error}`)
    return { error: result.error }
  }
  const notes = parseStyleNotes(result.text, existing)
  if (!notes) {
    deps.log.warn(`Học phong cách: đầu ra sai định dạng: ${result.text.slice(0, 300)}`)
    return { error: 'invalid_output' }
  }
  return { notes }
}
