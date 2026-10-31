import type { Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, errorOf, type Db, type TestUser } from './harness'

/** Nhiều team cùng lúc và rời team (kể cả khi chỉ còn một mình). */
let db: Db
let alice: TestUser, bob: TestUser, carol: TestUser

const rows = async <T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T[]> => (await tx.query<T>(sql, params)).rows
const one = async <T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> => (await tx.query<T>(sql, params)).rows[0]

const createTeam = async (user: TestUser, name: string): Promise<string> =>
  (await db.as(user, (tx) => one<{ id: string }>(tx, `select (create_team($1)).id`, [name]))).id

async function join(owner: TestUser, user: TestUser, teamId: string, role = 'member'): Promise<void> {
  const { code } = await db.as(owner, (tx) =>
    one<{ code: string }>(tx, `insert into team_invites (team_id, role) values ($1, $2) returning code`, [teamId, role])
  )
  await db.as(user, (tx) => tx.query(`select accept_invite($1)`, [code]))
}

const leave = (user: TestUser, teamId: string, opts: { del?: boolean; successor?: string } = {}): Promise<string | null> =>
  db.as(user, async (tx) =>
    (await one<{ code: string | null }>(tx, `select leave_team($1, $2, $3) as code`, [teamId, opts.del ?? false, opts.successor ?? null])).code
  )

const membersOf = (teamId: string): Promise<{ user_id: string; role: string }[]> =>
  db.pg.query<{ user_id: string; role: string }>(`select user_id, role from team_members where team_id = $1 order by joined_at`, [teamId]).then((r) => r.rows)

const teamExists = async (teamId: string): Promise<boolean> =>
  (await db.pg.query(`select 1 from teams where id = $1`, [teamId])).rows.length === 1

beforeAll(async () => {
  db = await createDb()
  alice = await db.createUser('Alice')
  bob = await db.createUser('Bob')
  carol = await db.createUser('Carol')
}, 60_000)

describe('nhiều team', () => {
  it('một người ở nhiều team với vai trò khác nhau, mỗi team chỉ thấy dữ liệu của team đó', async () => {
    const a = await createTeam(alice, 'Team A')
    const b = await createTeam(bob, 'Team B')
    await join(bob, alice, b, 'manager')
    const mine = await db.as(alice, (tx) => rows<{ team_id: string; role: string }>(tx, `select team_id, role from team_members where user_id = $1`, [alice.id]))
    expect(mine).toEqual(expect.arrayContaining([{ team_id: a, role: 'owner' }, { team_id: b, role: 'manager' }]))
    expect(await db.as(bob, (tx) => rows(tx, `select * from teams where id = $1`, [a]))).toEqual([])
  })
})

describe('rời team', () => {
  it('Member rời bình thường', async () => {
    const t = await createTeam(alice, 'Rời thường')
    await join(alice, bob, t)
    expect(await leave(bob, t)).toBeNull()
    expect(await membersOf(t)).toEqual([{ user_id: alice.id, role: 'owner' }])
  })

  it('Owner cuối cùng (team còn người) phải chỉ định người kế nhiệm', async () => {
    const t = await createTeam(alice, 'Kế nhiệm')
    await join(alice, bob, t)
    expect(await errorOf(leave(alice, t))).toMatch(/last_owner/)
    expect(await errorOf(leave(alice, t, { successor: carol.id }))).toMatch(/successor_invalid/)
    expect(await errorOf(leave(alice, t, { successor: alice.id }))).toMatch(/successor_invalid/)
    expect(await leave(alice, t, { successor: bob.id })).toBeNull()
    expect(await membersOf(t)).toEqual([{ user_id: bob.id, role: 'owner' }])
  })

  it('không xóa được team khi còn người khác', async () => {
    const t = await createTeam(alice, 'Còn người')
    await join(alice, bob, t)
    expect(await errorOf(leave(alice, t, { del: true }))).toMatch(/team_not_empty/)
    expect(await teamExists(t)).toBe(true)
  })

  it('người cuối cùng chọn xóa team → team và dữ liệu bị xóa', async () => {
    const t = await createTeam(alice, 'Xóa')
    await db.as(alice, (tx) => tx.query(`insert into projects (team_id, name) values ($1, 'P')`, [t]))
    expect(await leave(alice, t, { del: true })).toBeNull()
    expect(await teamExists(t)).toBe(false)
    expect((await db.pg.query(`select 1 from projects where team_id = $1`, [t])).rows).toEqual([])
  })

  it('người cuối cùng giữ team → nhận mã khôi phục; người dùng mã thành Owner', async () => {
    const t = await createTeam(alice, 'Giữ')
    await db.as(alice, (tx) => tx.query(`insert into projects (team_id, name) values ($1, 'P')`, [t]))
    const code = await leave(alice, t)
    expect(code).toMatch(/^[0-9A-F]{10}$/)
    expect(await teamExists(t)).toBe(true)
    expect(await membersOf(t)).toEqual([])
    expect(await db.as(alice, (tx) => rows(tx, `select * from teams where id = $1`, [t]))).toEqual([])

    await db.as(carol, (tx) => tx.query(`select accept_invite($1)`, [code]))
    expect(await membersOf(t)).toEqual([{ user_id: carol.id, role: 'owner' }])
    expect(await db.as(carol, (tx) => rows(tx, `select name from projects where team_id = $1`, [t]))).toEqual([{ name: 'P' }])
  })

  it('người cuối cùng xóa trực tiếp dòng thành viên của mình cũng được (không còn ai cần Owner)', async () => {
    const t = await createTeam(alice, 'Trực tiếp')
    expect(await errorOf(db.as(alice, (tx) => tx.query(`delete from team_members where team_id = $1 and user_id = $2`, [t, alice.id])))).toBeNull()
  })

  it('người ngoài không gọi được leave_team cho team khác', async () => {
    const t = await createTeam(alice, 'Ngoài')
    expect(await errorOf(leave(bob, t))).toMatch(/not_member/)
    expect(await errorOf(leave(bob, t, { del: true }))).toMatch(/not_member/)
    expect(await teamExists(t)).toBe(true)
  })
})
