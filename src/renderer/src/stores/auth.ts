import type { Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { OAUTH_REDIRECT_URL } from '@shared/appConfig'
import type { ProfileRow } from '@shared/supabase.types'
import { api } from '@renderer/lib/api'
import { dbErrorCode, supabase } from '@renderer/lib/supabase'

export type AuthStatus = 'disabled' | 'loading' | 'signed_out' | 'signing_in' | 'signed_in'

type AuthState = {
  status: AuthStatus
  session: Session | null
  profile: ProfileRow | null
  error: string | null
  init(): () => void
  signInWithGitHub(): Promise<void>
  cancelSignIn(): Promise<void>
  signOut(): Promise<void>
  loadProfile(): Promise<void>
  updateProfile(patch: Partial<Pick<ProfileRow, 'display_name' | 'skills'>>): Promise<void>
}

export const useAuth = create<AuthState>((set, get) => ({
  status: supabase ? 'loading' : 'disabled',
  session: null,
  profile: null,
  error: null,

  init() {
    if (!supabase) return () => {}
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const wasSignedIn = get().session?.user.id
      set({ session, status: session ? 'signed_in' : get().status === 'signing_in' ? 'signing_in' : 'signed_out' })
      if (session && session.user.id !== wasSignedIn) void get().loadProfile()
      if (!session) set({ profile: null })
    })
    void supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, status: session ? 'signed_in' : 'signed_out' })
      if (session) void get().loadProfile()
    })
    return () => data.subscription.unsubscribe()
  },

  /**
   * GitHub OAuth (PKCE): lấy link authorize → main mở trình duyệt hệ thống và chờ mã ở
   * cổng loopback → đổi mã lấy session ngay tại renderer (code verifier nằm ở đây).
   */
  async signInWithGitHub() {
    if (!supabase) return
    set({ status: 'signing_in', error: null })
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: OAUTH_REDIRECT_URL, skipBrowserRedirect: true, scopes: 'read:user user:email' }
    })
    if (error || !data.url) {
      set({ status: 'signed_out', error: error ? dbErrorCode(error) : 'missing_url' })
      return
    }
    const result = await api.auth.oauth(data.url)
    if ('error' in result) {
      set({ status: 'signed_out', error: result.error === 'cancelled' ? null : result.error })
      return
    }
    const exchanged = await supabase.auth.exchangeCodeForSession(result.code)
    if (exchanged.error) set({ status: 'signed_out', error: dbErrorCode(exchanged.error) })
  },

  async cancelSignIn() {
    await api.auth.cancel()
    set({ status: 'signed_out' })
  },

  async signOut() {
    await supabase?.auth.signOut()
    set({ session: null, profile: null, status: 'signed_out' })
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
  }
}))
