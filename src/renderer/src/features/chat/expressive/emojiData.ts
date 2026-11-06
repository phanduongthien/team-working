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

export const QUICK_REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🙏']
