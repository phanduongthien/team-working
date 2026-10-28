import type { Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, errorOf, type Db, type TestUser } from './harness'

/**
 * Quyền feedback: public / anonymous / private, đánh giá định kỳ, thread trả lời,
 * và cài đặt cá nhân (user_settings) chỉ chính chủ đọc được.
 */
let db: Db
let owner: TestUser, manager: TestUser, alice: TestUser, bob: TestUser, outsider: TestUser
let teamId: string
let projectId: string

type Fb = { id: string; author_id: string | null; is_mine: boolean; visibility: string; status: string; reply_count: number }

const rows = async <T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T[]> => (await tx.query<T>(sql, params)).rows

/** Gửi feedback (INSERT không RETURNING như client thật) rồi trả id qua view của chính tác giả. */
async function send(user: TestUser, f: Record<string, unknown>): Promise<string> {
  const fields = { team_id: teamId, category: 'suggestion', body: `fb ${Math.random()}`, ...f }
  const cols = Object.keys(fields)
  await db.as(user, (tx) =>
    tx.query(`insert into feedback (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`, Object.values(fields))
  )
  const mine = await db.as(user, (tx) => rows<{ id: string }>(tx, `select id from feedback_visible where body = $1`, [fields.body]))
  return mine[0].id
}

const visibleTo = (user: TestUser, id: string): Promise<Fb[]> =>
  db.as(user, (tx) => rows<Fb>(tx, `select * from feedback_visible where id = $1`, [id]))

beforeAll(async () => {
  db = await createDb()
  owner = await db.createUser('Owner')
  manager = await db.createUser('Manager')
  alice = await db.createUser('Alice')
  bob = await db.createUser('Bob')
  outsider = await db.createUser('Outsider')
  teamId = (await db.as(owner, (tx) => rows<{ id: string }>(tx, `select (create_team('Nhóm')).id`)))[0].id
  for (const [user, role] of [[manager, 'manager'], [alice, 'member'], [bob, 'member']] as const) {
    const code = (await db.as(owner, (tx) => rows<{ code: string }>(tx, `insert into team_invites (team_id, role) values ($1, $2) returning code`, [teamId, role])))[0].code
    await db.as(user, (tx) => tx.query(`select accept_invite($1)`, [code]))
  }
  projectId = (await db.as(manager, (tx) => rows<{ id: string }>(tx, `insert into projects (team_id, name) values ($1, 'P') returning id`, [teamId])))[0].id
}, 60_000)

describe('góp ý dự án', () => {
  it('công khai: mọi thành viên thấy nội dung và người gửi; người ngoài không thấy', async () => {
    const id = await send(alice, { kind: 'project', visibility: 'public', project_id: projectId })
    for (const u of [owner, manager, bob]) expect((await visibleTo(u, id))[0]?.author_id, u.name).toBe(alice.id)
    expect(await visibleTo(outsider, id)).toEqual([])
  })

  it('ẩn danh: Member khác không thấy người gửi, Manager/Owner thấy, tác giả thấy là của mình', async () => {
    const id = await send(alice, { kind: 'project', visibility: 'anonymous' })
    expect((await visibleTo(bob, id))[0]).toMatchObject({ author_id: null, is_mine: false })
    expect((await visibleTo(manager, id))[0].author_id).toBe(alice.id)
    expect((await visibleTo(owner, id))[0].author_id).toBe(alice.id)
    expect((await visibleTo(alice, id))[0]).toMatchObject({ author_id: alice.id, is_mine: true })
  })

  it('riêng tư (gửi quản lý): chỉ tác giả và Manager/Owner thấy', async () => {
    const id = await send(alice, { kind: 'project', visibility: 'private' })
    expect(await visibleTo(bob, id)).toEqual([])
    expect(await visibleTo(manager, id)).toHaveLength(1)
    expect(await visibleTo(alice, id)).toHaveLength(1)
  })

  it('Manager/Owner được thông báo có góp ý mới, không lộ người gửi ẩn danh', async () => {
    const id = await send(bob, { kind: 'project', visibility: 'anonymous', body: 'quy trình review chậm' })
    const notes = await db.as(manager, (tx) => rows<{ payload: { by: string | null } }>(tx, `select payload from notifications where payload->>'feedback_id' = $1`, [id]))
    expect(notes).toHaveLength(1)
    expect(notes[0].payload.by).toBeNull()
  })
})

