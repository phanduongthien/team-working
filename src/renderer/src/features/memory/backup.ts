import { MEMORY_CATEGORIES, type MemoryCategory } from '@shared/schemas'
import type { Memory } from '@shared/types'
import type { UserMemoryRow } from '@shared/supabase.types'
import { api } from '@renderer/lib/api'
import { dbErrorCode, supabase } from '@renderer/lib/supabase'
import { useAuth } from '@renderer/stores/auth'

const ENABLED_KEY = 'tw.memoryBackup'

/** Mặc định TẮT — trí nhớ cá nhân chỉ lên máy chủ khi người dùng bật. */
export function isBackupEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1'
  } catch {
    return false
  }
}

export function setBackupEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(ENABLED_KEY, '1')
    else localStorage.removeItem(ENABLED_KEY)
  } catch {
    // bỏ qua
  }
}

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim()

/** Bản sao lưu → các memory cần tạo lại trên máy (bỏ trùng nội dung, loại lạ → other). */
export function toRestore(remote: Pick<UserMemoryRow, 'content' | 'category'>[], local: Pick<Memory, 'content'>[]): { content: string; category: MemoryCategory }[] {
  const seen = new Set(local.map((m) => normalize(m.content)))
  const result: { content: string; category: MemoryCategory }[] = []
  for (const r of remote) {
    const key = normalize(r.content)
    if (seen.has(key)) continue
    seen.add(key)
    const category = (MEMORY_CATEGORIES as readonly string[]).includes(r.category) ? (r.category as MemoryCategory) : 'other'
    result.push({ content: r.content, category })
  }
  return result
}

function signedInUser(): string {
  const uid = useAuth.getState().session?.user.id
  if (!supabase || !uid) throw new Error('not_signed_in')
  return uid
}

/** Đẩy toàn bộ trí nhớ trên máy lên (ghi đè), xóa bản trên máy chủ không còn ở máy. */
export async function pushBackup(): Promise<number> {
  const uid = signedInUser()
  const local = await api.memory.list()
  const db = supabase!
  if (local.length) {
    const { error } = await db.from('user_memories').upsert(
      local.map((m) => ({ user_id: uid, id: m.id, content: m.content, category: m.category, updated_at: new Date(m.updatedAt).toISOString() }))
    )
    if (error) throw new Error(dbErrorCode(error))
  }
  const { data: remote, error } = await db.from('user_memories').select('id').eq('user_id', uid)
  if (error) throw new Error(dbErrorCode(error))
  const stale = (remote ?? []).map((r) => r.id).filter((id) => !local.some((m) => m.id === id))
  if (stale.length) await db.from('user_memories').delete().eq('user_id', uid).in('id', stale)
  return local.length
}

/** Tạo lại trên máy những memory có trong bản sao lưu mà máy chưa có. */
export async function restoreBackup(): Promise<number> {
  const uid = signedInUser()
  const { data, error } = await supabase!.from('user_memories').select('content, category').eq('user_id', uid)
  if (error) throw new Error(dbErrorCode(error))
  const missing = toRestore(data ?? [], await api.memory.list())
  for (const m of missing) await api.memory.create(m.content, m.category)
  return missing.length
}

let pending: ReturnType<typeof setTimeout> | null = null

/** Gọi sau mỗi thay đổi trí nhớ: nếu đã bật và đã đăng nhập thì sao lưu (gom trong 2 giây). */
export function scheduleBackup(): void {
  if (!isBackupEnabled() || !useAuth.getState().session) return
  if (pending) clearTimeout(pending)
  pending = setTimeout(() => {
    pending = null
    void pushBackup().catch(() => {})
  }, 2000)
}
