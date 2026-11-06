import { stripExpressTags } from './expressive'

/**
 * Chỉ giữ phần "lời nói chuyện" để đọc to: bỏ code, đường dẫn, URL, log lỗi dài, markdown,
 * emoji / kaomoji và thẻ GIF/sticker.
 */
export function speakableText(markdown: string): string {
  let t = stripExpressTags(markdown)
  t = t.replace(/```[\s\S]*?(?:```|$)/g, ' ') // khối code (kể cả chưa đóng)
  t = t
    .split('\n')
    // dòng log / stack trace / đường dẫn dài
    .filter(
      (line) =>
        !/^\s*(?:at |File "|Traceback|\[?\d{2}:\d{2}:\d{2}|(?:Error|Exception|WARN|ERROR|INFO)\b.{40,})/.test(
          line
        )
    )
    .join('\n')
  t = t.replace(/`[^`\n]*`/g, ' ')
  t = t.replace(/https?:\/\/\S+/g, ' ')
  t = t.replace(/(?:[A-Za-z]:\\|\.{0,2}\/)?(?:[\w.-]+[\\/]){2,}[\w.-]+/g, ' ') // đường dẫn file
  t = t.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [chữ](link) → chữ
  t = t.replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, '')
  t = t.replace(/[*_~|]+/g, '')
  t = t.replace(
    /\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu,
    ''
  )
  t = t.replace(/[:=]\)\)+|\^\^|:3\b|:v\b|:D\b|xD\b/gi, '')
  return t
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

const MAX_CHUNK = 220

/** Chia thành từng câu để đọc dần — câu đầu phát ngay, không chờ cả bài. */
export function speechChunks(markdown: string): string[] {
  const text = speakableText(markdown)
  if (!text) return []
  const sentences = text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s))
  const out: string[] = []
  for (const s of sentences) {
    if (s.length <= MAX_CHUNK) out.push(s)
    else for (const part of s.split(/(?<=[,;:])\s+/)) out.push(part)
  }
  // Câu quá ngắn gộp với câu sau cho tự nhiên.
  return out.reduce<string[]>((acc, s) => {
    const last = acc.at(-1)
    if (last && last.length < 25 && last.length + s.length < MAX_CHUNK)
      acc[acc.length - 1] = `${last} ${s}`
    else acc.push(s)
    return acc
  }, [])
}
