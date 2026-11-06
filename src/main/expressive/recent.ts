import type { RecentEntry } from '@shared/expressive'

/** Số mục giữ lại mỗi loại (emoji ~ bàn phím điện thoại; GIF / sticker ít hơn vì là ảnh). */
export const RECENT_MAX = { emoji: 40, gif: 18, sticker: 18 } as const

/** Sau mỗi 7 ngày không dùng, "độ quen" của một mục giảm một nửa. */
const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000

/** Điểm để quyết định mục nào bị loại khi đầy: dùng nhiều + mới dùng → điểm cao → giữ lâu hơn. */
export const retentionScore = (e: RecentEntry, now: number): number =>
  e.count * 0.5 ** (Math.max(0, now - e.last) / HALF_LIFE_MS)

/**
 * Ghi nhận các lần dùng (theo thứ tự, có thể trùng). Hiển thị xếp theo lần dùng gần nhất;
 * khi vượt `max`, loại mục có điểm giữ lại thấp nhất — nhưng không loại mục vừa dùng.
 */
export function recordUse(list: RecentEntry[], keys: string[], now: number, max: number): RecentEntry[] {
  const map = new Map(list.map((e) => [e.key, { ...e }]))
  keys.forEach((key, i) => {
    const prev = map.get(key)
    map.delete(key)
    // +i để các mục cùng một lần gửi vẫn có thứ tự (mục sau = mới hơn).
    map.set(key, { key, count: (prev?.count ?? 0) + 1, last: now + i })
  })
  const used = new Set(keys)
  const out = [...map.values()]
  while (out.length > max) {
    let worst = -1
    out.forEach((e, i) => {
      if (used.has(e.key)) return
      if (worst < 0) return void (worst = i)
      const a = retentionScore(e, now)
      const b = retentionScore(out[worst], now)
      if (a < b || (a === b && e.last < out[worst].last)) worst = i
    })
    if (worst < 0) break
    out.splice(worst, 1)
  }
  return sortRecent(out).slice(0, max)
}

export const sortRecent = (list: RecentEntry[]): RecentEntry[] => [...list].sort((a, b) => b.last - a.last)
