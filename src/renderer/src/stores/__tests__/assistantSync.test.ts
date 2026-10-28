import { describe, expect, it } from 'vitest'
import { decideAssistantSync } from '../assistantSync'

describe('decideAssistantSync', () => {
  const base = { uid: 'u1', lastSyncedUser: 'u1' }

  it('tài khoản chưa có bản lưu → đẩy cài đặt trên máy lên', () => {
    expect(decideAssistantSync({ ...base, remoteUpdatedAt: null, localUpdatedAt: 0 })).toBe('push')
  })

  it('máy từng đồng bộ với tài khoản khác → luôn lấy bản của tài khoản đang đăng nhập', () => {
    expect(decideAssistantSync({ uid: 'u2', lastSyncedUser: 'u1', remoteUpdatedAt: 1, localUpdatedAt: 999 })).toBe('pull')
    expect(decideAssistantSync({ uid: 'u2', lastSyncedUser: null, remoteUpdatedAt: 1, localUpdatedAt: 999 })).toBe('pull')
  })

  it('cùng tài khoản: bản mới hơn thắng, bằng nhau thì không làm gì', () => {
    expect(decideAssistantSync({ ...base, remoteUpdatedAt: 200, localUpdatedAt: 100 })).toBe('pull')
    expect(decideAssistantSync({ ...base, remoteUpdatedAt: 100, localUpdatedAt: 200 })).toBe('push')
    expect(decideAssistantSync({ ...base, remoteUpdatedAt: 100, localUpdatedAt: 100 })).toBe('none')
  })
})
