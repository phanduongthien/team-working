import type { ConversationGroup } from '@shared/types'

/**
 * Sắp xếp cuộc trò chuyện — phần thuần (không DB, không AI): đặt tiêu đề tạm từ tin đầu,
 * gợi ý nhóm bằng so khớp từ khoá (không tốn hạn mức), dựng prompt + đọc kết quả cho model rẻ.
 */

export const TITLE_MAX = 60

/** Bỏ dấu + chữ thường để so khớp ("Học" = "hoc"). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
}

/** Cắt gọn một dòng: ưu tiên cắt ở ranh giới từ. */
export function shorten(text: string, max = TITLE_MAX): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= max) return oneLine
  const cut = oneLine.slice(0, max - 1)
  const space = cut.lastIndexOf(' ')
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`
}

/** title="..." trong lời nhắn (mẫu artifact / lệnh tạo artifact). Chấp nhận cả bản đã bị cắt mất dấu đóng. */
const TITLE_ATTR = /\btitle\s*=\s*["'“]([^"'”\n]+)["'”]?/i

/**
 * Tiêu đề tạm từ tin nhắn đầu tiên. Lời nhắn kiểu `Tạo artifact type="doc" title="GDD"…` (mẫu làm game)
 * → lấy đúng tên artifact thay vì hiện chữ thô. Bỏ khối code, ký hiệu Markdown, chỉ lấy dòng có nội dung đầu tiên.
 */
export function titleFromPrompt(text: string): string {
  const attr = TITLE_ATTR.exec(text)?.[1]?.replace(/…$/, '').trim()
  if (attr) return shorten(attr)
  const body = text
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .split('\n')
    .map((l) => l.replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+/, '').replace(/[`*_~]/g, '').trim())
    .find((l) => l.length > 0)
  return shorten(body ?? text)
}

/** Tiêu đề cũ bị lỗi chữ thô (bản trước) → có sửa được không. */
export function fixRawTitle(title: string): string | null {
  if (!/^\s*(tạo|tao|create)\s+artifact\b/i.test(title)) return null
  const fixed = titleFromPrompt(title)
  return fixed && fixed !== title ? fixed : null
}

const STOPWORDS = new Set(
  (
    'la va cua cho voi nhung cac mot nay kia thi ma de khong co duoc trong ngoai minh ban toi em anh chi oi nhe nha a ' +
    'gi sao the nao lam giup hay hoi muon can biet ve tu den khi neu vay roi da dang se vi nen cung chu nhi ' +
    'the and the for with this that what how why can you please about from into have are was were not but'
  ).split(' ')
)

/** Từ có nghĩa (≥2 ký tự, bỏ từ nối) của một chuỗi đã bỏ dấu. */
export function keywords(text: string): string[] {
  return normalize(text)
    .split(/[^\p{L}\p{N}#+]+/u)
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w))
}

export type GroupSample = ConversationGroup & { titles: string[] }

/**
 * Gợi ý nhóm bằng so khớp từ khoá: tên nhóm xuất hiện nguyên cụm (+4), từng từ ≥3 ký tự của tên nhóm (+2),
 * từ trùng với tiêu đề các cuộc đã có trong nhóm (+1, tối đa 3). Cần ≥3 điểm và không hoà → mới gợi ý.
 */
export function suggestByKeywords(text: string, groups: GroupSample[]): string | null {
  const norm = ` ${keywords(text).join(' ')} `
  const words = new Set(norm.trim().split(' '))
  let best: { id: string; score: number } | null = null
  let tie = false
  for (const g of groups) {
    const nameWords = keywords(g.name)
    let score = 0
    if (nameWords.length && norm.includes(` ${nameWords.join(' ')} `)) score += 4
    for (const w of nameWords) if (w.length >= 3 && words.has(w)) score += 2
    const seen = new Set(g.titles.flatMap(keywords).filter((w) => w.length >= 3 && !nameWords.includes(w)))
    score += Math.min(3, [...seen].filter((w) => words.has(w)).length)
    if (score < 3) continue
    if (!best || score > best.score) {
      best = { id: g.id, score }
      tie = false
    } else if (score === best.score) tie = true
  }
  return best && !tie ? best.id : null
}

export const ORGANIZE_MARKER = '## Sắp xếp cuộc trò chuyện'

export function organizeSystemPrompt(): string {
  return [
    ORGANIZE_MARKER,
    'Bạn đặt tiêu đề ngắn cho một cuộc trò chuyện và (nếu được hỏi) chọn nhóm phù hợp.',
    '- Tiêu đề: 2–6 từ, cùng ngôn ngữ với người dùng, nêu đúng chủ đề, không dấu ngoặc kép, không emoji, không dấu chấm cuối.',
    '- Nhóm: chỉ chọn MỘT tên trong danh sách nếu thật sự hợp; không chắc thì null. Không tự nghĩ ra nhóm mới.',
    'Chỉ trả lời đúng một dòng JSON: {"title": "...", "group": "<tên nhóm>" | null}'
  ].join('\n')
}

export function organizePrompt(input: { user: string; reply: string; groups: string[] | null }): string {
  const clip = (s: string): string => (s.length > 1500 ? `${s.slice(0, 1500)}…` : s)
  return [
    input.groups
      ? `Các nhóm hiện có: ${input.groups.map((g) => JSON.stringify(g)).join(', ')}`
      : 'Không cần chọn nhóm (trả "group": null).',
    '',
    `Người dùng: ${clip(input.user)}`,
    '',
    `Trợ lý: ${clip(input.reply)}`
  ].join('\n')
}

/** Đọc kết quả model: tiêu đề hợp lệ (đã cắt gọn) + id nhóm khớp đúng một nhóm có sẵn. */
export function parseOrganize(
  text: string,
  groups: ConversationGroup[]
): { title: string | null; groupId: string | null } | null {
  const json = /\{[\s\S]*\}/.exec(text)?.[0]
  if (!json) return null
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const { title, group } = raw as { title?: unknown; group?: unknown }
  const cleanTitle =
    typeof title === 'string' ? shorten(title.replace(/^["'“]+|["'”.]+$/g, '').trim()) || null : null
  const key = typeof group === 'string' ? normalize(group).trim() : ''
  const groupId = key ? (groups.find((g) => normalize(g.name).trim() === key)?.id ?? null) : null
  return { title: cleanTitle, groupId }
}
