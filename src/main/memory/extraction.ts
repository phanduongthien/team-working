import {
  MEMORY_CATEGORIES,
  memorySuggestionsOutputSchema,
  type MemoryAction,
  type MemoryCategory
} from '@shared/schemas'
import type { Memory, Message } from '@shared/types'

export const MAX_TRANSCRIPT_CHARS = 20_000
const MAX_EXISTING = 100

export type ParsedSuggestion = {
  action: MemoryAction
  targetMemoryId: string | null
  content: string
  category: MemoryCategory
}

/** Ghép đoạn hội thoại cần trích (giữ phần cuối nếu quá dài) + danh sách memory hiện có. */
export function buildExtractionPrompt(messages: Message[], existing: Memory[]): string {
  let transcript = messages
    .filter((m) => m.content.trim())
    .map((m) => `${m.role === 'user' ? 'NGƯỜI DÙNG' : 'TRỢ LÝ'}: ${m.content.trim()}`)
    .join('\n\n')
  if (transcript.length > MAX_TRANSCRIPT_CHARS) transcript = `…${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`

  const known = existing
    .slice(0, MAX_EXISTING)
    .map((m) => `- id=${m.id} [${m.category}] ${m.content}`)
    .join('\n')

  return [
    'Đọc đoạn hội thoại dưới đây và đề xuất thông tin nên ghi nhớ về NGƯỜI DÙNG theo đúng hướng dẫn.',
    'Chỉ trả về MỘT khối JSON hợp lệ, không thêm lời giải thích.',
    '',
    '## Memory hiện có',
    known || '(chưa có)',
    '',
    '## Hội thoại',
    transcript
  ].join('\n')
}

/** Lấy khối JSON đầu tiên trong câu trả lời (có thể nằm trong ```json … ```). */
export function extractJsonBlock(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Parse + làm sạch đề xuất: bỏ mục không hợp lệ, update/delete phải trỏ tới memory có thật,
 * add/update phải có nội dung, bỏ mục trùng memory hiện có hoặc trùng nhau.
 * Trả null nếu đầu ra không đúng định dạng.
 */
export function parseSuggestions(text: string, existing: Memory[]): ParsedSuggestion[] | null {
  const parsed = memorySuggestionsOutputSchema.safeParse(extractJsonBlock(text))
  if (!parsed.success) return null

  const byId = new Map(existing.map((m) => [m.id, m]))
  const seen = new Set(existing.map((m) => normalize(m.content)))
  const result: ParsedSuggestion[] = []

  for (const item of parsed.data.items) {
    const category = (MEMORY_CATEGORIES as readonly string[]).includes(item.category ?? '')
      ? (item.category as MemoryCategory)
      : 'other'
    const content = item.content.trim()

    if (item.action === 'add') {
      if (!content || seen.has(normalize(content))) continue
      seen.add(normalize(content))
      result.push({ action: 'add', targetMemoryId: null, content, category })
      continue
    }

    const target = item.id ? byId.get(item.id) : undefined
    if (!target) continue
    if (item.action === 'update') {
      if (!content || normalize(content) === normalize(target.content)) continue
      result.push({ action: 'update', targetMemoryId: target.id, content, category })
    } else {
      result.push({ action: 'delete', targetMemoryId: target.id, content: target.content, category: target.category })
    }
  }
  return result
}
