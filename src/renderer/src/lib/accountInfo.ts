import type { Session } from '@supabase/supabase-js'
import type { AccountSession, SavedAccountInfo } from '@shared/schemas'

const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '')

/** Thông tin hiển thị trong danh sách tài khoản, lấy từ metadata GitHub của phiên Supabase. */
export function accountInfoFromSession(session: Session): SavedAccountInfo {
  const meta = session.user.user_metadata ?? {}
  const avatar = str(meta.avatar_url, 2000)
  const login = str(meta.user_name, 100) || str(meta.preferred_username, 100)
  return {
    id: session.user.id,
    login,
    name: str(meta.full_name, 200) || str(meta.name, 200) || login,
    email: str(session.user.email, 320),
    avatarUrl: avatar.startsWith('https://') ? avatar : null
  }
}

export const tokensOf = (session: Session): AccountSession => ({
  accessToken: session.access_token,
  refreshToken: session.refresh_token
})
