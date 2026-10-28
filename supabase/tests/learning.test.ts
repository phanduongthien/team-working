import type { Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, errorOf, type Db, type TestUser } from './harness'

/** Quyền học tập (riêng tư, chia sẻ cho quản lý) và báo cáo tiến độ. */
let db: Db
let owner: TestUser, manager: TestUser, alice: TestUser, bob: TestUser, outsider: TestUser
let teamId: string

const rows = async <T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T[]> => (await tx.query<T>(sql, params)).rows
const one = async <T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> => (await tx.query<T>(sql, params)).rows[0]

async function newPath(user: TestUser, shared: boolean): Promise<string> {
  const { id } = await db.as(user, (tx) =>
    one<{ id: string }>(tx, `insert into learning_paths (team_id, title, shared) values ($1, 'Học React', $2) returning id`, [teamId, shared])
  )
  await db.as(user, (tx) => tx.query(`insert into learning_steps (path_id, title) values ($1, 'JSX'), ($1, 'Hooks')`, [id]))
  return id
}

beforeAll(async () => {
  db = await createDb()
  owner = await db.createUser('Owner')
  manager = await db.createUser('Manager')
  alice = await db.createUser('Alice')
  bob = await db.createUser('Bob')
  outsider = await db.createUser('Outsider')
  teamId = (await db.as(owner, (tx) => one<{ id: string }>(tx, `select (create_team('Nhóm')).id`))).id
  for (const [user, role] of [[manager, 'manager'], [alice, 'member'], [bob, 'member']] as const) {
    const { code } = await db.as(owner, (tx) => one<{ code: string }>(tx, `insert into team_invites (team_id, role) values ($1, $2) returning code`, [teamId, role]))
    await db.as(user, (tx) => tx.query(`select accept_invite($1)`, [code]))
  }
}, 60_000)

describe('lộ trình học', () => {
  it('không chia sẻ: chỉ chủ sở hữu thấy (Manager cũng không)', async () => {
    const id = await newPath(alice, false)
    expect(await db.as(alice, (tx) => rows(tx, `select * from learning_steps where path_id = $1`, [id]))).toHaveLength(2)
    for (const u of [manager, owner, bob]) {
      expect(await db.as(u, (tx) => rows(tx, `select * from learning_paths where id = $1`, [id])), u.name).toEqual([])
      expect(await db.as(u, (tx) => rows(tx, `select * from learning_steps where path_id = $1`, [id])), u.name).toEqual([])
    }
  })

  it('chia sẻ: Manager/Owner xem được, Member khác và người ngoài không; không ai sửa hộ', async () => {
    const id = await newPath(alice, true)
    expect(await db.as(manager, (tx) => rows(tx, `select * from learning_steps where path_id = $1`, [id]))).toHaveLength(2)
    expect(await db.as(owner, (tx) => rows(tx, `select * from learning_paths where id = $1`, [id]))).toHaveLength(1)
    expect(await db.as(bob, (tx) => rows(tx, `select * from learning_paths where id = $1`, [id]))).toEqual([])
    expect(await db.as(outsider, (tx) => rows(tx, `select * from learning_paths where id = $1`, [id]))).toEqual([])
    await db.as(manager, (tx) => tx.query(`update learning_steps set status = 'done' where path_id = $1`, [id]))
    const steps = await db.as(alice, (tx) => rows<{ status: string }>(tx, `select status from learning_steps where path_id = $1`, [id]))
    expect(steps.every((s) => s.status === 'todo')).toBe(true)
  })

  it('tắt chia sẻ thì Manager không còn thấy', async () => {
    const id = await newPath(alice, true)
    await db.as(alice, (tx) => tx.query(`update learning_paths set shared = false where id = $1`, [id]))
    expect(await db.as(manager, (tx) => rows(tx, `select * from learning_paths where id = $1`, [id]))).toEqual([])
  })

  it('không thêm bước vào lộ trình của người khác; Done tự ghi completed_at', async () => {
    const id = await newPath(alice, true)
    expect(await errorOf(db.as(bob, (tx) => tx.query(`insert into learning_steps (path_id, title) values ($1, 'x')`, [id])))).toMatch(/row-level security/)
    await db.as(alice, (tx) => tx.query(`update learning_steps set status = 'done' where path_id = $1 and title = 'JSX'`, [id]))
    const s = await db.as(alice, (tx) => one<{ completed_at: string | null }>(tx, `select completed_at from learning_steps where path_id = $1 and title = 'JSX'`, [id]))
    expect(s.completed_at).not.toBeNull()
  })

  it('không gắn lộ trình vào team mình không thuộc', async () => {
    expect(await errorOf(db.as(outsider, (tx) => tx.query(`insert into learning_paths (team_id, title) values ($1, 'x')`, [teamId])))).toMatch(/row-level security/)
    expect(await errorOf(db.as(outsider, (tx) => tx.query(`insert into learning_paths (title) values ('Cá nhân')`)))).toBeNull()
  })
})

describe('quiz', () => {
  it('kết quả quiz theo quyền của lộ trình; không ghi quiz vào lộ trình người khác', async () => {
    const shared = await newPath(alice, true)
    const priv = await newPath(alice, false)
    for (const p of [shared, priv]) {
      await db.as(alice, (tx) => tx.query(`insert into quiz_attempts (path_id, topic, questions, total, score) values ($1, 'Hooks', '[]', 5, 3)`, [p]))
    }
    const seen = await db.as(manager, (tx) => rows<{ path_id: string }>(tx, `select path_id from quiz_attempts`))
    expect(seen.map((q) => q.path_id)).toEqual([shared])
    expect(await errorOf(db.as(bob, (tx) => tx.query(`insert into quiz_attempts (path_id, topic, questions, total) values ($1, 'x', '[]', 1)`, [shared])))).toMatch(/row-level security/)
  })
})

describe('báo cáo tiến độ', () => {
  it('gửi cho Manager/Owner (có thông báo); Member khác không đọc được', async () => {
    const { id } = await db.as(alice, (tx) =>
      one<{ id: string }>(tx, `insert into progress_reports (team_id, period_type, period_label, body) values ($1, 'day', '30/10/2026', 'Đã xong API') returning id`, [teamId])
    )
    expect(await db.as(manager, (tx) => rows(tx, `select * from progress_reports where id = $1`, [id]))).toHaveLength(1)
    expect(await db.as(bob, (tx) => rows(tx, `select * from progress_reports where id = $1`, [id]))).toEqual([])
    const notes = await db.as(owner, (tx) => rows(tx, `select * from notifications where type = 'progress_report' and payload->>'report_id' = $1`, [id]))
    expect(notes).toHaveLength(1)
    expect(await errorOf(db.as(outsider, (tx) => tx.query(`insert into progress_reports (team_id, period_type, period_label, body) values ($1, 'day', 'x', 'y')`, [teamId])))).toMatch(/row-level security/)
  })
})
