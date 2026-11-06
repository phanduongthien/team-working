import { z } from 'zod'
import {
  EXPRESS_LEVELS,
  levelIndex,
  minLevel,
  type ExpressLevel,
  type ExpressiveSettings
} from '@shared/expressive'

/**
 * Độ thân thiết — chỉ lưu trên máy (bảng settings, key `expressiveStats`), không gọi Claude.
 * Tăng/giảm chậm theo số ngày trò chuyện, số tin và phong cách của người dùng (hay dùng emoji/GIF/sticker/reaction hay không).
 */
export const affinityStatsSchema = z.object({
  level: z.enum(['low', 'medium', 'high']),
  levelSince: z.number(),
  activeDays: z.number(),
  lastDay: z.string(),
  userMessages: z.number(),
  /** Trung bình trượt 0..1: tỉ lệ tin của người dùng có emoji/GIF/sticker/reaction. */
  style: z.number(),
  repliesSinceMedia: z.number(),
  repliesSinceReaction: z.number()
})
export type AffinityStats = z.infer<typeof affinityStatsSchema>
type AutoLevel = AffinityStats['level']

export const initialStats = (now: number): AffinityStats => ({
  level: 'low',
  levelSince: now,
  activeDays: 0,
  lastDay: '',
  userMessages: 0,
  style: 0,
  repliesSinceMedia: 99,
  repliesSinceReaction: 99
})

const DAY = 24 * 60 * 60 * 1000
/** Lên một bậc phải cách lần đổi trước ít nhất 3 ngày; xuống thì 2 ngày. */
export const STEP_UP_MS = 3 * DAY
export const STEP_DOWN_MS = 2 * DAY
const STYLE_ALPHA = 0.1

const dayKey = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

const EMOJI = /\p{Extended_Pictographic}/u

/** Ghi nhận một tin của người dùng. `expressive` = tin có emoji / GIF / sticker, hoặc vừa thả cảm xúc. */
export function recordUserMessage(
  stats: AffinityStats,
  input: { text: string; media: boolean; reacted: boolean },
  now: number
): AffinityStats {
  const today = dayKey(now)
  const expressive = input.media || input.reacted || EMOJI.test(input.text)
  return {
    ...stats,
    activeDays: stats.lastDay === today ? stats.activeDays : stats.activeDays + 1,
    lastDay: today,
    userMessages: stats.userMessages + 1,
    style: stats.style + STYLE_ALPHA * ((expressive ? 1 : 0) - stats.style)
  }
}

/** Người dùng thả cảm xúc (không phải tin nhắn) → phong cách nghiêng về biểu cảm một chút. */
export const recordReaction = (stats: AffinityStats): AffinityStats => ({
  ...stats,
  style: stats.style + (STYLE_ALPHA / 2) * (1 - stats.style)
})

/** Mức mà độ thân thiết hiện tại "xứng đáng". */
export function targetLevel(stats: AffinityStats): AutoLevel {
  if (stats.userMessages >= 20 && stats.style < 0.05) return 'low' // nhắn ngắn gọn, nghiêm túc → Mizuki cũng bớt
  if (stats.activeDays >= 10 && stats.userMessages >= 150 && stats.style >= 0.35) return 'high'
  if (stats.activeDays >= 3 && stats.userMessages >= 30 && stats.style >= 0.15) return 'medium'
  return 'low'
}

/** Đi từng bậc một, có thời gian chờ — không nhảy vọt. */
export function stepAuto(stats: AffinityStats, now: number): AffinityStats {
  const target = targetLevel(stats)
  const cur = levelIndex(stats.level)
  const t = levelIndex(target)
  if (t > cur && now - stats.levelSince >= STEP_UP_MS)
    return { ...stats, level: EXPRESS_LEVELS[cur + 1] as AutoLevel, levelSince: now }
  if (t < cur && now - stats.levelSince >= STEP_DOWN_MS)
    return { ...stats, level: EXPRESS_LEVELS[cur - 1] as AutoLevel, levelSince: now }
  return stats
}

export function trendOf(stats: AffinityStats): 'up' | 'down' | 'steady' {
  const d = levelIndex(targetLevel(stats)) - levelIndex(stats.level)
  return d > 0 ? 'up' : d < 0 ? 'down' : 'steady'
}

/** Mức theo cài đặt (chưa xét ngữ cảnh). */
export function baseLevel(settings: ExpressiveSettings, stats: AffinityStats): ExpressLevel {
  if (settings.mode === 'auto') return minLevel(stats.level, settings.max)
  return settings.mode
}

// \b của JS không hiểu chữ có dấu → tự viết ranh giới từ theo Unicode.
const words = (list: string): RegExp =>
  new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${list})(?![\p{L}\p{N}])`, 'iu')
const SERIOUS_WORDS = words(
  'error|exception|traceback|stack ?trace|bug|crash|failed|lỗi|không chạy|bị treo|gấp|khẩn cấp|deadline'
)
const SERIOUS = (text: string): boolean =>
  text.includes('```') || /\bat \S+:\d+/.test(text) || SERIOUS_WORDS.test(text)
const SAD = words(
  'buồn|mệt|chán|khóc|stress|căng thẳng|áp lực|cô đơn|thất vọng|tệ quá|nản|sad|tired|depressed'
)

export type TurnContext = { mode: string; text: string }

