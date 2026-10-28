import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent } from '@shared/ai'
import { DEFAULT_AI_SETTINGS } from '@shared/schemas'
import type { MemoryEventPayload } from '@shared/types'
import type { AIProvider, ChatRequest } from '../../ai/AIProvider'
import { openDatabase } from '../../db/client'
import {
  ConversationRepository,
  MemoryRepository,
  MessageRepository,
  SettingsRepository,
  SuggestionRepository
} from '../../db/repositories'
import { MemoryService } from '../memoryService'

const migrations = join(__dirname, '..', '..', 'db', 'migrations')

class ScriptedProvider implements AIProvider {
  readonly id = 'fake'
  readonly stateful = true
  calls: ChatRequest[] = []
  constructor(public reply: string | { error: string }) {}
  async isAvailable(): Promise<{ ok: boolean }> {
    return { ok: true }
  }
  async *chat(req: ChatRequest): AsyncIterable<ChatEvent> {
    this.calls.push(req)
    if (typeof this.reply === 'string') {
      yield { type: 'text', delta: this.reply }
      yield { type: 'done' }
    } else {
      yield { type: 'error', message: this.reply.error }
    }
  }
}

describe('MemoryService', () => {
  let handle: ReturnType<typeof openDatabase>
  let convs: ConversationRepository
  let msgs: MessageRepository
  let mems: MemoryRepository
  let sugg: SuggestionRepository
  let settings: SettingsRepository
  let events: MemoryEventPayload[]
  let provider: ScriptedProvider

  const service = (): MemoryService =>
    new MemoryService({
      conversations: convs,
      messages: msgs,
      memories: mems,
      suggestions: sugg,
      settings,
      getProvider: () => provider,
      loadSkill: async () => '# Memory keeper',
      workspaceDir: 'C:\\ws',
      emit: (e) => events.push(e),
      log: { info: vi.fn(), warn: vi.fn() }
    })

  const reply = (items: unknown[]): string =>
    'Đây là đề xuất:\n```json\n' + JSON.stringify({ type: 'memory_suggestions', items }) + '\n```'

  beforeEach(() => {
    handle = openDatabase(':memory:', migrations)
    convs = new ConversationRepository(handle.db)
    msgs = new MessageRepository(handle.db)
    mems = new MemoryRepository(handle.db)
    sugg = new SuggestionRepository(handle.db)
    settings = new SettingsRepository(handle.db)
    events = []
    provider = new ScriptedProvider(reply([]))
  })
  afterEach(() => handle.close())

  it('trích đề xuất vào hàng chờ, KHÔNG tự lưu memory', async () => {
    const conv = convs.create('free')
    msgs.insert({ conversationId: conv.id, role: 'user', content: 'Mình đang học React, deadline 15/12' })
    msgs.insert({ conversationId: conv.id, role: 'assistant', content: 'Ok!' })
    provider.reply = reply([{ action: 'add', content: 'Đang học React', category: 'goal' }])

    expect(await service().extract(conv.id)).toEqual({ added: 1 })
    expect(mems.list()).toEqual([])
    expect(sugg.pending()).toMatchObject([{ action: 'add', content: 'Đang học React', status: 'pending' }])
    expect(events).toContainEqual({ type: 'suggestions', pending: 1 })

    const call = provider.calls[0]
    expect(call.ephemeral).toBe(true)
    expect(call.systemPrompt).toContain('# Memory keeper')
    expect(call.prompt).toContain('NGƯỜI DÙNG: Mình đang học React')
  })

  it('chỉ đọc tin nhắn mới kể từ lần trích trước', async () => {
    const conv = convs.create('free')
    msgs.insert({ conversationId: conv.id, role: 'user', content: 'tin cũ' })
    const s = service()
    await s.extract(conv.id)
    expect(await s.extract(conv.id)).toEqual({ added: 0 })
    expect(provider.calls).toHaveLength(1)

    await new Promise((r) => setTimeout(r, 2))
    msgs.insert({ conversationId: conv.id, role: 'user', content: 'tin mới' })
    await s.extract(conv.id)
    expect(provider.calls[1].prompt).toContain('tin mới')
    expect(provider.calls[1].prompt).not.toContain('tin cũ')
  })

  it('đầu ra hỏng hoặc lỗi provider → báo lỗi, không đổi mốc trích', async () => {
    const conv = convs.create('free')
    msgs.insert({ conversationId: conv.id, role: 'user', content: 'abc' })
    provider.reply = 'xin lỗi'
    expect(await service().extract(conv.id)).toEqual({ error: 'invalid_output' })
    provider.reply = { error: 'rate_limit' }
    expect(await service().extract(conv.id)).toEqual({ error: 'rate_limit' })
    expect(convs.get(conv.id)?.memoryExtractedAt).toBeNull()
  })

  it('duyệt: add (có sửa nội dung), update, delete, và bỏ qua', () => {
    const old = mems.create('Deadline 15/12', 'deadline')
    const gone = mems.create('Thích Java', 'preference')
    sugg.insertMany([
      { conversationId: null, action: 'add', targetMemoryId: null, content: 'Học React', category: 'goal' },
      { conversationId: null, action: 'update', targetMemoryId: old.id, content: 'Deadline 20/12', category: 'deadline' },
      { conversationId: null, action: 'delete', targetMemoryId: gone.id, content: 'Thích Java', category: 'preference' },
      { conversationId: null, action: 'add', targetMemoryId: null, content: 'Rác', category: 'other' }
    ])
    const [add, update, del, junk] = sugg.pending()
    const s = service()
    s.resolve({ id: add.id, accept: true, content: 'Đang học React 18' })
    s.resolve({ id: update.id, accept: true })
    s.resolve({ id: del.id, accept: true })
    s.resolve({ id: junk.id, accept: false })

    expect(mems.list().map((m) => m.content).sort()).toEqual(['Deadline 20/12', 'Đang học React 18'])
    expect(sugg.pending()).toEqual([])
    expect(() => s.resolve({ id: junk.id, accept: true })).toThrow('suggestion_not_found')
  })

  it('tự đề xuất khi rời hội thoại chỉ khi bật và có ≥2 tin mới của người dùng', async () => {
    const conv = convs.create('free')
    msgs.insert({ conversationId: conv.id, role: 'user', content: 'một' })
    const s = service()
    await s.maybeAutoExtract(conv.id)
    expect(provider.calls).toHaveLength(0)

    msgs.insert({ conversationId: conv.id, role: 'user', content: 'hai' })
    settings.set('ai', { ...DEFAULT_AI_SETTINGS, autoSuggestMemory: false })
    await s.maybeAutoExtract(conv.id)
    expect(provider.calls).toHaveLength(0)

    settings.set('ai', DEFAULT_AI_SETTINGS)
    await s.maybeAutoExtract(conv.id)
    expect(provider.calls).toHaveLength(1)
  })

  it('contextFor trả hồ sơ + memory liên quan và đánh dấu đã dùng', () => {
    const m = mems.create('Đang học React', 'goal')
    service().setProfile({ name: 'An', role: '', goals: '', skills: '', interests: '', answerStyle: 'ngắn gọn' })
    const ctx = service().contextFor('react hooks là gì')
    expect(ctx.user).toMatchObject({ name: 'An', answerStyle: 'ngắn gọn' })
    expect(ctx.memories).toEqual(['Đang học React'])
    expect(mems.get(m.id)?.lastUsedAt).not.toBeNull()
  })
})
