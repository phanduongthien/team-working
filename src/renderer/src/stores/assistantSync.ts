import { assistantProfileSchema, userProfileSchema, type AssistantProfile, type UserProfile } from '@shared/schemas'
import { api } from '@renderer/lib/api'
import { supabase } from '@renderer/lib/supabase'
import { useAuth } from './auth'
import { usePreferences } from './preferences'

const LOCAL_TS_KEY = 'tw.assistantUpdatedAt'
const SYNC_USER_KEY = 'tw.assistantSyncUser'

export type SyncDecision = 'push' | 'pull' | 'none'

/**
 * Tên/avatar/tính cách trợ lý đi theo tài khoản GitHub:
 * - tài khoản chưa có bản lưu → đẩy cài đặt trên máy lên
 * - máy này lần trước đồng bộ với tài khoản KHÁC → lấy bản của tài khoản này (không kế thừa của người khác)
 * - còn lại: bản mới hơn thắng
 */
export function decideAssistantSync(input: {
  remoteUpdatedAt: number | null
  localUpdatedAt: number
  lastSyncedUser: string | null
  uid: string
}): SyncDecision {
  if (input.remoteUpdatedAt === null) return 'push'
  if (input.lastSyncedUser !== input.uid) return 'pull'
  if (input.remoteUpdatedAt > input.localUpdatedAt) return 'pull'
  if (input.localUpdatedAt > input.remoteUpdatedAt) return 'push'
  return 'none'
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // bỏ qua: chỉ là tiện ích theo máy
  }
}

/** Đánh dấu cài đặt trên máy vừa đổi (gọi khi người dùng lưu). */
export function stampLocalAssistant(at = Date.now()): void {
  write(LOCAL_TS_KEY, String(at))
}

async function push(uid: string, profile: AssistantProfile, at: number): Promise<void> {
  if (!supabase) return
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: uid, assistant: profile, updated_at: new Date(at).toISOString() })
  if (!error) write(SYNC_USER_KEY, uid)
}

/** Sau khi lưu trên máy: nếu đang đăng nhập thì đẩy lên tài khoản. */
export async function pushAssistantIfSignedIn(profile: AssistantProfile): Promise<void> {
  const uid = useAuth.getState().session?.user.id
  if (uid) await push(uid, profile, Number(read(LOCAL_TS_KEY)) || Date.now())
}

// ---------------- Hồ sơ cá nhân theo tài khoản ----------------

const profileTsKey = (uid: string): string => `tw.profileUpdatedAt.${uid}`

/** Đánh dấu hồ sơ của tài khoản này vừa đổi trên máy. */
export function stampLocalProfile(uid: string, at = Date.now()): void {
  write(profileTsKey(uid), String(at))
}

async function pushProfile(uid: string, profile: UserProfile, at: number): Promise<void> {
  await supabase?.from('user_settings').upsert({ user_id: uid, profile, profile_updated_at: new Date(at).toISOString() })
}

/** Sau khi lưu hồ sơ: nếu đang đăng nhập thì đẩy lên tài khoản. */
export async function pushProfileIfSignedIn(profile: UserProfile): Promise<void> {
  const uid = useAuth.getState().session?.user.id
  if (!uid) return
  stampLocalProfile(uid)
  await pushProfile(uid, profile, Date.now())
}

/**
 * Hồ sơ trên máy đã tách theo tài khoản (main), nên chỉ cần "bản mới hơn thắng".
 * Trả về 'pull' nếu vừa lấy hồ sơ từ tài khoản về máy.
 */
export async function syncProfile(uid: string): Promise<SyncDecision> {
  if (!supabase) return 'none'
  const { data, error } = await supabase.from('user_settings').select('profile, profile_updated_at').eq('user_id', uid).maybeSingle()
  if (error) return 'none'
  const remote = data?.profile ? userProfileSchema.safeParse(data.profile) : null
  const remoteUpdatedAt = remote?.success && data?.profile_updated_at ? Date.parse(data.profile_updated_at) : null
  const localUpdatedAt = Number(read(profileTsKey(uid))) || 0
  const local = await api.memory.getProfile()
  const localEmpty = Object.values(local).every((v) => !v.trim())

  const decision = decideAssistantSync({ remoteUpdatedAt, localUpdatedAt, lastSyncedUser: uid, uid })
  if (decision === 'pull' && remote?.success && remoteUpdatedAt !== null) {
    await api.memory.setProfile(remote.data)
    stampLocalProfile(uid, remoteUpdatedAt)
  } else if (decision === 'push' && !localEmpty) {
    await pushProfile(uid, local, localUpdatedAt || Date.now())
  }
  return decision
}

/** Khi đăng nhập: đồng bộ hai chiều theo decideAssistantSync. */
export async function syncAssistant(uid: string): Promise<SyncDecision> {
  if (!supabase) return 'none'
  const { data, error } = await supabase.from('user_settings').select('assistant, updated_at').eq('user_id', uid).maybeSingle()
  if (error) return 'none'
  const remote = data ? assistantProfileSchema.safeParse(data.assistant) : null
  const remoteUpdatedAt = data && remote?.success ? Date.parse(data.updated_at) : null
  const localUpdatedAt = Number(read(LOCAL_TS_KEY)) || 0

  const decision = decideAssistantSync({ remoteUpdatedAt, localUpdatedAt, lastSyncedUser: read(SYNC_USER_KEY), uid })
  if (decision === 'pull' && remote?.success && remoteUpdatedAt !== null) {
    await usePreferences.getState().applyAssistant(remote.data)
    stampLocalAssistant(remoteUpdatedAt)
    write(SYNC_USER_KEY, uid)
  } else if (decision === 'push') {
    await push(uid, usePreferences.getState().assistant, localUpdatedAt || Date.now())
  }
  return decision
}