describe('feedback cho một người', () => {
  it('riêng tư: người nhận, người gửi, Manager thấy; Member khác không', async () => {
    const id = await send(manager, { kind: 'person', visibility: 'private', recipient_id: alice.id, category: 'improve' })
    expect(await visibleTo(alice, id)).toHaveLength(1)
    expect(await visibleTo(owner, id)).toHaveLength(1)
    expect(await visibleTo(bob, id)).toEqual([])
    const notes = await db.as(alice, (tx) => rows(tx, `select * from notifications where type = 'feedback_received' and payload->>'feedback_id' = $1`, [id]))
    expect(notes).toHaveLength(1)
  })

  it('công khai về một người chỉ được để khen ngợi', async () => {
    expect(await errorOf(send(bob, { kind: 'person', visibility: 'public', recipient_id: alice.id, category: 'praise' }))).toBeNull()
    expect(await errorOf(send(bob, { kind: 'person', visibility: 'public', recipient_id: alice.id, category: 'improve' }))).toMatch(/feedback_public_person_praise/)
  })

  it('không ẩn danh nhắm vào một người; không tự gửi cho mình; người nhận phải trong team', async () => {
    expect(await errorOf(send(bob, { kind: 'person', visibility: 'anonymous', recipient_id: alice.id }))).toMatch(/feedback_anonymous_project_only/)
    expect(await errorOf(send(bob, { kind: 'person', visibility: 'private', recipient_id: bob.id }))).toMatch(/cannot_feedback_self/)
    expect(await errorOf(send(bob, { kind: 'person', visibility: 'private', recipient_id: outsider.id }))).toMatch(/recipient_not_in_team/)
  })

  it('đánh giá định kỳ chỉ Manager/Owner tạo và luôn riêng tư', async () => {
    expect(await errorOf(send(bob, { kind: 'review', visibility: 'private', recipient_id: alice.id, period: '2026-Q4' }))).toMatch(/review_managers_only/)
    expect(await errorOf(send(manager, { kind: 'review', visibility: 'public', recipient_id: alice.id }))).toMatch(/feedback_review_private/)
    expect(await errorOf(send(manager, { kind: 'review', visibility: 'private', recipient_id: alice.id, period: '2026-Q4' }))).toBeNull()
  })

  it('không giả danh người gửi', async () => {
    const id = await send(bob, { kind: 'project', visibility: 'public', author_id: owner.id })
    expect((await visibleTo(manager, id))[0].author_id).toBe(bob.id)
  })
})

describe('bảng gốc bị khóa đọc', () => {
  it('Member không đọc trực tiếp bảng feedback (không lộ người gửi ẩn danh)', async () => {
    expect(await errorOf(db.as(bob, (tx) => tx.query(`select author_id from feedback`)))).toMatch(/permission denied/)
    expect(await errorOf(db.as(bob, (tx) => tx.query(`select author_id from feedback_replies`)))).toMatch(/permission denied/)
    expect(await errorOf(db.as(bob, (tx) => tx.query(`update feedback set status = 'resolved'`)))).toMatch(/permission denied/)
  })
})

