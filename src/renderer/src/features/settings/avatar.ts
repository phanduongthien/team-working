export const PRESET_AVATARS = ['🌤️', '🤖', '🦉', '🐱', '🦊', '🐼', '🚀', '🌱', '📚', '✨'] as const

const SIZE = 128

/** Thu ảnh upload về 128×128 PNG (cắt giữa) để lưu gọn trong settings. */
export async function imageFileToAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas_unavailable')
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE)
  bitmap.close()
  return canvas.toDataURL('image/png')
}
