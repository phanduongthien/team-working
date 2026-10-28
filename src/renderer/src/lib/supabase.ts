import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { appEnvironment, parseSupabaseConfig } from '@shared/appConfig'
import type { Database } from '@shared/supabase.types'

export const supabaseConfig = parseSupabaseConfig(import.meta.env)
export const appEnv = appEnvironment(import.meta.env.MODE, import.meta.env.VITE_APP_ENV)

export type Supabase = SupabaseClient<Database>

/**
 * Client Supabase của renderer (null nếu chưa cấu hình → app chạy chế độ cá nhân, không có team).
 * PKCE + không đọc session từ URL: đăng nhập đi qua trình duyệt hệ thống và cổng loopback ở main.
 */
export const supabase: Supabase | null = supabaseConfig
  ? createClient<Database>(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'team-working-auth'
      }
    })
  : null

/** Dùng trong code chỉ chạy khi đã đăng nhập (đã chắc chắn có cấu hình). */
export function requireSupabase(): Supabase {
  if (!supabase) throw new Error('supabase_not_configured')
  return supabase
}

/** Lỗi Postgres/PostgREST → mã ngắn để tra i18n (vd "last_owner", "invite_invalid"). */
export function dbErrorCode(err: unknown): string {
  const e = err as { message?: string; code?: string }
  const message = e?.message ?? String(err)
  if (/row-level security|permission denied/i.test(message)) return 'not_allowed'
  if (/Failed to fetch|NetworkError|fetch failed/i.test(message)) return 'network_error'
  // Vi phạm CHECK → tên ràng buộc (vd "feedback_public_person_praise") để tra i18n.
  const constraint = message.match(/check constraint "([a-z_]+)"/)?.[1]
  if (constraint) return constraint
  const known = message.match(/^([a-z_]+)$/)?.[1]
  return known ?? message
}