/** Ngữ cảnh được ưu tiên: đang sửa lỗi/làm việc nghiêm túc → tối đa "Ít", không GIF; đang buồn → chỉ reaction nhẹ. */
export function contextAdjust(
  level: ExpressLevel,
  ctx: TurnContext
): { level: ExpressLevel; allowMedia: boolean; mood: 'normal' | 'serious' | 'sad' } {
  if (level === 'off') return { level, allowMedia: false, mood: 'normal' }
  if (SAD.test(ctx.text)) return { level: 'low', allowMedia: false, mood: 'sad' }
  if (ctx.mode === 'code' || SERIOUS(ctx.text))
    return { level: 'low', allowMedia: false, mood: 'serious' }
  return { level, allowMedia: true, mood: 'normal' }
}

/** Khoảng cách tối thiểu (số câu trả lời) giữa hai lần gửi GIF/sticker và giữa hai lần thả reaction. */
export const MEDIA_GAP: Record<Exclude<ExpressLevel, 'off'>, number> = {
  low: 8,
  medium: 4,
  high: 2
}
export const REACTION_GAP: Record<Exclude<ExpressLevel, 'off'>, number> = {
  low: 4,
  medium: 2,
  high: 1
}

export type TurnPlan = {
  /** Mức cho reaction / GIF / sticker (đã xét ngữ cảnh). */
  level: ExpressLevel
  /** Mức emoji trong chữ: không giới hạn cứng, theo mức + bắt chước người dùng. */
  emojiLevel: ExpressLevel
  mimic: 'more' | 'less' | null
  reaction: boolean
  media: boolean
  mood: 'normal' | 'serious' | 'sad'
}

const KAOMOJI = /:\)\)+|=\)\)+|\^\^|:3|(?<![\p{L}])(?:hihi+|hehe+|haha+|kkk+)(?![\p{L}])/giu
/** Số emoji + kiểu chat vui (:)) =)) ^^ :3 hihi…) trong tin của người dùng. */
export function emojiCount(text: string): number {
  return (
    (text.match(/\p{Extended_Pictographic}/gu)?.length ?? 0) + (text.match(KAOMOJI)?.length ?? 0)
  )
}

const shift = (
  l: ExpressLevel,
  d: number,
  floor: ExpressLevel,
  cap: ExpressLevel
): ExpressLevel => {
  const i = Math.min(Math.max(levelIndex(l) + d, levelIndex(floor)), levelIndex(cap))
  return EXPRESS_LEVELS[Math.max(i, 0)]
}

/** Lượt này được phép gì — code chặn spam, không chỉ dựa vào lời nhắc. */
export function planTurn(
  settings: ExpressiveSettings,
  stats: AffinityStats,
  ctx: TurnContext
): TurnPlan {
  const base = baseLevel(settings, stats)
  const adjusted = contextAdjust(base, ctx)
  if (adjusted.level === 'off')
    return {
      level: 'off',
      emojiLevel: 'off',
      mimic: null,
      reaction: false,
      media: false,
      mood: adjusted.mood
    }
  const l = adjusted.level
  // Bắt chước: người dùng nhiều emoji → lên một bậc (không vượt trần người dùng đặt); khô khan → xuống một bậc.
  const cap = settings.mode === 'auto' ? settings.max : settings.mode
  const n = emojiCount(ctx.text)
  const mimic = n >= 3 ? 'more' : n === 0 && stats.style < 0.1 ? 'less' : null
  const emojiLevel =
    adjusted.mood !== 'normal'
      ? 'low'
      : mimic === 'more'
        ? shift(base, 1, 'low', cap)
        : mimic === 'less'
          ? shift(base, -1, 'low', cap)
          : base
  return {
    level: l,
    emojiLevel,
    mimic: adjusted.mood === 'normal' ? mimic : null,
    mood: adjusted.mood,
    reaction: stats.repliesSinceReaction + 1 >= REACTION_GAP[l],
    media: adjusted.allowMedia && stats.repliesSinceMedia + 1 >= MEDIA_GAP[l]
  }
}

/** Ghép hướng dẫn biểu cảm cho lượt này từ skill `expressive` (các phần "## tên"). */
export function expressivePrompt(skill: string, plan: TurnPlan, localStickers: string[]): string {
  const sections = new Map<string, string>()
  for (const part of skill.split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n')
    sections.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim())
  }
  const pick = (name: string | null): string => (name && sections.get(name)) || ''
  const parts = [
    pick(plan.emojiLevel),
    pick(plan.mood === 'normal' ? null : plan.mood),
    pick(plan.mimic ? `mimic-${plan.mimic}` : null)
  ]
  if (plan.reaction || plan.media) {
    const allowed = [
      plan.reaction ? 'được thả 1 reaction' : 'KHÔNG thả reaction',
      plan.media ? 'được gửi 1 GIF/sticker' : 'KHÔNG gửi GIF/sticker'
    ]
    parts.push(pick('tags'), `Lượt này: ${allowed.join(', ')}.`)
    if (plan.media && localStickers.length)
      parts.push(
        `Sticker có sẵn trên máy (dùng [[sticker:local/tên]]): ${localStickers.slice(0, 40).join(', ')}`
      )
  }
  const body = parts.filter(Boolean).join('\n\n')
  return body ? `## Biểu cảm\n${body}` : ''
}

/** Sau một câu trả lời: đếm khoảng cách cho lần sau. */
export const afterReply = (
  stats: AffinityStats,
  used: { reaction: boolean; media: boolean }
): AffinityStats => ({
  ...stats,
  repliesSinceMedia: used.media ? 0 : stats.repliesSinceMedia + 1,
  repliesSinceReaction: used.reaction ? 0 : stats.repliesSinceReaction + 1
})
