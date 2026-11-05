import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

const PREFIX = 'mzk_'

/** Token cho một agent: chỉ hiện cho người dùng MỘT lần; app chỉ lưu bản băm. */
export function newToken(): string {
  return PREFIX + randomBytes(32).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** So sánh hằng thời gian để không lộ thông tin qua thời gian phản hồi. */
export function tokenMatches(token: string, hash: string): boolean {
  if (!token.startsWith(PREFIX)) return false
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** "Authorization: Bearer <token>" → token. */
export function bearer(header: string | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '')
  return m ? m[1] : null
}
