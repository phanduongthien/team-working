import { desktopCapturer, nativeImage, screen } from 'electron'
import type { CapturePort } from './service'
import type { DisplayInfo } from './screen'

function displays(): DisplayInfo[] {
  const primary = screen.getPrimaryDisplay().id
  return screen
    .getAllDisplays()
    .map((d) => ({ id: d.id, bounds: d.bounds, scaleFactor: d.scaleFactor, primary: d.id === primary }))
}

/**
 * Chụp màn hình bằng desktopCapturer của Electron — không cần Python cho chế độ chỉ xem.
 * Ảnh thumbnail có thể nhỏ hơn kích thước yêu cầu (Windows giữ tỉ lệ) → quy đổi vùng cắt theo tỉ lệ thật.
 */
export const electronCapture: CapturePort = {
  displays,
  async capture(display, plan) {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: plan.source })
    const source = sources.find((s) => s.display_id === String(display.id)) ?? (sources.length === 1 ? sources[0] : undefined)
    if (!source || source.thumbnail.isEmpty()) throw new Error('Không lấy được ảnh màn hình (Windows có thể đang chặn quyền chụp).')
    const size = source.thumbnail.getSize()
    const k = size.width / plan.source.width
    const crop = {
      x: Math.round(plan.crop.x * k),
      y: Math.round(plan.crop.y * k),
      width: Math.max(1, Math.min(size.width, Math.round(plan.crop.width * k))),
      height: Math.max(1, Math.min(size.height, Math.round(plan.crop.height * k)))
    }
    return source.thumbnail
      .crop(crop)
      .resize({ width: plan.output.width, height: plan.output.height, quality: 'best' })
      .toPNG()
  }
}

/**
 * Màn hình giả một màu (chỉ dùng khi chạy chưa đóng gói với MMC_FAKE_SCREEN=<#rrggbb>) — để test
 * e2e cả đường đi CLI → MCP → app mà KHÔNG gửi màn hình thật của người chạy test cho Claude.
 */
export function fakeCapture(hex: string): CapturePort {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.replace('#', '').slice(i - 1, i + 1), 16) || 0)
  return {
    displays: () => [{ id: 1, bounds: { x: 0, y: 0, width: 1280, height: 800 }, scaleFactor: 1, primary: true }],
    async capture(_display, plan) {
      const { width, height } = plan.output
      const bgra = Buffer.alloc(width * height * 4)
      for (let i = 0; i < width * height; i++) bgra.set([b, g, r, 255], i * 4)
      return nativeImage.createFromBitmap(bgra, { width, height }).toPNG()
    }
  }
}
