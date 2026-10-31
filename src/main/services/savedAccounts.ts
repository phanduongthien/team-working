import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { accountSessionSchema, savedAccountInfoSchema, type AccountSession, type SavedAccountInfo } from '@shared/schemas'
import type { SavedAccount } from '@shared/types'
import type { Encryptor } from './secrets'

/** Giữ tối đa chừng này tài khoản (bỏ tài khoản lâu không dùng nhất). */
export const MAX_SAVED_ACCOUNTS = 10

const entrySchema = savedAccountInfoSchema.extend({
  lastUsedAt: z.number(),
  session: accountSessionSchema.nullable()
})
type Entry = z.infer<typeof entrySchema>

/**
 * Tài khoản GitHub từng đăng nhập trên máy, để đổi nhanh. Cả file mã hóa bằng Windows DPAPI
 * (Electron safeStorage). Chỉ lưu phiên Supabase của tài khoản người dùng chọn "ghi nhớ";
 * không bao giờ có mật khẩu GitHub (đăng nhập OAuth diễn ra trên trình duyệt).
 */
export class SavedAccountStore {
  private readonly file: string

  constructor(
    dir: string,
    private readonly crypto: Encryptor
  ) {
    mkdirSync(dir, { recursive: true })
    this.file = join(dir, 'accounts.bin')
  }

  private read(): Entry[] {
    if (!existsSync(this.file) || !this.crypto.isEncryptionAvailable()) return []
    try {
      const parsed = z.array(entrySchema).safeParse(JSON.parse(this.crypto.decryptString(readFileSync(this.file))))
      return parsed.success ? parsed.data : []
    } catch {
      return []
    }
  }

  private write(entries: Entry[]): void {
    if (!this.crypto.isEncryptionAvailable()) throw new Error('secure_storage_unavailable')
    const kept = [...entries].sort((a, b) => b.lastUsedAt - a.lastUsedAt).slice(0, MAX_SAVED_ACCOUNTS)
    writeFileSync(this.file, this.crypto.encryptString(JSON.stringify(kept)))
  }

  list(): SavedAccount[] {
    return this.read()
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
      .map(({ session, ...info }) => ({ ...info, remembered: session !== null }))
  }

  /** Đăng nhập / làm mới phiên: cập nhật thông tin; tài khoản đang ghi nhớ thì thay phiên mới (refresh token xoay vòng). */
  record(account: SavedAccountInfo, session: AccountSession, now = Date.now()): void {
    if (!this.crypto.isEncryptionAvailable()) return
    const entries = this.read()
    const existing = entries.find((e) => e.id === account.id)
    const next: Entry = { ...account, lastUsedAt: now, session: existing?.session ? session : null }
    this.write([next, ...entries.filter((e) => e.id !== account.id)])
  }

  remember(id: string, remember: boolean, session?: AccountSession): void {
    const entries = this.read()
    const entry = entries.find((e) => e.id === id)
    if (!entry) throw new Error('account_not_found')
    if (remember && !session) throw new Error('session_required')
    entry.session = remember ? session! : null
    this.write(entries)
  }

  session(id: string): AccountSession | null {
    return this.read().find((e) => e.id === id)?.session ?? null
  }

  dropSession(id: string): void {
    const entries = this.read()
    const entry = entries.find((e) => e.id === id)
    if (!entry?.session) return
    entry.session = null
    this.write(entries)
  }

  forget(id: string): void {
    const entries = this.read().filter((e) => e.id !== id)
    if (entries.length === 0) rmSync(this.file, { force: true })
    else this.write(entries)
  }
}
