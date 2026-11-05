import { describe, expect, it } from 'vitest'
import { RateLimiter } from '../rateLimiter'
import { QueueFullError, TaskQueue } from '../taskQueue'
import { bearer, hashToken, newToken, tokenMatches } from '../tokens'

describe('tokens', () => {
  it('token có tiền tố, chỉ lưu bản băm; so khớp đúng token', () => {
    const t = newToken()
    expect(t).toMatch(/^mzk_[A-Za-z0-9_-]{40,}$/)
    const h = hashToken(t)
    expect(h).not.toContain(t)
    expect(tokenMatches(t, h)).toBe(true)
    expect(tokenMatches(newToken(), h)).toBe(false)
    expect(tokenMatches('abc', h)).toBe(false)
  })
  it('bearer()', () => {
    expect(bearer('Bearer mzk_x')).toBe('mzk_x')
    expect(bearer('bearer   mzk_x')).toBe('mzk_x')
    expect(bearer('Basic abc')).toBeNull()
    expect(bearer(undefined)).toBeNull()
  })
})

describe('RateLimiter', () => {
  it('20 yêu cầu/giờ mỗi agent; hết thì báo thời gian chờ; mỗi agent tính riêng', () => {
    let now = 0
    const rl = new RateLimiter(() => 20, () => now)
    for (let i = 0; i < 20; i++) {
      now = i * 1000
      expect(rl.take('a').ok).toBe(true)
    }
    now = 30_000
    expect(rl.take('a')).toEqual({ ok: false, retryAfterSec: 3600 - 30 })
    expect(rl.take('b').ok).toBe(true)
    // Yêu cầu đầu tiên (t=0) ra khỏi cửa sổ sau 1 giờ.
    now = 3_600_000
    expect(rl.take('a').ok).toBe(true)
    expect(rl.take('a').ok).toBe(false)
  })
})

describe('TaskQueue', () => {
  const deferred = () => {
    let resolve!: (v: string) => void
    const promise = new Promise<string>((r) => (resolve = r))
    return { promise, resolve }
  }

  it('chạy tuần tự khi concurrency = 1', async () => {
    const q = new TaskQueue(() => 1)
    const order: string[] = []
    const a = deferred()
    const p1 = q.push(async () => (order.push('a-start'), a.promise))
    const p2 = q.push(async () => (order.push('b-start'), 'b'))
    await Promise.resolve()
    expect(order).toEqual(['a-start'])
    expect(q.size).toEqual({ running: 1, waiting: 1 })
    a.resolve('a')
    expect(await p1).toBe('a')
    expect(await p2).toBe('b')
    expect(order).toEqual(['a-start', 'b-start'])
  })

  it('hàng chờ đầy → từ chối ngay', async () => {
    const q = new TaskQueue(() => 1, 1)
    const a = deferred()
    void q.push(() => a.promise)
    void q.push(async () => 'b')
    await expect(q.push(async () => 'c')).rejects.toBeInstanceOf(QueueFullError)
    a.resolve('a')
  })

  it('abortAll huỷ việc đang chạy (qua signal) và việc đang chờ', async () => {
    const q = new TaskQueue(() => 1)
    const p1 = q.push((signal) => new Promise((_r, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))))
    const p2 = q.push(async () => 'never')
    q.abortAll()
    await expect(p1).rejects.toThrow('stopped')
    await expect(p2).rejects.toThrow('stopped')
    expect(q.size).toEqual({ running: 0, waiting: 0 })
  })
})
