import type { UpdateSummary } from '@shared/update'

/** Nhãn đánh dấu bản bắt buộc — đặt trong tiêu đề Release (workflow tự chèn cả vào ghi chú). */
const CRITICAL = /\[critical\]/i

export type RawReleaseNote = { version: string; note?: string | null }

/** Phần của `UpdateInfo` (electron-updater) mà ta dùng. */
export type RawUpdateInfo = {
  version: string
  releaseName?: string | null
  releaseNotes?: string | RawReleaseNote[] | null
  releaseDate?: string
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

/**
 * Ghi chú Release từ feed GitHub là HTML. Chuyển thành chữ thuần (giữ xuống dòng, gạch đầu dòng)
 * để renderer hiển thị như text — không bao giờ render HTML lấy từ mạng.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|pre|blockquote)>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
      }
      return ENTITIES[code.toLowerCase()] ?? m
    })
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const MAX_NOTE_CHARS = 8_000

function normalizeNotes(info: RawUpdateInfo): UpdateSummary['notes'] {
  const raw = info.releaseNotes
  const list: RawReleaseNote[] = Array.isArray(raw) ? raw : raw ? [{ version: info.version, note: raw }] : []
  return list
    .map((n) => ({ version: n.version, text: htmlToText(n.note ?? '').slice(0, MAX_NOTE_CHARS) }))
    .filter((n) => n.text)
}

/**
 * Bắt buộc nếu tiêu đề bản mới nhất có [critical], hoặc ghi chú của BẤT KỲ bản nào nằm giữa bản
 * đang dùng và bản mới nhất có [critical] — để một bản thường ra sau không "che" bản bắt buộc.
 */
export function isCritical(info: RawUpdateInfo): boolean {
  if (CRITICAL.test(info.releaseName ?? '')) return true
  const raw = info.releaseNotes
  const notes = Array.isArray(raw) ? raw.map((n) => n.note ?? '') : [raw ?? '']
  return notes.some((n) => CRITICAL.test(n))
}

export function summarize(info: RawUpdateInfo): UpdateSummary {
  const title = (info.releaseName ?? '').replace(CRITICAL, '').replace(/\s{2,}/g, ' ').trim()
  return {
    version: info.version,
    releaseDate: info.releaseDate,
    title: title || info.version,
    // Dòng đánh dấu [critical] do workflow chèn chỉ dành cho máy đọc; UI đã có nhãn "Bắt buộc".
    notes: normalizeNotes(info)
      .map((n) => ({ ...n, text: n.text.split('\n').filter((line) => !CRITICAL.test(line)).join('\n').trim() }))
      .filter((n) => n.text),
    critical: isCritical(info)
  }
}

/**
 * Có hiện hộp thoại cho bản mới không.
 * - Người dùng tự bấm "Kiểm tra" → luôn hiện.
 * - Bản [critical] → luôn hiện (bỏ qua/để sau không có tác dụng lâu dài).
 * - Đã "Bỏ qua phiên bản này" → không hiện bản đó (bản mới hơn vẫn hiện).
 * - Đã "Để sau" trong phiên này → không hiện tới lần mở app sau.
 */
export function shouldPrompt(input: {
  version: string
  critical: boolean
  manual: boolean
  skippedVersion: string | null
  postponed: ReadonlySet<string>
}): boolean {
  if (input.manual || input.critical) return true
  if (input.skippedVersion === input.version) return false
  return !input.postponed.has(input.version)
}
