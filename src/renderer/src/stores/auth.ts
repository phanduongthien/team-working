import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { OAUTH_REDIRECT_URL } from '@shared/appConfig'
import type { ProfileRow } from '@shared/supabase.types'
import type { SavedAccount } from '@shared/types'
import { accountInfoFromSession, tokensOf } from '@renderer/lib/accountInfo'
import { api } from '@renderer/lib/api'
import { dbErrorCode, supabase } from '@renderer/lib/supabase'

export type AuthStatus = 'disabled' | 'loading' | 'signed_out' | 'signing_in' | 'signed_in'

type AuthState = {
  status: AuthStatus
  session: Session | null
  profile: ProfileRow | null
  error: string | null
  /** Tài khoản từng đăng nhập trên máy (đổi nhanh). */
  accounts: SavedAccount[]
  /** Đang đổi sang tài khoản này (id) — để UI hiện trạng thái chờ. */
  switchingTo: string | null
  init(): () => void
  /** `remember`: lưu phiên để lần sau đổi nhanh; `selectAccount`: bắt GitHub hỏi chọn tài khoản (thêm tài khoản khác). */
  signInWithGitHub(opts?: { remember?: boolean; selectAccount?: boolean }): Promise<void>
  cancelSignIn(): Promise<void>
  signOut(): Promise<void>
  loadProfile(): Promise<void>
  updateProfile(patch: Partial<Pick<ProfileRow, 'display_name' | 'skills'>>): Promise<void>
  loadAccounts(): Promise<void>
  /** Đổi sang tài khoản đã đăng nhập trước đó; chưa ghi nhớ phiên thì mở trình duyệt. */
  switchAccount(id: string): Promise<void>
  /** Bật/tắt ghi nhớ đăng nhập cho tài khoản đang dùng. */
  setRemember(remember: boolean): Promise<void>
  forgetAccount(id: string): Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  status: supabase ? 'loading' : 'disabled',
  session: null,
  profile: null,
  error: null,
  accounts: [],
  switchingTo: null,

  init() {
    if (!supabase) return () => {}
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const wasSignedIn = get().session?.user.id
      set({ session, status: session ? 'signed_in' : get().status === 'signing_in' ? 'signing_in' : 'signed_out' })
      if (session && session.user.id !== wasSignedIn) void get().loadProfile()
      if (!session) set({ profile: null })
      // Mỗi lần đăng nhập/làm mới phiên: cập nhật danh sách (refresh token xoay vòng nên phải lưu bản mới nhất).
      if (session) void recordSession(session).then(() => get().loadAccounts())
    })
    void supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, status: session ? 'signed_in' : 'signed_out' })
      if (session) void get().loadProfile()
    })
    void get().loadAccounts()
    return () => data.subscription.unsubscribe()
  },

  /**
   * GitHub OAuth (PKCE): lấy link authorize → main mở trình duyệt hệ thống và chờ mã ở
   * cổng loopback → đổi mã lấy session ngay tại renderer (code verifier nằm ở đây).
   */
  async signInWithGitHub(opts = {}) {
    if (!supabase) return
    set({ status: 'signing_in', error: null })
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: OAUTH_REDIRECT_URL,
        skipBrowserRedirect: true,
        scopes: 'read:user user:email',
        ...(opts.selectAccount ? { queryParams: { prompt: 'select_account' } } : {})
      }
    })
    if (error || !data.url) {
      set({ status: get().session ? 'signed_in' : 'signed_out', error: error ? dbErrorCode(error) : 'missing_url' })
      return
    }
    const result = await api.auth.oauth(data.url)
    if ('error' in result) {
      set({ status: get().session ? 'signed_in' : 'signed_out', error: result.error === 'cancelled' ? null : result.error })
      return
    }
    const exchanged = await supabase.auth.exchangeCodeForSession(result.code)
    if (exchanged.error) {
      set({ status: get().session ? 'signed_in' : 'signed_out', error: dbErrorCode(exchanged.error) })
      return
    }
    if (opts.remember && exchanged.data.session) {
      const session = exchanged.data.session
      await api.accounts.record(accountInfoFromSession(session), tokensOf(session))
      await api.accounts.remember(session.user.id, true, tokensOf(session))
      await get().loadAccounts()
    }
  },

  async cancelSignIn() {
    await api.auth.cancel()
    set({ status: get().session ? 'signed_in' : 'signed_out' })
  },

  async signOut() {
    const uid = get().session?.user.id
    // Chỉ thu hồi phiên trên máy này (không đăng xuất các máy khác của cùng tài khoản).
    await supabase?.auth.signOut({ scope: 'local' })
    if (uid) await api.accounts.dropSession(uid)
    set({ session: null, profile: null, status: 'signed_out' })
    await get().loadAccounts()
  },

  async loadProfile() {
    const uid = get().session?.user.id
    if (!supabase || !uid) return
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle()
    set({ profile: data })
  },

  async updateProfile(patch) {
    const uid = get().session?.user.id
    if (!supabase || !uid) return
    const { data, error } = await supabase.from('profiles').update(patch).eq('id', uid).select('*').single()
    if (error) throw new Error(dbErrorCode(error))
    set({ profile: data })
  },

  async loadAccounts() {
    set({ accounts: await api.accounts.list() })
  },

  async switchAccount(id) {
    if (!supabase || get().session?.user.id === id || get().switchingTo) return
    const saved = await api.accounts.session(id)
    if (!saved) {
      // Chưa ghi nhớ → đăng nhập lại qua trình duyệt (GitHub hỏi chọn tài khoản).
      await get().signInWithGitHub({ remember: true, selectAccount: true })
      return
    }
    const previous = get().session
    set({ switchingTo: id, error: null })
    // setSession thay phiên trên máy mà KHÔNG thu hồi phiên cũ → tài khoản cũ vẫn đổi lại được.
    const { error } = await supabase.auth.setSession({ access_token: saved.accessToken, refresh_token: saved.refreshToken })
    if (error) {
      await api.accounts.dropSession(id)
      // Phiên hỏng có thể làm supabase-js xóa phiên hiện tại → khôi phục tài khoản đang dùng nếu còn lưu.
      const back = previous && !get().session ? await api.accounts.session(previous.user.id) : null
      if (back) await supabase.auth.setSession({ access_token: back.accessToken, refresh_token: back.refreshToken })
      set({ error: 'session_expired' })
    }
    set({ switchingTo: null })
    await get().loadAccounts()
  },

  async setRemember(remember) {
    const session = get().session
    if (!session) return
    await recordSession(session)
    await api.accounts.remember(session.user.id, remember, remember ? tokensOf(session) : undefined)
    await get().loadAccounts()
  },

  async forgetAccount(id) {
    if (get().session?.user.id === id) return
    await api.accounts.forget(id)
    await get().loadAccounts()
  }
}))

function recordSession(session: Session): Promise<void> {
  return api.accounts.record(accountInfoFromSession(session), tokensOf(session))
}
