import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { backupBeforeUpgrade, backupsToPrune } from '../backup'

const log = { info: () => {}, error: () => {} }
let dir: string
let dbFile: string
let backupDir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tw-backup-'))
  dbFile = join(dir, 'team-working.db')
  backupDir = join(dir, 'backups')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function makeDb(): void {
  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.exec("CREATE TABLE messages (content TEXT); INSERT INTO messages VALUES ('xin chào')")
  db.close()
}

describe('backupsToPrune', () => {
  it('giữ N bản mới nhất, bỏ qua file khác', () => {
    const files = [
      { name: 'team-working-0.1.0-a.db', mtimeMs: 1 },
      { name: 'team-working-0.2.0-b.db', mtimeMs: 3 },
      { name: 'team-working-0.3.0-c.db', mtimeMs: 2 },
      { name: 'last-version.txt', mtimeMs: 0 }
    ]
    expect(backupsToPrune(files, 2)).toEqual(['team-working-0.1.0-a.db'])
  })
})

describe('backupBeforeUpgrade', () => {
  it('cài mới (chưa có DB) → chỉ ghi mốc phiên bản', async () => {
    expect(await backupBeforeUpgrade({ dbFile, backupDir, version: '0.4.0', log })).toBeNull()
    expect(readFileSync(join(backupDir, 'last-version.txt'), 'utf8')).toBe('0.4.0')
  })

  it('đổi phiên bản → sao lưu đầy đủ dữ liệu; cùng phiên bản → không sao lưu lại', async () => {
    makeDb()
    const dest = await backupBeforeUpgrade({ dbFile, backupDir, version: '0.4.0', log })
    expect(dest).toMatch(/team-working-unknown-.+\.db$/)
    const copy = new Database(dest!, { readonly: true })
    expect(copy.prepare('SELECT content FROM messages').get()).toEqual({ content: 'xin chào' })
    copy.close()
    expect(await backupBeforeUpgrade({ dbFile, backupDir, version: '0.4.0', log })).toBeNull()

    const next = await backupBeforeUpgrade({ dbFile, backupDir, version: '0.5.0', log, now: new Date(Date.now() + 1000) })
    expect(next).toMatch(/team-working-0\.4\.0-.+\.db$/)
  })

  it('chỉ giữ 3 bản gần nhất', async () => {
    makeDb()
    for (const [i, v] of ['0.4.0', '0.5.0', '0.6.0', '0.7.0'].entries()) {
      const dest = await backupBeforeUpgrade({ dbFile, backupDir, version: v, log, now: new Date(2026, 0, 1 + i) })
      utimesSync(dest!, new Date(2026, 0, 1 + i), new Date(2026, 0, 1 + i))
    }
    // Bản thứ 4 được tạo rồi mới dọn → còn 3 (lần dọn cuối thấy đủ 4 file).
    const backups = readdirSync(backupDir).filter((f) => f.endsWith('.db'))
    expect(backups).toHaveLength(3)
    expect(backups.some((f) => f.startsWith('team-working-unknown-'))).toBe(false)
  })

  it('sao lưu lỗi → không ghi mốc để lần sau thử lại', async () => {
    writeFileSync(dbFile, 'không phải sqlite')
    expect(await backupBeforeUpgrade({ dbFile, backupDir, version: '0.4.0', log })).toBeNull()
    expect(existsSync(join(backupDir, 'last-version.txt'))).toBe(false)
  })
})
