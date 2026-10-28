import { afterEach, describe, expect, it } from 'vitest'
import { OAUTH_REDIRECT_URL } from '@shared/appConfig'
import { OAuthLoopback, isAllowedAuthorizeUrl, parseCallback } from '../oauthLoopback'

describe('isAllowedAuthorizeUrl', () => {
  const base = 'https://abcd.supabase.co'
  it('chỉ cho link authorize của đúng project', () => {
    expect(isAllowedAuthorizeUrl(`${base}/auth/v1/authorize?provider=github`, base)).toBe(true)
    expect(isAllowedAuthorizeUrl('https://evil.example/auth/v1/authorize', base)).toBe(false)
    expect(isAllowedAuthorizeUrl(`${base}/rest/v1/teams`, base)).toBe(false)
    expect(isAllowedAuthorizeUrl('not a url', base)).toBe(false)
    expect(isAllowedAuthorizeUrl(`${base}/auth/v1/authorize`, undefined)).toBe(false)
  })
})

describe('parseCallback', () => {
  it('đọc code hoặc lỗi; bỏ qua đường dẫn khác', () => {
    expect(parseCallback('/auth/callback?code=abc')).toEqual({ code: 'abc' })
    expect(parseCallback('/auth/callback?error=access_denied&error_description=User%20denied')).toEqual({ error: 'User denied' })
    expect(parseCallback('/favicon.ico')).toBeNull()
  })
})

describe('OAuthLoopback', () => {
  const loopback = new OAuthLoopback()
  afterEach(() => loopback.cancel())

  it('nhận đúng một callback rồi đóng cổng', async () => {
    const result = loopback.waitForCode(async () => {
      const res = await fetch(`${OAUTH_REDIRECT_URL}?code=xyz`)
      expect(await res.text()).toContain('Đăng nhập thành công')
    })
    expect(await result).toEqual({ code: 'xyz' })
    await expect(fetch(OAUTH_REDIRECT_URL)).rejects.toThrow()
  })

  it('hủy được khi người dùng bỏ ngang', async () => {
    const result = loopback.waitForCode(async () => {})
    await new Promise((r) => setTimeout(r, 20))
    loopback.cancel()
    expect(await result).toEqual({ error: 'cancelled' })
  })
})
