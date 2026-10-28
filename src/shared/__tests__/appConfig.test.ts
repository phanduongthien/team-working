import { describe, expect, it } from 'vitest'
import { appEnvironment, parseSupabaseConfig } from '../appConfig'

const jwt = (payload: object): string =>
  ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join('.')

describe('parseSupabaseConfig', () => {
  it('chấp nhận URL + publishable/anon key', () => {
    expect(
      parseSupabaseConfig({ VITE_SUPABASE_URL: ' https://abc.supabase.co ', VITE_SUPABASE_ANON_KEY: 'sb_publishable_' + 'x'.repeat(30) })
    ).toEqual({ url: 'https://abc.supabase.co', anonKey: 'sb_publishable_' + 'x'.repeat(30) })
    expect(
      parseSupabaseConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon' }) })
    ).not.toBeNull()
  })

  it('thiếu biến hoặc sai định dạng → null (app chạy chế độ không có team)', () => {
    expect(parseSupabaseConfig({})).toBeNull()
    expect(parseSupabaseConfig({ VITE_SUPABASE_URL: 'abc', VITE_SUPABASE_ANON_KEY: 'x'.repeat(40) })).toBeNull()
  })

  it('từ chối service-role / secret key', () => {
    const url = 'https://abc.supabase.co'
    expect(parseSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: 'sb_secret_' + 'x'.repeat(30) })).toBeNull()
    expect(parseSupabaseConfig({ VITE_SUPABASE_URL: url, VITE_SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) })).toBeNull()
  })
})

describe('appEnvironment', () => {
  it('chỉ mode production mới là production', () => {
    expect(appEnvironment('production')).toBe('production')
    expect(appEnvironment('development')).toBe('development')
    expect(appEnvironment(undefined)).toBe('development')
  })

  it('VITE_APP_ENV khai báo trong .env thắng mode (bản build trỏ project dev vẫn là DEV)', () => {
    expect(appEnvironment('production', 'development')).toBe('development')
    expect(appEnvironment('development', 'production')).toBe('production')
    expect(appEnvironment('production', 'lạ')).toBe('production')
  })
})
