import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../client'
import { ConversationGroupRepository, ConversationRepository, MessageRepository } from '../repositories'

const migrations = join(__dirname, '..', 'migrations')

describe('nhóm, nhánh, gợi ý nhóm (SQLite in-memory)', () => {
  let handle: ReturnType<typeof openDatabase>
  let owner: string
  let convs: ConversationRepository
  let groups: ConversationGroupRepository
  let msgs: MessageRepository

  beforeEach(() => {
    handle = openDatabase(':memory:', migrations)
    owner = 'u1'
    convs = new ConversationRepository(handle.db, () => owner)
    groups = new ConversationGroupRepository(handle.db, () => owner)
    msgs = new MessageRepository(handle.db)
  })
  afterEach(() => handle.close())

  it('tạo / đổi tên / thu gọn nhóm; tên trùng (không dấu, không hoa thường) bị từ chối', () => {
    const unity = groups.create(' Unity ')
    expect(unity.name).toBe('Unity')
    groups.create('Học')
    expect(() => groups.create('hoc')).toThrow('group_name_taken')
    expect(() => groups.update({ id: unity.id, name: 'HỌC' })).toThrow('group_name_taken')
    expect(groups.update({ id: unity.id, name: 'Unity 6', collapsed: true })).toMatchObject({ name: 'Unity 6', collapsed: true })
    expect(groups.list().map((g) => g.name)).toEqual(['Unity 6', 'Học'])
  })

  it('nhóm theo tài khoản: không thấy, không xếp được vào nhóm của người khác', () => {
    const g = groups.create('Unity')
    owner = 'u2'
    expect(groups.list()).toEqual([])
    const c = convs.create('free')
    expect(convs.update({ id: c.id, groupId: g.id })).toBeNull()
    expect(groups.create('Unity').name).toBe('Unity') // tên trùng ở tài khoản khác thì được
  })

  it('xếp vào nhóm bỏ gợi ý; xoá nhóm giữ cuộc trò chuyện', () => {
    const g = groups.create('Unity')
    const c = convs.create('free')
    convs.setSuggestedGroup(c.id, g.id)
    expect(convs.get(c.id)?.suggestedGroupId).toBe(g.id)
    expect(convs.update({ id: c.id, groupId: g.id })).toMatchObject({ groupId: g.id, suggestedGroupId: null })
    groups.remove(g.id)
    expect(convs.get(c.id)).toMatchObject({ groupId: null })
    expect(groups.list()).toEqual([])
  })

  it('trả lời gợi ý: đồng ý → chuyển nhóm; bỏ qua → chỉ xoá gợi ý', () => {
    const g = groups.create('Học')
    const a = convs.create('free')
    const b = convs.create('free')
    convs.setSuggestedGroup(a.id, g.id)
    convs.setSuggestedGroup(b.id, g.id)
    expect(convs.answerSuggestion(a.id, true)).toMatchObject({ groupId: g.id, suggestedGroupId: null })
    expect(convs.answerSuggestion(b.id, false)).toMatchObject({ groupId: null, suggestedGroupId: null })
  })

  it('đổi tên tay → titleSource = user (AI không đặt lại)', () => {
    const c = convs.create('free')
    convs.setAutoTitle(c.id, 'Tạm', 'auto')
    expect(convs.get(c.id)?.titleSource).toBe('auto')
    convs.update({ id: c.id, title: 'Tên của mình' })
    expect(convs.get(c.id)).toMatchObject({ title: 'Tên của mình', titleSource: 'user' })
  })

  it('tìm kiếm theo tên nhóm', () => {
    const g = groups.create('Unity')
    const c = convs.create('free')
    convs.setAutoTitle(c.id, 'Sửa lỗi va chạm', 'fixed')
    convs.update({ id: c.id, groupId: g.id })
    const other = convs.create('free')
    convs.setAutoTitle(other.id, 'Nấu ăn', 'fixed')
    expect(convs.list('unity').map((x) => x.id)).toEqual([c.id])
    expect(convs.list('va chạm').map((x) => x.id)).toEqual([c.id])
  })

  it('tách nhánh: bản sao các tin tới tin được chọn, cùng nhóm, trỏ về gốc', () => {
    const g = groups.create('Unity')
    const parent = convs.create('code')
    convs.setAutoTitle(parent.id, 'Gốc', 'fixed')
    convs.update({ id: parent.id, groupId: g.id })
    const m1 = msgs.insert({ conversationId: parent.id, role: 'user', content: 'một' })
    const m2 = msgs.insert({ conversationId: parent.id, role: 'assistant', content: 'hai', status: 'done' })
    msgs.insert({ conversationId: parent.id, role: 'user', content: 'ba' })
    const fork = convs.fork(m2.id)!
    expect(fork).toMatchObject({ parentId: parent.id, groupId: g.id, mode: 'code', title: 'Gốc' })
    const copied = msgs.list(fork.id)
    expect(copied.map((m) => m.content)).toEqual(['một', 'hai'])
    expect(copied.every((m) => m.id !== m1.id && m.id !== m2.id)).toBe(true)
    // Tin gốc không đổi.
    expect(msgs.list(parent.id)).toHaveLength(3)
    // Xoá gốc → nhánh còn, thành hội thoại thường.
    convs.remove(parent.id)
    expect(convs.get(fork.id)).toMatchObject({ parentId: null })
  })

  it('tách nhánh: không được từ tin của tài khoản khác', () => {
    const c = convs.create('free')
    const m = msgs.insert({ conversationId: c.id, role: 'user', content: 'x' })
    owner = 'u2'
    expect(convs.fork(m.id)).toBeNull()
  })

  it('đổi tài khoản lần đầu: nhóm đi cùng lịch sử chat', () => {
    owner = 'local'
    groups.create('Unity')
    convs.reassign('local', 'u9')
    owner = 'u9'
    expect(groups.list().map((g) => g.name)).toEqual(['Unity'])
  })

  it('bảo trì: chỉ liệt kê tiêu đề có chữ artifact', () => {
    const c = convs.create('free')
    convs.setAutoTitle(c.id, 'Tạo artifact type="doc" title="GDD"', 'fixed')
    convs.create('free')
    expect(convs.listAllForMaintenance().map((x) => x.id)).toEqual([c.id])
  })
})
