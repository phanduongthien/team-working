import type { Session } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { savedAccountInfoSchema } from '@shared/schemas'
import { accountInfoFromSession, tokensOf } from '../accountInfo'

const ID = '11111111-1111-4111-8111-111111111111'
const session = (meta: Record<string, unknown>, email = 'an@x.dev'): Session =>
  ({
    access_token: 'at',
    refresh_token: 'rt',
    user: { id: ID, email, user_metadata: meta }
  }) as unknown as Session

describe('accountInfoFromSession', () => {
  it('lấy tên, login, avatar GitHub từ metadata — hợp lệ theo schema IPC', () => {
    const info = accountInfoFromSession(
      session({ user_name: 'an-dev', full_name: 'Nguyễn An', avatar_url: 'https://avatars.githubusercontent.com/u/1' })
    )
    expect(info).toEqual({ id: ID, login: 'an-dev', name: 'Nguyễn An', email: 'an@x.dev', avatarUrl: 'https://avatars.githubusercontent.com/u/1' })
    expect(savedAccountInfoSchema.safeParse(info).success).toBe(true)
  })

  it('thiếu tên thì dùng login; avatar không phải https bị bỏ; giá trị lạ không làm hỏng', () => {
    const info = accountInfoFromSession(session({ user_name: 'binh', avatar_url: 'http://x/a.png', full_name: 42 }, ''))
    expect(info).toMatchObject({ name: 'binh', avatarUrl: null, email: '' })
    expect(savedAccountInfoSchema.safeParse(info).success).toBe(true)
  })

  it('tokensOf chỉ lấy access/refresh token', () => {
    expect(tokensOf(session({}))).toEqual({ accessToken: 'at', refreshToken: 'rt' })
  })
})