describe('thread trả lời & trạng thái', () => {
  it('trả lời trong thread ẩn danh: tác giả vẫn ẩn danh với Member, Manager thấy; mọi bên được thông báo', async () => {
    const id = await send(alice, { kind: 'project', visibility: 'anonymous', body: 'thiếu tài liệu' })
    await db.as(manager, (tx) => tx.query(`insert into feedback_replies (feedback_id, body) values ($1, 'Cảm ơn, sẽ bổ sung')`, [id]))
    await db.as(alice, (tx) => tx.query(`insert into feedback_replies (feedback_id, body) values ($1, 'Cảm ơn anh')`, [id]))
    type R = { author_id: string | null; by_feedback_author: boolean; body: string }
    const forBob = await db.as(bob, (tx) => rows<R>(tx, `select author_id, by_feedback_author, body from feedback_replies_visible where feedback_id = $1 order by created_at`, [id]))
    expect(forBob).toEqual([
      { author_id: manager.id, by_feedback_author: false, body: 'Cảm ơn, sẽ bổ sung' },
      { author_id: null, by_feedback_author: true, body: 'Cảm ơn anh' }
    ])
    const forManager = await db.as(manager, (tx) => rows<R>(tx, `select author_id from feedback_replies_visible where feedback_id = $1 order by created_at`, [id]))
    expect(forManager.map((r) => r.author_id)).toEqual([manager.id, alice.id])
    expect((await visibleTo(bob, id))[0].reply_count).toBe(2)

    const aliceNotes = await db.as(alice, (tx) => rows(tx, `select * from notifications where type = 'feedback_reply' and payload->>'feedback_id' = $1`, [id]))
    expect(aliceNotes).toHaveLength(1)
    const ownerNotes = await db.as(owner, (tx) => rows<{ payload: { by: string | null } }>(tx, `select payload from notifications where type = 'feedback_reply' and payload->>'feedback_id' = $1 order by created_at`, [id]))
    expect(ownerNotes.map((n) => n.payload.by)).toEqual([manager.id, null])
  })

  it('không trả lời được feedback mình không thấy', async () => {
    const id = await send(manager, { kind: 'person', visibility: 'private', recipient_id: alice.id })
    expect(await errorOf(db.as(bob, (tx) => tx.query(`insert into feedback_replies (feedback_id, body) values ($1, 'x')`, [id])))).toMatch(/row-level security/)
  })

  it('người nhận hoặc Manager đổi trạng thái; Member khác không', async () => {
    const id = await send(manager, { kind: 'person', visibility: 'public', recipient_id: alice.id, category: 'praise' })
    expect(await errorOf(db.as(bob, (tx) => tx.query(`select set_feedback_status($1, 'resolved')`, [id])))).toMatch(/not_allowed/)
    expect(await errorOf(db.as(alice, (tx) => tx.query(`select set_feedback_status($1, 'acknowledged')`, [id])))).toBeNull()
    expect((await visibleTo(bob, id))[0].status).toBe('acknowledged')
  })

  it('xóa: tác giả hoặc Manager; người khác bị chặn', async () => {
    const id = await send(bob, { kind: 'project', visibility: 'public' })
    expect(await errorOf(db.as(alice, (tx) => tx.query(`select delete_feedback($1)`, [id])))).toMatch(/not_allowed/)
    expect(await errorOf(db.as(bob, (tx) => tx.query(`select delete_feedback($1)`, [id])))).toBeNull()
    expect(await visibleTo(manager, id)).toEqual([])
  })
})

describe('user_settings', () => {
  it('chỉ chính chủ đọc/ghi cài đặt trợ lý (Owner cũng không thấy)', async () => {
    await db.as(alice, (tx) => tx.query(`insert into user_settings (assistant) values ($1)`, [JSON.stringify({ name: 'Bông' })]))
    expect(await db.as(alice, (tx) => rows(tx, `select * from user_settings`))).toHaveLength(1)
    expect(await db.as(owner, (tx) => rows(tx, `select * from user_settings`))).toEqual([])
    await db.as(owner, (tx) => tx.query(`update user_settings set assistant = '{}'`))
    const mine = await db.as(alice, (tx) => rows<{ assistant: { name: string } }>(tx, `select assistant from user_settings`))
    expect(mine[0].assistant.name).toBe('Bông')
    expect(await errorOf(db.as(bob, (tx) => tx.query(`insert into user_settings (user_id, assistant) values ($1, '{}')`, [alice.id])))).not.toBeNull()
  })
})
