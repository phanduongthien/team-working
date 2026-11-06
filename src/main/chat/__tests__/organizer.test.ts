import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent } from '@shared/ai'
import { DEFAULT_CHAT_ORGANIZE_SETTINGS, type ChatOrganizeSettings } from '@shared/schemas'
import type { AIProvider, ChatRequest } from '../../ai/AIProvider'
import { openDatabase } from '../../db/client'
import { ConversationGroupRepository, ConversationRepository, MessageRepository } from '../../db/repositories'
import { ConversationOrganizer } from '../organizer'

const migrations = join(__dirname, '..', '..', 'db', 'migrations')

/** Provider giả: ghi lại yêu cầu, trả câu cố định. */
function provider(reply: string): AIProvider & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = []
  return {
    id: 'test',
    stateful: false,
    calls,
    isAvailable: async () => ({ ok: true }),
    async *chat(req): AsyncIterable<ChatEvent> {
      calls.push(req)
      yield { type: 'text', delta: reply }
      yield { type: 'done' }
    }
  }
}

describe('ConversationOrganizer', () => {
  let handle: ReturnType<typeof openDatabase>
  let convs: ConversationRepository
  let groups: ConversationGroupRepository
  let msgs: MessageRepository
  let settings: ChatOrganizeSettings
  let ai: ReturnType<typeof provider>
  let changed: ReturnType<typeof vi.fn<() => void>>
  let organizer: ConversationOrganizer

  const setup = (reply: string): void => {
    ai = provider(reply)
    organizer = new ConversationOrganizer({
      conversations: convs,
      groups,
      messages: msgs,
      getProvider: () => ai,
      getSettings: () => settings,
      workspaceDir: 'C:\\ws',
      log: { info: () => {}, warn: () => {} },
      changed
    })
  }

  beforeEach(() => {
    handle = openDatabase(':memory:', migrations)
    convs = new ConversationRepository(handle.db)
    groups = new ConversationGroupRepository(handle.db)
    msgs = new MessageRepository(handle.db)
    settings = { ...DEFAULT_CHAT_ORGANIZE_SETTINGS }
    changed = vi.fn<() => void>()
  })
  afterEach(() => handle.close())

  const turn = (id: string, user: string, status: 'done' | 'error' = 'done'): void => {
    msgs.insert({ conversationId: id, role: 'user', content: user })
    msgs.insert({ conversationId: id, role: 'assistant', content: 'trả lời', status })
  }

  it('tin đầu: tiêu đề tạm + gợi ý nhóm theo từ khoá ngay; sau trả lời: model rẻ đặt tiêu đề', async () => {
    setup('{"title":"Nhảy trong Unity","group":null}')
    const g = groups.create('Unity')
    const c = convs.create('free')
    organizer.onFirstMessage(c.id, 'Trong Unity làm sao cho nhân vật nhảy?')
    expect(convs.get(c.id)).toMatchObject({ title: 'Trong Unity làm sao cho nhân vật nhảy?', titleSource: 'auto', suggestedGroupId: g.id })
    turn(c.id, 'Trong Unity làm sao cho nhân vật nhảy?')
    await organizer.afterRun(c.id)
    expect(ai.calls).toHaveLength(1)
    expect(ai.calls[0]).toMatchObject({ model: 'cheap', ephemeral: true })
    // Đã có gợi ý từ khoá → không hỏi nhóm nữa.
    expect(ai.calls[0].prompt).toContain('Không cần chọn nhóm')
    expect(convs.get(c.id)).toMatchObject({ title: 'Nhảy trong Unity', titleSource: 'ai' })
    expect(changed).toHaveBeenCalled()
    // Chỉ một lần cho mỗi cuộc.
    turn(c.id, 'thêm')
    await organizer.afterRun(c.id)
    expect(ai.calls).toHaveLength(1)
  })

  it('từ khoá không ra → model chọn nhóm (chỉ trong danh sách có sẵn)', async () => {
    setup('{"title":"Ôn thi cuối kỳ","group":"Học"}')
    const g = groups.create('Học')
    const c = convs.create('free')
    organizer.onFirstMessage(c.id, 'mai thi giải tích rồi')
    expect(convs.get(c.id)?.suggestedGroupId).toBeNull()
    turn(c.id, 'mai thi giải tích rồi')
    await organizer.afterRun(c.id)
    expect(ai.calls[0].prompt).toContain('"Học"')
    expect(convs.get(c.id)).toMatchObject({ title: 'Ôn thi cuối kỳ', suggestedGroupId: g.id, groupId: null })
  })

  it('người dùng đổi tên trong lúc chờ → giữ tên của người dùng', async () => {
    setup('{"title":"Tên AI","group":null}')
    const c = convs.create('free')
    organizer.onFirstMessage(c.id, 'xin chào')
    turn(c.id, 'xin chào')
    const run = organizer.afterRun(c.id)
    convs.update({ id: c.id, title: 'Tên của mình' })
    await run
    expect(convs.get(c.id)).toMatchObject({ title: 'Tên của mình', titleSource: 'user' })
  })

  it('trả lời lỗi → chưa gọi; đầu ra hỏng → giữ tiêu đề tạm, không thử lại mãi', async () => {
    setup('không phải json')
    const c = convs.create('free')
    organizer.onFirstMessage(c.id, 'câu hỏi')
    turn(c.id, 'câu hỏi', 'error')
    await organizer.afterRun(c.id)
    expect(ai.calls).toHaveLength(0)
    turn(c.id, 'câu hỏi')
    await organizer.afterRun(c.id)
    expect(convs.get(c.id)).toMatchObject({ title: 'câu hỏi', titleSource: 'fixed' })
  })

  it('tắt cả hai tuỳ chọn → không gọi AI', async () => {
    settings = { aiTitles: false, suggestGroups: false }
    setup('{}')
    groups.create('Unity')
    const c = convs.create('free')
    organizer.onFirstMessage(c.id, 'Unity')
    expect(convs.get(c.id)).toMatchObject({ titleSource: 'fixed', suggestedGroupId: null })
    turn(c.id, 'Unity')
    await organizer.afterRun(c.id)
    expect(ai.calls).toHaveLength(0)
  })

  it('sửa tiêu đề cũ dạng lệnh tạo artifact lúc khởi động (bỏ qua tên người dùng đặt)', () => {
    setup('{}')
    const a = convs.create('free')
    convs.setAutoTitle(a.id, 'Tạo artifact type="doc" title="GDD" cho game', 'fixed')
    const b = convs.create('free')
    convs.update({ id: b.id, title: 'Tạo artifact type="x" title="Y"' })
    expect(organizer.fixLegacyTitles()).toBe(1)
    expect(convs.get(a.id)?.title).toBe('GDD')
    expect(convs.get(b.id)?.title).toBe('Tạo artifact type="x" title="Y"')
  })
})
