import type { ChatMode } from '@shared/ai'
import type { AssistantProfile, Persona } from '@shared/schemas'

export type UserProfileContext = {
  name?: string
  role?: string
  goals?: string
  skills?: string
  interests?: string
  answerStyle?: string
}

export type SystemPromptInput = {
  assistant: AssistantProfile
  mode: ChatMode
  /** Nội dung SKILL.md của chế độ (đã bỏ frontmatter). */
  modeSkill?: string
  user?: UserProfileContext
  memories?: string[]
  /** Dữ liệu ngữ cảnh thêm (task đang được giao…). */
  extraContext?: string
  maxChars?: number
}

const PERSONA_TEXT: Record<Exclude<Persona, 'custom'>, string> = {
  friendly: 'thân thiện, ấm áp, khích lệ',
  serious: 'nghiêm túc, chuyên nghiệp, chính xác',
  humorous: 'vui tính, dí dỏm nhưng vẫn hữu ích',
  concise: 'ngắn gọn, đi thẳng vào vấn đề'
}

const LANGUAGE_TEXT = { vi: 'tiếng Việt', en: 'English' } as const

const MODE_TEXT: Record<ChatMode, string> = {
  free: 'Tự do — trò chuyện và hỗ trợ chung.',
  study: 'Học tập — đóng vai gia sư.',
  code: 'Code — hỗ trợ lập trình.',
  project: 'Quản lý dự án — lập kế hoạch, giao việc, theo dõi tiến độ.'
}

export const DEFAULT_MAX_CHARS = 12_000
const MAX_MEMORIES = 30

function personaText(a: AssistantProfile): string {
  if (a.persona === 'custom') return a.customPersona.trim() || PERSONA_TEXT.friendly
  return PERSONA_TEXT[a.persona]
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

/**
 * Ghép system prompt theo thứ tự ưu tiên: danh tính → hồ sơ → memory → chế độ.
 * Khi vượt giới hạn, cắt bớt phần ít quan trọng trước (ngữ cảnh thêm, skill, memory cũ).
 */
export function buildSystemPrompt(input: SystemPromptInput): string {
  const maxChars = input.maxChars ?? DEFAULT_MAX_CHARS
  const { assistant } = input

  const identity = [
    `Bạn là ${assistant.name}. Tính cách: ${personaText(assistant)}. Trả lời bằng ${LANGUAGE_TEXT[assistant.language]}.`,
    `Bạn là trợ lý AI trong ứng dụng Team Working, giúp người dùng học tập, quản lý công việc nhóm và làm việc hiệu quả.`,
    `Khi được hỏi tên, hãy xưng là ${assistant.name}.`,
    'Dùng Markdown khi hữu ích; khối code phải ghi rõ ngôn ngữ.'
  ].join('\n')

  const userLines: string[] = []
  const u = input.user
  if (u?.name) userLines.push(`- Tên: ${u.name}`)
  if (u?.role) userLines.push(`- Vai trò: ${u.role}`)
  if (u?.goals) userLines.push(`- Mục tiêu: ${u.goals}`)
  if (u?.skills) userLines.push(`- Kỹ năng: ${u.skills}`)
  if (u?.interests) userLines.push(`- Sở thích: ${u.interests}`)
  if (u?.answerStyle) userLines.push(`- Muốn được trả lời: ${u.answerStyle}`)
  const userSection = userLines.length ? `## Người dùng\n${userLines.join('\n')}` : ''

  const memories = (input.memories ?? []).slice(0, MAX_MEMORIES)
  const modeSection = [`## Chế độ: ${MODE_TEXT[input.mode]}`, input.modeSkill?.trim() ?? '']
    .filter(Boolean)
    .join('\n\n')
  const extra = input.extraContext?.trim() ? `## Ngữ cảnh\n${input.extraContext.trim()}` : ''

  const render = (mem: string[], mode: string, ctx: string): string =>
    [
      identity,
      userSection,
      mem.length ? `## Điều bạn đã biết về người dùng\n${mem.map((m) => `- ${m}`).join('\n')}` : '',
      mode,
      ctx
    ]
      .filter(Boolean)
      .join('\n\n')

  let result = render(memories, modeSection, extra)
  if (result.length <= maxChars) return result

  // 1) Cắt ngữ cảnh thêm, 2) cắt skill, 3) bỏ dần memory cũ (cuối danh sách).
  const budget = (other: string): number => maxChars - (result.length - other.length)
  const clippedExtra = extra ? clip(extra, Math.max(0, budget(extra))) : ''
  result = render(memories, modeSection, clippedExtra)
  if (result.length <= maxChars) return result

  const clippedMode = clip(modeSection, Math.max(0, budget(modeSection)))
  result = render(memories, clippedMode, clippedExtra)
  const mem = [...memories]
  while (result.length > maxChars && mem.length > 0) {
    mem.pop()
    result = render(mem, clippedMode, clippedExtra)
  }
  return clip(result, maxChars)
}
