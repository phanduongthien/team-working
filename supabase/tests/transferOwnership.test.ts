import type { Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, errorOf, type Db, type TestUser } from './harness'

/** Nhường quyền Owner cho người khác trong team. */
let db: Db
let alice: TestUser, bob: TestUser, carol: TestUser, dave: TestUser

const one = async <T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> => (await tx.query<T>(sql, params)).rows[0]

const createTeam = async (user: TestUser, name: string): Promise<string> =>
  (await db.as(user, (tx) => one<{ id: string }>(tx, `select (create_team($1)).id`, [name]))).id

async function join(owner: TestUser, user: TestUser, teamId: string, role = 'member'): Promise<void> {
  const { code } = await db.as(owner, (tx) =>
    one<{ code: string }>(tx, `insert into team_invites (team_id, role) values ($1, $2) returning code`, [teamId, role])
  )
  await db.as(user, (tx) => tx.query(`select accept_invite($1)`, [code]))
}

const transfer = (user: TestUser, teamId: string, newOwner: string | null): Promise<unknown> =>
  db.as(user, (tx) => tx.query(`select transfer_ownership($1, $2)`, [teamId, newOwner]))

const roleOf = async (teamId: string, userId: string): Promise<string | undefined> =>
  (await db.pg.query<{ role: string }>(`select role from team_members where team_id = $1 and user_id = $2`, [teamId, userId])).rows[0]?.role

beforeAll(async () => {
  db = await createDb()
  alice = await db.createUser('Alice')
  bob = await db.createUser('Bob')
  carol = await db.createUser('Carol')
  dave = await db.createUser('Dave')
}, 60_000)

describe('nhường quyền Owner', () => {
  it('Owner nhường cho Member → người nhận thành Owner, người nhường thành Manager', async () => {
    const t = await createTeam(alice, 'Nhường')
    await join(alice, bob, t)
    expect(await errorOf(transfer(alice, t, bob.id))).toBeNull()
    expect(await roleOf(t, bob.id)).toBe('owner')
    expect(await roleOf(t, alice.id)).toBe('manager')
  })

  it('Owner cũ mất quyền Owner ngay sau khi nhường', async () => {
    const t = await createTeam(alice, 'Mất quyền')
    await join(alice, bob, t)
    await transfer(alice, t, bob.id)
    expect(await errorOf(transfer(alice, t, bob.id))).toMatch(/not_allowed/)
    expect(await errorOf(db.as(alice, (tx) => tx.query(`delete from teams where id = $1`, [t])))).toBeNull()
    expect((await db.pg.query(`select 1 from teams where id = $1`, [t])).rows).toHaveLength(1)
  })

  it('Manager và Member không nhường được', async () => {
    const t = await createTeam(alice, 'Không quyền')
    await join(alice, bob, t, 'manager')
    await join(alice, carol, t)
    expect(await errorOf(transfer(bob, t, carol.id))).toMatch(/not_allowed/)
    expect(await errorOf(transfer(carol, t, bob.id))).toMatch(/not_allowed/)
    expect(await roleOf(t, alice.id)).toBe('owner')
  })

  it('người ngoài team không nhường được và không nhận được', async () => {
    const t = await createTeam(alice, 'Người ngoài')
    await join(alice, bob, t)
    expect(await errorOf(transfer(dave, t, bob.id))).toMatch(/not_allowed/)
    expect(await errorOf(transfer(alice, t, dave.id))).toMatch(/new_owner_invalid/)
    expect(await roleOf(t, alice.id)).toBe('owner')
    expect(await roleOf(t, dave.id)).toBeUndefined()
  })

  it('không nhường cho chính mình hoặc null', async () => {
    const t = await createTeam(alice, 'Chính mình')
    await join(alice, bob, t)
    expect(await errorOf(transfer(alice, t, alice.id))).toMatch(/new_owner_invalid/)
    expect(await errorOf(transfer(alice, t, null))).toMatch(/new_owner_invalid/)
    expect(await roleOf(t, alice.id)).toBe('owner')
  })
})
