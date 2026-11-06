/** Một emoji trong bộ chọn: tên + từ khoá tiếng Việt và tiếng Anh để tìm. */
export type EmojiEntry = { unicode: string; group: number; label: string; search: string }

type Compact = {
  unicode: string
  label: string
  group?: number
  order?: number
  tags?: string[]
  hexcode: string
}

let cache: Promise<EmojiEntry[]> | null = null

const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .toLowerCase()

/** Tải dữ liệu emoji (≈1 MB) chỉ khi mở bộ chọn lần đầu. */
export function loadEmojis(lang: string): Promise<EmojiEntry[]> {
  cache ??= Promise.all([
    import('emojibase-data/vi/compact.json'),
    import('emojibase-data/en/compact.json')
  ]).then(([vi, en]) => {
    const english = new Map((en.default as Compact[]).map((e) => [e.hexcode, e]))
    return (vi.default as Compact[])
      .filter((e) => e.group !== undefined && e.group !== 2) // bỏ nhóm "thành phần" (màu da…)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((e) => {
        const enEntry = english.get(e.hexcode)
        const label = lang === 'en' && enEntry ? enEntry.label : e.label
        return {
          unicode: e.unicode,
          group: e.group ?? 0,
          label,
          search: fold(
            [e.label, ...(e.tags ?? []), enEntry?.label ?? '', ...(enEntry?.tags ?? [])].join(' ')
          )
        }
      })
  })
  return cache
}

/** Tìm theo tên/từ khoá, không phân biệt dấu ("cuoi" khớp "cười"). */
export function searchEmojis(list: EmojiEntry[], query: string, limit = 120): EmojiEntry[] {
  const words = fold(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return list
  return list.filter((e) => words.every((w) => e.search.includes(w))).slice(0, limit)
}

const RECENT_KEY = 'mmc.recentEmojis'
const RECENT_MAX = 24

export function recentEmojis(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string').slice(0, RECENT_MAX)
      : []
  } catch {
    return []
  }
}

export function pushRecentEmoji(emoji: string): void {
  localStorage.setItem(
    RECENT_KEY,
    JSON.stringify([emoji, ...recentEmojis().filter((e) => e !== emoji)].slice(0, RECENT_MAX))
  )
}

export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🙏']
