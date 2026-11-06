/**
 * Đánh dấu chữ khớp trong trích đoạn kết quả tìm kiếm (FTS snippet). Ký tự điều khiển nên không
 * lẫn với nội dung tin nhắn; renderer tách theo hai dấu này để tô đậm.
 */
export const SNIPPET_OPEN = '\u0001'
export const SNIPPET_CLOSE = '\u0002'

/** Tách trích đoạn thành các phần thường / phần khớp. */
export function snippetParts(snippet: string): { text: string; hit: boolean }[] {
  const parts: { text: string; hit: boolean }[] = []
  const re = new RegExp(`${SNIPPET_OPEN}([^${SNIPPET_CLOSE}]*)${SNIPPET_CLOSE}`, 'g')
  let last = 0
  for (const m of snippet.matchAll(re)) {
    if (m.index > last) parts.push({ text: snippet.slice(last, m.index), hit: false })
    if (m[1]) parts.push({ text: m[1], hit: true })
    last = m.index + m[0].length
  }
  const rest = snippet.slice(last).replace(new RegExp(`[${SNIPPET_OPEN}${SNIPPET_CLOSE}]`, 'g'), '')
  if (rest) parts.push({ text: rest, hit: false })
  return parts
}
