import type { Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { createDb, errorOf, type Db, type TestUser } from './harness'

/**
 * Kiểm tra quyền dữ liệu team với 4 người: Owner, Manager, Member, và người ngoài team.
 */
let db: Db
let owner: TestUser, manager: TestUser, member: TestUser, outsider: TestUser
let teamId: string
let projectId: string

const one = async <T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> =>
  (await tx.query<T>(sql, params)).rows[0]
const rows = async <T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T[]> =>
  (await tx.query<T>(sql, params)).rows

async function addTask(user: TestUser, fields: Record<string, unknown>): Promise<{ id: string }> {
  const cols = ['project_id', ...Object.keys(fields)]
  const vals = [projectId, ...Object.values(fields)]
  const ph = vals.map((_, i) => `$${i + 1}`).join(', ')
  return db.as(user, (tx) => one(tx, `insert into tasks (${cols.join(', ')}) values (${ph}) returning id`, vals))
}

beforeAll(async () => {
  db = await createDb()
  owner = await db.createUser('Owner')
  manager = await db.createUser('Manager')
  member = await db.createUser('Member')
  outsider = await db.createUser('Outsider')

  teamId = (await db.as(owner, (tx) => one<{ id: string }>(tx, `select (create_team('Nhóm A')).id`))).id
  // Mời Manager bằng email, Member bằng mã chia sẻ.
  const emailInvite = await db.as(owner, (tx) =>
    one<{ code: string }>(tx, `insert into team_invites (team_id, email, role) values ($1, $2, 'manager') returning code`, [teamId, manager.email])
  )
  await db.as(manager, (tx) => tx.query(`select accept_invite($1)`, [emailInvite.code]))
  const codeInvite = await db.as(owner, (tx) =>
    one<{ code: string }>(tx, `insert into team_invites (team_id) values ($1) returning code`, [teamId])
  )
  await db.as(member, (tx) => tx.query(`select accept_invite($1)`, [codeInvite.code.toLowerCase()]))

  projectId = (
    await db.as(manager, (tx) =>
      one<{ id: string }>(tx, `insert into projects (team_id, name) values ($1, 'Website') returning id`, [teamId])
    )
  ).id
}, 60_000)

describe('profiles & team', () => {
  it('trigger tạo profile từ thông tin GitHub', async () => {
    const p = await db.as(owner, (tx) => one<{ display_name: string; github_username: string }>(tx, `select * from profiles where id = $1`, [owner.id]))
    expect(p).toMatchObject({ display_name: 'Owner', github_username: 'owner' })
  })

  it('người cùng team thấy hồ sơ nhau; người ngoài chỉ thấy mình', async () => {
    expect(await db.as(member, (tx) => rows(tx, `select id from profiles`))).toHaveLength(3)
    expect(await db.as(outsider, (tx) => rows<{ id: string }>(tx, `select id from profiles`))).toEqual([{ id: outsider.id }])
  })

  it('không sửa được hồ sơ người khác', async () => {
    await db.as(member, (tx) => tx.query(`update profiles set display_name = 'hack' where id = $1`, [owner.id]))
    const p = await db.as(owner, (tx) => one<{ display_name: string }>(tx, `select display_name from profiles where id = $1`, [owner.id]))
    expect(p.display_name).toBe('Owner')
  })

  it('vai trò sau khi nhận lời mời đúng như lời mời', async () => {
    const members = await db.as(member, (tx) => rows<{ user_id: string; role: string }>(tx, `select user_id, role from team_members order by role`))
    expect(members.map((m) => m.role).sort()).toEqual(['manager', 'member', 'owner'])
  })

  it('người ngoài không thấy team, thành viên, dự án, task', async () => {
    await addTask(manager, { title: 'Thiết kế' })
    for (const table of ['teams', 'team_members', 'projects', 'tasks', 'team_invites']) {
      expect(await db.as(outsider, (tx) => rows(tx, `select * from ${table}`)), table).toEqual([])
    }
  })

  it('anon không đọc được gì', async () => {
    expect(await errorOf(db.as(null, (tx) => tx.query(`select * from teams`)))).toMatch(/permission denied/)
  })

  it('không tạo team trực tiếp (phải qua create_team)', async () => {
    expect(await errorOf(db.as(member, (tx) => tx.query(`insert into teams (name, created_by) values ('x', $1)`, [member.id])))).not.toBeNull()
  })
})

describe('lời mời', () => {
  it('Manager chỉ mời được Member; Member không mời được ai', async () => {
    expect(await errorOf(db.as(manager, (tx) => tx.query(`insert into team_invites (team_id) values ($1)`, [teamId])))).toBeNull()
    expect(await errorOf(db.as(manager, (tx) => tx.query(`insert into team_invites (team_id, role) values ($1, 'manager')`, [teamId])))).toMatch(/row-level security/)
    expect(await errorOf(db.as(member, (tx) => tx.query(`insert into team_invites (team_id) values ($1)`, [teamId])))).toMatch(/row-level security/)
    expect(await errorOf(db.as(owner, (tx) => tx.query(`insert into team_invites (team_id, role) values ($1, 'owner')`, [teamId])))).toMatch(/check constraint/)
  })

  it('lời mời theo email chỉ dùng được bởi đúng email và chỉ một lần', async () => {
    const intruder = await db.createUser('Intruder')
    const target = await db.createUser('Target')
    const { code } = await db.as(owner, (tx) =>
      one<{ code: string }>(tx, `insert into team_invites (team_id, email) values ($1, $2) returning code`, [teamId, target.email])
    )
    expect(await db.as(target, (tx) => rows(tx, `select * from my_invites()`))).toHaveLength(1)
    expect(await errorOf(db.as(intruder, (tx) => tx.query(`select accept_invite($1)`, [code])))).toMatch(/invite_email_mismatch/)
    expect(await errorOf(db.as(target, (tx) => tx.query(`select accept_invite($1)`, [code])))).toBeNull()
    expect(await errorOf(db.as(target, (tx) => tx.query(`select accept_invite($1)`, [code])))).toMatch(/invite_invalid/)
    await db.as(target, (tx) => tx.query(`delete from team_members where user_id = $1`, [target.id]))
  })

  it('mã hết hạn không dùng được', async () => {
    const late = await db.createUser('Late')
    const { code } = await db.as(owner, (tx) =>
      one<{ code: string }>(tx, `insert into team_invites (team_id, expires_at) values ($1, now() - interval '1 minute') returning code`, [teamId])
    )
    expect(await errorOf(db.as(late, (tx) => tx.query(`select accept_invite($1)`, [code])))).toMatch(/invite_invalid/)
  })

  it('Member không xem được danh sách lời mời', async () => {
    expect(await db.as(member, (tx) => rows(tx, `select * from team_invites`))).toEqual([])
  })
})

describe('thành viên & vai trò', () => {
  it('chỉ Owner đổi vai trò', async () => {
    await db.as(manager, (tx) => tx.query(`update team_members set role = 'owner' where user_id = $1`, [manager.id]))
    const role = await db.as(owner, (tx) => one<{ role: string }>(tx, `select role from team_members where user_id = $1`, [manager.id]))
    expect(role.role).toBe('manager')
  })

  it('không cho Owner cuối cùng rời team hay tự hạ vai trò', async () => {
    expect(await errorOf(db.as(owner, (tx) => tx.query(`delete from team_members where user_id = $1`, [owner.id])))).toMatch(/last_owner/)
    expect(await errorOf(db.as(owner, (tx) => tx.query(`update team_members set role = 'member' where user_id = $1`, [owner.id])))).toMatch(/last_owner/)
  })

  it('Member không xóa được người khác', async () => {
    await db.as(member, (tx) => tx.query(`delete from team_members where user_id = $1`, [manager.id]))
    expect(await db.as(owner, (tx) => rows(tx, `select * from team_members where user_id = $1`, [manager.id]))).toHaveLength(1)
  })
})

describe('dự án', () => {
  it('Member xem được nhưng không tạo/sửa/xóa', async () => {
    expect(await db.as(member, (tx) => rows(tx, `select * from projects`))).toHaveLength(1)
    expect(await errorOf(db.as(member, (tx) => tx.query(`insert into projects (team_id, name) values ($1, 'x')`, [teamId])))).toMatch(/row-level security/)
    await db.as(member, (tx) => tx.query(`update projects set name = 'hack'`))
    await db.as(member, (tx) => tx.query(`delete from projects`))
    const p = await db.as(owner, (tx) => one<{ name: string }>(tx, `select name from projects where id = $1`, [projectId]))
    expect(p.name).toBe('Website')
  })
})

describe('task', () => {
  it('Manager giao task cho Member → Member nhận thông báo', async () => {
    const t = await addTask(manager, { title: 'Làm trang chủ', assignee_id: member.id })
    const notes = await db.as(member, (tx) => rows<{ type: string; payload: { task_id: string } }>(tx, `select type, payload from notifications`))
    expect(notes).toContainEqual(expect.objectContaining({ type: 'task_assigned', payload: expect.objectContaining({ task_id: t.id }) }))
    // Người khác không thấy thông báo của Member.
    expect(await db.as(manager, (tx) => rows(tx, `select * from notifications where user_id = $1`, [member.id]))).toEqual([])
  })

  it('Member không giao task cho người khác, chỉ tạo cho chính mình', async () => {
    expect(await errorOf(addTask(member, { title: 'x', assignee_id: manager.id }))).toMatch(/row-level security/)
    expect(await errorOf(addTask(member, { title: 'Việc của tôi', assignee_id: member.id }))).toBeNull()
  })

  it('người được giao chỉ đổi trạng thái/giờ, không đổi tiêu đề hay người làm', async () => {
    const t = await addTask(manager, { title: 'Viết API', assignee_id: member.id })
    expect(await errorOf(db.as(member, (tx) => tx.query(`update tasks set status = 'in_progress', estimate_hours = 5 where id = $1`, [t.id])))).toBeNull()
    expect(await errorOf(db.as(member, (tx) => tx.query(`update tasks set title = 'đổi' where id = $1`, [t.id])))).toMatch(/assignee_can_only_update_status/)
    expect(await errorOf(db.as(member, (tx) => tx.query(`update tasks set assignee_id = $2 where id = $1`, [t.id, owner.id])))).toMatch(/assignee_can_only_update_status/)
  })

  it('Member không sửa/xóa task không liên quan tới mình', async () => {
    const t = await addTask(manager, { title: 'Của Manager', assignee_id: manager.id })
    await db.as(member, (tx) => tx.query(`update tasks set status = 'done' where id = $1`, [t.id]))
    await db.as(member, (tx) => tx.query(`delete from tasks where id = $1`, [t.id]))
    const after = await db.as(manager, (tx) => one<{ status: string }>(tx, `select status from tasks where id = $1`, [t.id]))
    expect(after.status).toBe('todo')
  })

  it('Done tự ghi completed_at, lịch sử trạng thái, và báo người giao', async () => {
    const t = await addTask(manager, { title: 'Kiểm thử', assignee_id: member.id })
    await db.as(member, (tx) => tx.query(`update tasks set status = 'done' where id = $1`, [t.id]))
    const task = await db.as(member, (tx) => one<{ completed_at: string | null }>(tx, `select completed_at from tasks where id = $1`, [t.id]))
    expect(task.completed_at).not.toBeNull()
    const events = await db.as(member, (tx) => rows<{ from_status: string | null; to_status: string }>(tx, `select from_status, to_status from task_status_events where task_id = $1 order by id`, [t.id]))
    expect(events).toEqual([{ from_status: null, to_status: 'todo' }, { from_status: 'todo', to_status: 'done' }])
    const notes = await db.as(manager, (tx) => rows<{ type: string }>(tx, `select type from notifications where payload->>'task_id' = $1`, [t.id]))
    expect(notes.map((n) => n.type)).toEqual(['task_status'])
  })

  it('không giao được cho người ngoài team; team_id luôn theo dự án', async () => {
    expect(await errorOf(addTask(manager, { title: 'x', assignee_id: outsider.id }))).toMatch(/assignee_not_in_team/)
    const other = (await db.as(outsider, (tx) => one<{ id: string }>(tx, `select (create_team('B')).id`))).id
    const t = await addTask(manager, { title: 'team giả', team_id: other })
    const row = await db.as(manager, (tx) => one<{ team_id: string }>(tx, `select team_id from tasks where id = $1`, [t.id]))
    expect(row.team_id).toBe(teamId)
  })

  it('subtask phải cùng dự án', async () => {
    const parent = await addTask(manager, { title: 'Cha' })
    expect(await errorOf(addTask(manager, { title: 'Con', parent_id: parent.id }))).toBeNull()
    expect(await errorOf(addTask(manager, { title: 'Con lạc', parent_id: '00000000-0000-4000-8000-999999999999' }))).toMatch(/parent_task_invalid/)
  })
})

describe('bình luận', () => {
  it('bình luận báo cho người được giao và người giao (trừ chính tác giả)', async () => {
    const t = await addTask(manager, { title: 'Cần review', assignee_id: member.id })
    await db.as(owner, (tx) => tx.query(`insert into task_comments (task_id, body) values ($1, 'Nhớ thêm test')`, [t.id]))
    const forMember = await db.as(member, (tx) => rows(tx, `select * from notifications where type = 'task_comment' and payload->>'task_id' = $1`, [t.id]))
    const forManager = await db.as(manager, (tx) => rows(tx, `select * from notifications where type = 'task_comment' and payload->>'task_id' = $1`, [t.id]))
    expect(forMember).toHaveLength(1)
    expect(forManager).toHaveLength(1)
  })

  it('không viết bình luận dưới tên người khác; người ngoài không bình luận được', async () => {
    const t = await addTask(manager, { title: 'Bình luận' })
    expect(await errorOf(db.as(member, (tx) => tx.query(`insert into task_comments (task_id, body, author_id) values ($1, 'x', $2)`, [t.id, owner.id])))).toMatch(/row-level security/)
    expect(await errorOf(db.as(outsider, (tx) => tx.query(`insert into task_comments (task_id, body) values ($1, 'x')`, [t.id])))).toMatch(/row-level security/)
  })
})

describe('storage & trí nhớ', () => {
  it('file đính kèm chỉ thành viên team đọc/ghi được (theo thư mục team)', async () => {
    const path = `${teamId}/task/abc-file.pdf`
    expect(await errorOf(db.as(member, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('task-files', $1)`, [path])))).toBeNull()
    expect(await errorOf(db.as(outsider, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('task-files', $1)`, [path + '2'])))).toMatch(/row-level security/)
    expect(await db.as(outsider, (tx) => rows(tx, `select * from storage.objects`))).toEqual([])
    expect(await db.as(manager, (tx) => rows(tx, `select * from storage.objects`))).toHaveLength(1)
  })

  it('sao lưu trí nhớ: mỗi người chỉ thấy của mình', async () => {
    await db.as(member, (tx) => tx.query(`insert into user_memories (id, content, category) values (gen_random_uuid(), 'Học Rust', 'goal')`))
    expect(await db.as(member, (tx) => rows(tx, `select * from user_memories`))).toHaveLength(1)
    expect(await db.as(owner, (tx) => rows(tx, `select * from user_memories`))).toEqual([])
  })
})
