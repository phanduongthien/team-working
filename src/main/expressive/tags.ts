import { stripExpressTags } from '@shared/expressive'

export type ParsedTags = {
  text: string
  reaction?: string
  media?: { kind: 'gif' | 'sticker'; query: string } | { kind: 'sticker'; local: string }
}

const TAG = /\[\[\s*(react|gif|sticker)\s*:\s*([^\]\n]{1,80}?)\s*\]\]/gi
const SINGLE_EMOJI =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2})(?:\uFE0F|\u200D|\p{Extended_Pictographic}|\p{Emoji_Modifier})*$/u
/** Thẻ chỉ được là TỪ KHOÁ: không URL, không đường dẫn, không tên miền. */
const LOOKS_LIKE_URL = /[:/\\<>"']|www\.|\.(?:com|net|org|io|gif|png|jpe?g|webp|svg)\b/i
const LOCAL_NAME = /^[\p{L}\p{N} _.-]{1,64}$/u

export const isSingleEmoji = (s: string): boolean => s.length <= 16 && SINGLE_EMOJI.test(s)

/** Tách thẻ biểu cảm của Mizuki: lấy tối đa 1 reaction + 1 GIF/sticker hợp lệ, phần còn lại (kể cả thẻ sai) bị bỏ. */
export function parseExpressTags(raw: string): ParsedTags {
  const result: ParsedTags = { text: stripExpressTags(raw) }
  for (const m of raw.matchAll(TAG)) {
    const kind = m[1].toLowerCase()
    const value = m[2].trim()
    if (kind === 'react') {
      if (!result.reaction && isSingleEmoji(value)) result.reaction = value
      continue
    }
    if (result.media) continue
    if (kind === 'sticker' && /^local\//i.test(value)) {
      const name = value.slice(6).trim()
      if (LOCAL_NAME.test(name) && !name.includes('..'))
        result.media = { kind: 'sticker', local: name }
      continue
    }
    if (value && !LOOKS_LIKE_URL.test(value))
      result.media = { kind: kind as 'gif' | 'sticker', query: value }
  }
  return result
}

const EMOJI_RUN =
  /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*/gu

/** Giữ tối đa `max` emoji ngoài khối code (hỏi lỗi kỹ thuật: 1–2 emoji kể cả ở mức Nhiều). */
export function limitEmoji(text: string, max: number): string {
  let seen = 0
  return text
    .split(/(```[\s\S]*?(?:```|$))/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(EMOJI_RUN, (m) => (++seen <= max ? m : ''))
            .replace(/ {2,}/g, ' ')
            .replace(/ +([.,!?])/g, '$1')
    )
    .join('')
    .trim()
}
