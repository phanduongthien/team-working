import type { MemoryCategory } from '@shared/schemas'
import type { Memory } from '@shared/types'

export type SelectOptions = {
  /** Số memory tối đa đưa vào prompt. */
  limit?: number
  /** Tổng số ký tự tối đa (xấp xỉ giới hạn token). */
  maxChars?: number
  now?: number
}

const DAY = 86_400_000

/** Loại memory luôn hữu ích dù không khớp từ khóa (cách trả lời, mục tiêu). */
const CATEGORY_BONUS: Record<MemoryCategory, number> = {
  preference: 2,
  goal: 1.5,
  deadline: 1,
  project: 0.5,
  skill: 0.5,
  other: 0
}

const STOPWORDS = new Set(
  // Đã bỏ dấu nên tránh từ dễ trùng nghĩa khác (vd "do" = "đồ" trong "đồ án").
  'va la cua co cho voi trong nhung cac mot nay khi thi de duoc khong toi minh ban em anh ve tu den nhu da se dang rat cung hay hoac the nao gi ai and the of to in for is are on with my you'.split(
    ' '
  )
)

/** Chuẩn hóa để so khớp: thường, bỏ dấu tiếng Việt (kể cả đ), tách từ. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t))
}

/**
 * Chọn memory liên quan để chèn vào system prompt.
 * Điểm = số từ khóa trùng với câu hỏi (×3) + thưởng theo loại + độ mới (giảm dần trong ~30 ngày).
 * Kết quả xếp theo điểm, cắt theo `limit` và tổng `maxChars`.
 */
export function selectMemories(memories: Memory[], query: string, opts: SelectOptions = {}): Memory[] {
  const { limit = 15, maxChars = 3000, now = Date.now() } = opts
  const queryTokens = new Set(tokenize(query))

  const scored = memories.map((m) => {
    const tokens = new Set(tokenize(m.content))
    let overlap = 0
    for (const t of tokens) if (queryTokens.has(t)) overlap++
    const freshest = Math.max(m.updatedAt, m.lastUsedAt ?? 0)
    const recency = Math.max(0, 1 - (now - freshest) / (30 * DAY))
    return { m, score: overlap * 3 + CATEGORY_BONUS[m.category] + recency }
  })

  scored.sort((a, b) => b.score - a.score || b.m.updatedAt - a.m.updatedAt)

  const picked: Memory[] = []
  let chars = 0
  for (const { m } of scored) {
    if (picked.length >= limit) break
    if (chars + m.content.length > maxChars) continue
    picked.push(m)
    chars += m.content.length
  }
  return picked
}
