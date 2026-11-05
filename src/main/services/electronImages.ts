import { nativeImage } from 'electron'
import type { ImagePort } from './images'

/** ImagePort bằng Electron nativeImage (PNG, JPEG, BMP; WebP/GIF tuỳ nền tảng — size() trả null nếu không đọc được). */
export const electronImages: ImagePort = {
  size(data) {
    const img = nativeImage.createFromBuffer(data)
    return img.isEmpty() ? null : img.getSize()
  },
  encode(data, maxEdge, format, quality = 85) {
    let img = nativeImage.createFromBuffer(data)
    const { width, height } = img.getSize()
    const scale = Math.min(1, maxEdge / Math.max(width, height))
    if (scale < 1) {
      img = img.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), quality: 'best' })
    }
    return format === 'png' ? img.toPNG() : img.toJPEG(quality)
  }
}
