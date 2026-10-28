import { z } from 'zod'

/**
 * Cấu hình Supabase lấy từ biến môi trường build-time (Vite):
 *   .env              → mặc định (đang trỏ project dev)
 *   .env.development  → (tùy chọn) chỉ cho `npm run dev`
 *   .env.production   → project prod, dùng khi `npm run build:win`
 * File .env.[mode] đè lên .env. Anon/publishable key được phép nằm trong app vì mọi bảng có RLS;
 * service-role key KHÔNG BAO GIỜ được đặt ở đây.
 */
export const supabaseConfigSchema = z.object({
  url: z.url({ protocol: /^https?$/ }),
  anonKey: z
    .string()
    .min(20)
    .refine((k) => !/service_role|sb_secret_/.test(k) && !isServiceRoleJwt(k), 'service_role_key_not_allowed')
})

export type SupabaseConfig = z.infer<typeof supabaseConfigSchema>

/** Key JWT kiểu cũ: payload có role=service_role → từ chối. */
function isServiceRoleJwt(key: string): boolean {
  const payload = key.split('.')[1]
  if (!payload) return false
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string }
    return json.role === 'service_role'
  } catch {
    return false
  }
}

export function parseSupabaseConfig(env: Record<string, string | undefined>): SupabaseConfig | null {
  const parsed = supabaseConfigSchema.safeParse({
    url: env.VITE_SUPABASE_URL?.trim(),
    anonKey: env.VITE_SUPABASE_ANON_KEY?.trim()
  })
  return parsed.success ? parsed.data : null
}

export type AppEnvironment = 'development' | 'production'

/**
 * Môi trường hiển thị (nhãn DEV): ưu tiên VITE_APP_ENV khai báo trong file .env
 * (.env = development, .env.production = production) — để bản build vẫn trỏ project dev
 * thì vẫn hiện DEV. Không khai báo thì theo mode của Vite.
 */
export function appEnvironment(mode: string | undefined, declared?: string): AppEnvironment {
  if (declared === 'production' || declared === 'development') return declared
  return mode === 'production' ? 'production' : 'development'
}

/** Cổng loopback nhận callback OAuth — phải khớp Redirect URL đã khai báo trên Supabase. */
export const OAUTH_CALLBACK_PORT = 47823
export const OAUTH_REDIRECT_URL = `http://127.0.0.1:${OAUTH_CALLBACK_PORT}/auth/callback`
