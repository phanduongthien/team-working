/**
 * Xử lý ảnh đính kèm: nhận dạng định dạng theo nội dung (magic bytes), tạo bản cho Claude khi ảnh
 * vượt giới hạn, và thumbnail. Giải mã/mã hoá nằm sau `ImagePort` (Electron nativeImage ở app thật).
 *
 * Giới hạn của Claude (docs Vision, kiểm tra 2026-11-05): JPEG/PNG/GIF/WebP; mỗi ảnh ≤ 8000x8000 px và
 * ≤ 10 MB (base64); model 4.7 trở lên tự thu nhỏ ảnh có cạnh dài > 2.576 px. Ta thu nhỏ trước về
 * 2.576 px và ≤ 5 MB (≈ 6,7 MB base64) để không bao giờ chạm giới hạn và không tốn token vô ích.
 */

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/bmp'
export type ImageSize = { width: number; height: number }

export type ImagePort = {
  /** Kích thước ảnh; null nếu không giải mã được (vd WebP/GIF động tuỳ nền tảng). */
  size(data: Buffer): ImageSize | null
  /** Thu nhỏ (giữ tỉ lệ) để cạnh dài ≤ maxEdge rồi mã hoá. Không phóng to ảnh nhỏ. */
  encode(data: Buffer, maxEdge: number, format: 'png' | 'jpeg', quality?: number): Buffer
}

export const MODEL_MAX_EDGE = 2576
export const MODEL_MAX_BYTES = 5 * 1024 * 1024
export const THUMB_EDGE = 320
/** Định dạng Claude nhận trực tiếp. BMP (vd từ Print Screen của một số app) phải đổi sang PNG. */
export const CLAUDE_IMAGE_TYPES: readonly ImageMime[] = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']

/** Nhận dạng ảnh theo nội dung — không tin đuôi file hay MIME do renderer gửi. */
export function sniffImage(buf: Buffer): ImageMime | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString('latin1'))) return 'image/gif'
  if (buf.length >= 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp'
  if (buf.length >= 2 && buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp'
  return null
}

export const extFor = (mime: ImageMime): string =>
  ({ 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp' })[mime]

export type ModelCopy = { data: Buffer; mime: 'image/png' | 'image/jpeg' }

/**
 * Bản gửi cho Claude. null = dùng thẳng bản gốc (đã nằm trong giới hạn).
 * Ném lỗi 'image_unsupported' nếu không giải mã được mà bản gốc cũng không gửi thẳng được.
 */
export function modelCopy(port: ImagePort, data: Buffer, mime: ImageMime): ModelCopy | null {
  const size = port.size(data)
  const longEdge = size ? Math.max(size.width, size.height) : 0
  const accepted = CLAUDE_IMAGE_TYPES.includes(mime)
  if (accepted && data.length <= MODEL_MAX_BYTES && (!size || longEdge <= MODEL_MAX_EDGE)) return null
  if (!size) throw new Error('image_unsupported')

  // Ảnh chụp màn hình (chữ, giao diện) giữ PNG nếu đủ nhỏ; ảnh chụp thường (JPEG) giữ JPEG.
  const preferPng = mime !== 'image/jpeg'
  if (preferPng) {
    const png = port.encode(data, MODEL_MAX_EDGE, 'png')
    if (png.length <= MODEL_MAX_BYTES) return { data: png, mime: 'image/png' }
  }
  for (const [edge, quality] of [
    [MODEL_MAX_EDGE, 85],
    [MODEL_MAX_EDGE, 70],
    [Math.round(MODEL_MAX_EDGE * 0.75), 70]
  ] as const) {
    const jpeg = port.encode(data, edge, 'jpeg', quality)
    if (jpeg.length <= MODEL_MAX_BYTES) return { data: jpeg, mime: 'image/jpeg' }
  }
  throw new Error('image_too_large')
}

/** Thumbnail JPEG nhỏ cho khung soạn tin / lịch sử; null nếu không giải mã được. */
export function thumbnail(port: ImagePort, data: Buffer): Buffer | null {
  return port.size(data) ? port.encode(data, THUMB_EDGE, 'jpeg', 80) : null
}
