import { describe, expect, it } from 'vitest'
import { canSeeFeature } from '../access'
import { features } from '../registry'

describe('feature registry', () => {
  it('id và route không trùng', () => {
    expect(new Set(features.map((f) => f.id)).size).toBe(features.length)
    expect(new Set(features.map((f) => f.route)).size).toBe(features.length)
  })

  it.each(features.map((f) => [f.id, f] as const))('%s có tên menu ở cả vi và en', (_id, f) => {
    for (const lang of ['vi', 'en'] as const) {
      const value = f.titleKey.split('.').reduce<unknown>((node, k) => (node as Record<string, unknown> | undefined)?.[k], f.i18n[lang])
      expect(typeof value).toBe('string')
    }
  })

  it('route bắt đầu bằng /', () => {
    for (const f of features) expect(f.route.startsWith('/')).toBe(true)
  })
})

describe('canSeeFeature', () => {
  it('roles rỗng = ai cũng thấy, kể cả chưa vào team', () => {
    expect(canSeeFeature({ roles: [] }, null)).toBe(true)
    expect(canSeeFeature({ roles: [] }, 'member')).toBe(true)
  })

  it('giới hạn theo vai trò', () => {
    const f = { roles: ['owner', 'manager'] as const }
    expect(canSeeFeature({ roles: [...f.roles] }, 'manager')).toBe(true)
    expect(canSeeFeature({ roles: [...f.roles] }, 'member')).toBe(false)
    expect(canSeeFeature({ roles: [...f.roles] }, null)).toBe(false)
  })
})
