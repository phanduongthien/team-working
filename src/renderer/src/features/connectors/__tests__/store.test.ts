import { describe, expect, it } from 'vitest'
import { gmailCredentialsSchema, telegramCodeSchema, telegramCredentialsSchema } from '@shared/connectors'
import { daysLeft, invalid, parseBlocked, toggleChat } from '../store'

describe('connectors store', () => {
  const chat = (id: string, sensitive = false) => ({ id, allowed: false, sensitive })

  it('allowlist: bật → thêm vào allow, tắt → bỏ ra', () => {
    const s = { mode: 'allowlist' as const, allow: ['1'], block: [] }
    expect(toggleChat(s, chat('2'), true)).toEqual({ allow: ['1', '2'], block: [] })
    expect(toggleChat(s, chat('1'), false)).toEqual({ allow: [], block: [] })
  })

  it('blocklist: tắt → chặn; bật chat nhạy cảm → phải cho phép rõ', () => {
    const s = { mode: 'blocklist' as const, allow: [], block: ['1'] }
    expect(toggleChat(s, chat('1'), true)).toEqual({ allow: [], block: [] })
    expect(toggleChat(s, chat('2'), false)).toEqual({ allow: [], block: ['1', '2'] })
    expect(toggleChat(s, chat('3', true), true)).toEqual({ allow: ['3'], block: ['1'] })
  })

  it('số ngày còn lại trước khi Google buộc đăng nhập lại', () => {
    const day = 24 * 60 * 60 * 1000
    expect(daysLeft(null)).toBeNull()
    expect(daysLeft(10 * day, 3 * day + 1)).toBe(7)
    expect(daysLeft(day, 2 * day)).toBe(0)
  })

  it('kiểm tra input trước khi gửi IPC → mã lỗi dễ hiểu', () => {
    expect(invalid(gmailCredentialsSchema, { clientId: 'abc' })).toBe('client_id_invalid')
    expect(invalid(gmailCredentialsSchema, { clientId: '1-a.apps.googleusercontent.com' })).toBeNull()
    expect(invalid(telegramCredentialsSchema, { apiId: 1, apiHash: 'xyz' })).toBe('api_hash_invalid')
    expect(invalid(telegramCodeSchema, '12a')).toBe('code_invalid')
  })

  it('danh sách người gửi bị chặn: tách dòng / dấu phẩy, chữ thường, bỏ trùng', () => {
    expect(parseBlocked('Sep@X.com\n bank.vn, sep@x.com;;\n')).toEqual(['sep@x.com', 'bank.vn'])
  })
})
