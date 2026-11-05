export type Rect = { x: number; y: number; width: number; height: number }

/** Màn hình theo toạ độ logic (DIP) của Windows, như Electron `screen.getAllDisplays()`. */
export type DisplayInfo = { id: number; bounds: Rect; scaleFactor: number; primary: boolean }

export type CapturePlan = {
  /** Kích thước ảnh gốc cần chụp (pixel vật lý). */
  source: { width: number; height: number }
  /** Vùng cắt trong ảnh gốc (pixel vật lý). */
  crop: Rect
  /** Kích thước ảnh trả về. */
  output: { width: number; height: number }
  /** Vùng đã chụp theo toạ độ logic toàn màn hình (để đổi toạ độ ảnh → màn hình khi thao tác). */
  region: Rect
}

/** Ảnh gửi cho Claude: đủ đọc chữ, không tốn hạn mức vô ích. */
export const DEFAULT_MAX_WIDTH = 1280
export const MAX_WIDTH_LIMIT = 1920

/**
 * Tính vùng chụp. `region` (tuỳ chọn) theo toạ độ logic TƯƠNG ĐỐI với màn hình đó — dùng để
 * "zoom": vùng nhỏ được giữ nguyên độ phân giải (không phóng to quá pixel thật).
 */
export function planCapture(display: DisplayInfo, opts: { region?: Rect; maxWidth?: number } = {}): CapturePlan {
  const { bounds, scaleFactor: s } = display
  const source = { width: Math.round(bounds.width * s), height: Math.round(bounds.height * s) }

  const r = opts.region ?? { x: 0, y: 0, width: bounds.width, height: bounds.height }
  const x = clamp(Math.floor(r.x), 0, bounds.width - 1)
  const y = clamp(Math.floor(r.y), 0, bounds.height - 1)
  const width = clamp(Math.ceil(r.width), 1, bounds.width - x)
  const height = clamp(Math.ceil(r.height), 1, bounds.height - y)

  const crop = {
    x: Math.round(x * s),
    y: Math.round(y * s),
    width: Math.min(Math.round(width * s), source.width - Math.round(x * s)),
    height: Math.min(Math.round(height * s), source.height - Math.round(y * s))
  }
  const maxWidth = clamp(opts.maxWidth ?? DEFAULT_MAX_WIDTH, 200, MAX_WIDTH_LIMIT)
  const ratio = Math.min(1, maxWidth / crop.width)
  const output = { width: Math.max(1, Math.round(crop.width * ratio)), height: Math.max(1, Math.round(crop.height * ratio)) }
  return { source, crop, output, region: { x: bounds.x + x, y: bounds.y + y, width, height } }
}

/** Mô tả kèm ảnh để Claude biết đang nhìn gì và đổi toạ độ ảnh → màn hình. */
export function describeCapture(index: number, display: DisplayInfo, plan: CapturePlan, total: number): string {
  const perPixel = plan.region.width / plan.output.width
  return [
    `Màn hình ${index + 1}/${total}${display.primary ? ' (chính)' : ''}: ${display.bounds.width}x${display.bounds.height} logic, scale ${Math.round(display.scaleFactor * 100)}%.`,
    `Vùng chụp (toạ độ logic toàn màn hình): x=${plan.region.x}, y=${plan.region.y}, ${plan.region.width}x${plan.region.height}.`,
    `Ảnh trả về ${plan.output.width}x${plan.output.height}; 1 px ảnh ≈ ${perPixel.toFixed(2)} px logic.`
  ].join('\n')
}

/** Sắp xếp màn hình: chính trước, rồi trái → phải, trên → dưới — để "màn hình 1" ổn định. */
export function orderDisplays(displays: DisplayInfo[]): DisplayInfo[] {
  return [...displays].sort(
    (a, b) => Number(b.primary) - Number(a.primary) || a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y
  )
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}
