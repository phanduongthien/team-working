import { describe, expect, it } from 'vitest'
import { GramJsBackend } from '../telegram/gramjs'

// Kết nối THẬT tới máy chủ Telegram bằng GramJS với api_id sai → phải nhận lỗi api_invalid (không cần tài khoản).
// Kiểm tra GramJS nạp được, kết nối MTProto được và lỗi được đổi đúng. Chỉ chạy khi E2E_TELEGRAM=1.
const REAL = process.env.E2E_TELEGRAM === '1'

describe.skipIf(!REAL)('Telegram — GramJS thật', () => {
  it('api_id sai → api_invalid; không có session → restore() = false, không lưu gì', async () => {
    let saved: string | null = null
    const backend = new GramJsBackend({
      apiId: () => 1,
      apiHash: () => '0123456789abcdef0123456789abcdef',
      session: { get: () => saved, set: (v) => void (saved = v), clear: () => void (saved = null), has: () => saved !== null },
      appVersion: 'test',
      log: { info: () => undefined, warn: () => undefined }
    })
    await expect(backend.restore()).resolves.toBe(false)
    await expect(backend.sendCode('+84912345678')).rejects.toThrow('api_invalid')
    expect(saved).toBeNull()
    await backend.cancelLogin()
  }, 60_000)
})
