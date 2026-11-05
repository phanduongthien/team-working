const HOUR_MS = 60 * 60 * 1000

/**
 * Giới hạn số yêu cầu mỗi agent trong 1 giờ (cửa sổ trượt). Mỗi yêu cầu từ agent khác tốn hạn mức gói
 * Claude của người dùng — một agent chạy vòng lặp lỗi không được đốt hết hạn mức.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>()

  constructor(
    private readonly perHour: () => number,
    private readonly now: () => number = Date.now
  ) {}

  /** Ghi nhận một yêu cầu nếu còn hạn mức; nếu hết, trả số giây phải chờ. */
  take(key: string): { ok: true } | { ok: false; retryAfterSec: number } {
    const now = this.now()
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < HOUR_MS)
    if (recent.length >= this.perHour()) {
      this.hits.set(key, recent)
      return { ok: false, retryAfterSec: Math.max(1, Math.ceil((recent[0] + HOUR_MS - now) / 1000)) }
    }
    recent.push(now)
    this.hits.set(key, recent)
    return { ok: true }
  }

  reset(key?: string): void {
    if (key) this.hits.delete(key)
    else this.hits.clear()
  }
}
