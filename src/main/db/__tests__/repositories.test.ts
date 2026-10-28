import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ASSISTANT, assistantProfileSchema } from '@shared/schemas'
import { openDatabase } from '../client'
import { ConversationRepository, MessageRepository, SettingsRepository, ftsQuery } from '../repositories'

describe('ftsQuery', () => {
  it('bọc từng từ thành cụm tiền tố, bỏ toán tử và ký tự cú pháp', () => {
    expect(ftsQuery('học  react')).toBe('"học"* "react"*')
    expect(ftsQuery('a OR b "c"')).toBe('"a"* "b"* "c"*')
    expect(ftsQuery('"*()')).toBe('')
  })
})

const migrations = join(__dirname, '..', 'migrations')

describe('repositories (SQLite in-memory)', () => {
  let handle: ReturnType<typeof openDatabase>
  let convs: ConversationRepository
  let msgs: MessageRepository
  let settings: SettingsRepository

  beforeEach(() => {
    handle = openDatabase(':memory:', migrations)
    convs = new ConversationRepository(handle.db)
    msgs = new MessageRepository(handle.db)
    settings = new SettingsRepository(handle.db)
  })
  afterEach(() => handle.close())

  it('tạo, đổi tên, ghim và sắp xếp hội thoại (ghim lên đầu)', async () => {
    const a = convs.create('free')
    await new Promise((r) => setTimeout(r, 2))
    const b = convs.create('study')
    expect(convs.list().map((c) => c.id)).toEqual([b.id, a.id])

    convs.update({ id: a.id, pinned: true, title: 'Đồ án' })
    const list = convs.list()
    expect(list[0]).toMatchObject({ id: a.id, pinned: true, title: 'Đồ án' })
  })

  it('tìm theo tiêu đề hoặc nội dung tin nhắn, escape ký tự LIKE', () => {
    const a = convs.create('free')
    convs.update({ id: a.id, title: 'Học React' })
    const b = convs.create('free')
    msgs.insert({ conversationId: b.id, role: 'user', content: 'Giảm 50% chi phí' })

    expect(convs.list('react').map((c) => c.id)).toEqual([a.id])
    expect(convs.list('50%').map((c) => c.id)).toEqual([b.id])
    // Trong tiêu đề, '%' và '_' được hiểu theo nghĩa đen, không phải wildcard
    convs.update({ id: b.id, title: 'Giảm 50%' })
    expect(convs.list('%').map((c) => c.id)).toEqual([b.id])
    expect(convs.list('_')).toHaveLength(0)
  })

  it('tìm toàn văn trong tin nhắn không phân biệt dấu, khớp tiền tố, cập nhật theo nội dung mới', () => {
    const a = convs.create('free')
    const m = msgs.insert({ conversationId: a.id, role: 'assistant', content: 'Lộ trình học lập trình' })
    expect(convs.list('hoc lap').map((c) => c.id)).toEqual([a.id])
    expect(convs.list('trin').map((c) => c.id)).toEqual([a.id])
    expect(convs.list('python')).toEqual([])

    msgs.update(m.id, { content: 'Giờ là Python' })
    expect(convs.list('python').map((c) => c.id)).toEqual([a.id])
    expect(convs.list('lộ trình')).toEqual([])

    convs.remove(a.id)
    expect(convs.list('python')).toEqual([])
  })

  it('truy vấn có ký tự cú pháp FTS không gây lỗi', () => {
    const a = convs.create('free')
    msgs.insert({ conversationId: a.id, role: 'user', content: 'C++ "khó" lắm' })
    for (const q of ['"', 'c++ AND', '(khó*', 'NOT', ':^']) expect(() => convs.list(q)).not.toThrow()
    expect(convs.list('"khó"').map((c) => c.id)).toEqual([a.id])
  })

  it('xóa hội thoại xóa luôn tin nhắn (cascade)', () => {
    const a = convs.create('free')
    msgs.insert({ conversationId: a.id, role: 'user', content: 'hi' })
    convs.remove(a.id)
    expect(msgs.list(a.id)).toEqual([])
  })

  it('lưu session CLI và cập nhật tin nhắn', () => {
    const a = convs.create('code')
    convs.setSession(a.id, 'sess-1')
    expect(convs.get(a.id)?.cliSessionId).toBe('sess-1')

    const m = msgs.insert({ conversationId: a.id, role: 'assistant', content: '', status: 'streaming' })
    msgs.update(m.id, { content: 'xong', status: 'done', toolEvents: [{ name: 'Read', input: {} }] })
    expect(msgs.list(a.id)[0]).toMatchObject({ content: 'xong', status: 'done', toolEvents: [{ name: 'Read' }] })
  })

  it('recent() trả N tin cuối theo thứ tự thời gian', () => {
    const a = convs.create('free')
    for (const t of ['1', '2', '3']) msgs.insert({ conversationId: a.id, role: 'user', content: t })
    expect(msgs.recent(a.id, 2).map((m) => m.content)).toEqual(['2', '3'])
  })

  it('đánh dấu tin còn streaming là aborted khi khởi động lại', () => {
    const a = convs.create('free')
    msgs.insert({ conversationId: a.id, role: 'assistant', content: '', status: 'streaming' })
    expect(msgs.markInterrupted()).toBe(1)
    expect(msgs.list(a.id)[0].status).toBe('aborted')
  })

  it('settings: trả mặc định khi thiếu hoặc dữ liệu hỏng', () => {
    expect(settings.get('assistant', assistantProfileSchema, DEFAULT_ASSISTANT)).toEqual(DEFAULT_ASSISTANT)
    settings.set('assistant', { name: '' })
    expect(settings.get('assistant', assistantProfileSchema, DEFAULT_ASSISTANT)).toEqual(DEFAULT_ASSISTANT)
    const custom = { ...DEFAULT_ASSISTANT, name: 'Bông' }
    settings.set('assistant', custom)
    expect(settings.get('assistant', assistantProfileSchema, DEFAULT_ASSISTANT)).toEqual(custom)
  })
})
