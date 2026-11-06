import { z } from 'zod'

/** Mức biểu cảm thực tế của một lượt trả lời. */
export const EXPRESS_LEVELS = ['off', 'low', 'medium', 'high'] as const
export type ExpressLevel = (typeof EXPRESS_LEVELS)[number]
/** Người dùng chọn: một mức cố định hoặc "Tự động (tăng dần)". */
export const EXPRESS_MODES = [...EXPRESS_LEVELS, 'auto'] as const
export type ExpressMode = (typeof EXPRESS_MODES)[number]

export const levelIndex = (l: ExpressLevel): number => EXPRESS_LEVELS.indexOf(l)
export const minLevel = (a: ExpressLevel, b: ExpressLevel): ExpressLevel =>
  levelIndex(a) <= levelIndex(b) ? a : b

export const expressiveSettingsSchema = z.object({
  mode: z.enum(EXPRESS_MODES),
  /** Trần cho chế độ tự động (vd không bao giờ vượt "Vừa"). */
  max: z.enum(EXPRESS_LEVELS).exclude(['off'])
})
export type ExpressiveSettings = z.infer<typeof expressiveSettingsSchema>
/** Mặc định TẮT với mọi người — ai muốn thì tự bật trong Cài đặt. */
export const DEFAULT_EXPRESSIVE_SETTINGS: ExpressiveSettings = { mode: 'off', max: 'high' }

export type Reaction = { emoji: string; by: 'user' | 'assistant' }

export const MEDIA_KINDS = ['gif', 'sticker'] as const
export type MediaKind = (typeof MEDIA_KINDS)[number]
/** GIF / sticker đính kèm tin nhắn. GIPHY: url luôn là https://*.giphy.com do main kiểm tra; local: url rỗng, renderer hỏi main theo id. */
export type MessageMedia = {
  kind: MediaKind
  source: 'giphy' | 'local'
  id: string
  title: string
  url: string
  width: number
  height: number
}

/** Mục trong bộ chọn (kết quả GIPHY hoặc sticker local). */
export type MediaItem = MessageMedia

export type MediaRef = { kind: MediaKind; source: 'giphy' | 'local'; id: string }
export const mediaRefSchema = z.object({
  kind: z.enum(['gif', 'sticker']),
  source: z.enum(['giphy', 'local']),
  id: z.string().min(1).max(200)
})

export type ExpressiveStatus = {
  settings: ExpressiveSettings
  /** Mức hiện tại của chế độ tự động (đã áp trần). */
  autoLevel: Exclude<ExpressLevel, 'off'>
  trend: 'up' | 'down' | 'steady'
  giphyKey: 'env' | 'user' | null
  stickersDir: string
}

export type MediaSearchResult = { items: MediaItem[] } | { error: string }

/** Bắt đầu thẻ biểu cảm (kể cả viết sai chữ hoa/thường hoặc tên gần đúng). */
const TAG_NAMES = 'react|reaction|emoji|gif|sticker'
const FULL_TAG = new RegExp(String.raw`\[\[\s*(?:${TAG_NAMES})\b[^\]\n]{0,120}\]\]?`, 'gi')
const PARTIAL_TAIL = /\[(?:\[[^\]\n]{0,120})?$/

/**
 * Bỏ mọi thẻ [[react:…]], [[gif:…]], [[sticker:…]] (cả thẻ viết sai) khỏi chữ hiển thị.
 * `streaming`: ẩn luôn phần thẻ đang gõ dở ở cuối để không lộ "[[gi" lên màn hình.
 */
export function stripExpressTags(text: string, streaming = false): string {
  let out = text.replace(FULL_TAG, '')
  if (streaming) out = out.replace(PARTIAL_TAIL, '')
  return out
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
