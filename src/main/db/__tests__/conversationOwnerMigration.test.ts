import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../client'

const MIGRATIONS = join(__dirname, '..', 'migrations')
const AN = '11111111-1111-4111-8111-111111111111'

/** Dựng DB ở trạng thái TRƯỚC migration 0005 (bản app cũ), rồi mở bằng bản mới. */
let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tw-mig-'))
  file = join(dir, 'app.db')
  const old = join(dir, 'old-migrations')
  cpSync(MIGRATIONS, old, { recursive: true })
  const journalPath = join(old, 'meta', '_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: { tag: string }[] }
  journal.entries = journal.entries.filter((e) => e.tag < '0005')
  writeFileSync(journalPath, JSON.stringify(journal))
  openDatabase(file, old).close()
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function seed(sql: string): void {
  const db = new Database(file)
  db.exec(sql)
  db.close()
}

const owners = (): string[] => {
  openDatabase(file, MIGRATIONS).close()
  const db = new Database(file, { readonly: true })
  const rows = db.prepare('select owner from conversations order by id').all() as { owner: string }[]
  db.close()
  return rows.map((r) => r.owner)
}

describe('migration 0005 — lịch sử chat theo tài khoản', () => {
  it('máy đã có tài khoản nhận dữ liệu local → hội thoại cũ thuộc tài khoản đó', () => {
    seed(`
      insert into settings (key, value) values ('account.localClaimedBy', '"${AN}"');
      insert into conversations (id, title) values ('c1', 'cũ 1'), ('c2', 'cũ 2');
    `)
    expect(owners()).toEqual([AN, AN])
  })

  it('chưa có tài khoản nào nhận → hội thoại cũ vẫn là local (chờ tài khoản đầu tiên)', () => {
    seed(`insert into conversations (id, title) values ('c1', 'cũ');`)
    expect(owners()).toEqual(['local'])
  })
})
