import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ASSISTANT, DEFAULT_PROFILE } from '@shared/schemas'
import { openDatabase } from '../../db/client'
import {
  ConversationRepository,
  MemoryRepository,
  MessageRepository,
  SettingsRepository,
  SuggestionRepository
} from '../../db/repositories'
import { AccountScope } from '../accountScope'

const AN = '11111111-1111-4111-8111-111111111111'
const BINH = '22222222-2222-4222-8222-222222222222'

describe('AccountScope — trí nhớ theo tài khoản', () => {
  let handle: ReturnType<typeof openDatabase>
  let scope: AccountScope
  let memories: MemoryRepository
  let suggestions: SuggestionRepository
  let conversations: ConversationRepository
  let messages: MessageRepository
  let settings: SettingsRepository

  beforeEach(() => {
    handle = openDatabase(':memory:', join(__dirname, '..', '..', 'db', 'migrations'))
    settings = new SettingsRepository(handle.db)
    // Repository dùng chung "người hiện tại" của scope — như trong app.
    let current = (): string => 'local'
    memories = new MemoryRepository(handle.db, () => current())
    suggestions = new SuggestionRepository(handle.db, () => current())
    conversations = new ConversationRepository(handle.db, () => current())
    messages = new MessageRepository(handle.db)
    scope = new AccountScope({ memories, conversations, settings })
    current = () => scope.current
  })
  afterEach(() => handle.close())

  it('hai tài khoản trên cùng máy có hồ sơ, trí nhớ, đề xuất riêng', () => {
    scope.set(AN)
    scope.setProfile({ ...DEFAULT_PROFILE, name: 'An', goals: 'Học React' })
    memories.create('An thích ví dụ TypeScript', 'preference')
    suggestions.insertMany([{ conversationId: null, action: 'add', targetMemoryId: null, content: 'An học Rust', category: 'goal' }])

    scope.set(BINH)
    expect(scope.getProfile().name).toBe('')
    expect(memories.list()).toEqual([])
    expect(suggestions.pending()).toEqual([])
    scope.setProfile({ ...DEFAULT_PROFILE, name: 'Bình' })
    const binhMemory = memories.create('Bình thích Python', 'preference')

    scope.set(AN)
    expect(scope.getProfile()).toMatchObject({ name: 'An', goals: 'Học React' })
    expect(memories.list().map((m) => m.content)).toEqual(['An thích ví dụ TypeScript'])
    expect(suggestions.countPending()).toBe(1)
    // Không đọc/sửa/xóa được trí nhớ của người khác dù biết id.
    expect(memories.get(binhMemory.id)).toBeNull()
    memories.remove(binhMemory.id)
    scope.set(BINH)
    expect(memories.list()).toHaveLength(1)
  })

  it('dữ liệu tạo trước khi đăng nhập được giao cho tài khoản ĐẦU TIÊN, chỉ một lần', () => {
    scope.setProfile({ ...DEFAULT_PROFILE, name: 'Người dùng cũ' })
    memories.create('Ghi nhớ cũ', 'other')

    expect(scope.set(AN)).toEqual({ owner: AN, claimed: true })
    expect(scope.getProfile().name).toBe('Người dùng cũ')
    expect(memories.list().map((m) => m.content)).toEqual(['Ghi nhớ cũ'])

    // Tài khoản thứ hai không nhận gì; đăng xuất thì vùng 'local' trống.
    expect(scope.set(BINH)).toEqual({ owner: BINH, claimed: false })
    expect(memories.list()).toEqual([])
    scope.set(null)
    expect(memories.list()).toEqual([])
    expect(scope.getProfile().name).toBe('')
  })

  it('lịch sử chat và cài đặt trợ lý riêng theo tài khoản', () => {
    scope.set(AN)
    const anConv = conversations.create('free')
    conversations.update({ id: anConv.id, title: 'Chat của An' })
    messages.insert({ conversationId: anConv.id, role: 'user', content: 'xin chào' })
    scope.setAssistant({ ...DEFAULT_ASSISTANT, name: 'Mèo', persona: 'humorous' })

    scope.set(BINH)
    expect(conversations.list()).toEqual([])
    expect(conversations.list('xin')).toEqual([])
    expect(scope.getAssistant()).toEqual(DEFAULT_ASSISTANT)
    // Biết id cũng không đọc/sửa/xóa được hội thoại của người khác.
    expect(conversations.get(anConv.id)).toBeNull()
    expect(conversations.update({ id: anConv.id, title: 'đổi' })).toBeNull()
    conversations.remove(anConv.id)

    scope.set(AN)
    expect(conversations.list().map((c) => c.title)).toEqual(['Chat của An'])
    expect(conversations.list('xin')).toHaveLength(1)
    expect(scope.getAssistant()).toMatchObject({ name: 'Mèo', persona: 'humorous' })
  })

  it('lịch sử chat + trợ lý tạo trước khi đăng nhập cũng giao cho tài khoản đầu tiên', () => {
    const old = conversations.create('free')
    scope.setAssistant({ ...DEFAULT_ASSISTANT, name: 'Cũ' })
    expect(scope.set(AN).claimed).toBe(true)
    expect(conversations.list().map((c) => c.id)).toEqual([old.id])
    expect(scope.getAssistant().name).toBe('Cũ')
    scope.set(BINH)
    expect(conversations.list()).toEqual([])
    expect(scope.getAssistant()).toEqual(DEFAULT_ASSISTANT)
  })

  it('máy đã có tài khoản nhận dữ liệu từ bản cũ: trợ lý dùng chung được chuyển cho tài khoản đó', () => {
    settings.set('account.localClaimedBy', AN)
    settings.set('assistant', { ...DEFAULT_ASSISTANT, name: 'Bản cũ' })
    const fresh = new AccountScope({ memories, conversations, settings })
    fresh.set(AN)
    expect(fresh.getAssistant().name).toBe('Bản cũ')
    fresh.set(BINH)
    expect(fresh.getAssistant()).toEqual(DEFAULT_ASSISTANT)
  })

  it('tài khoản đầu tiên không có gì để nhận thì người sau cũng không nhận dữ liệu local mới', () => {
    scope.set(AN)
    scope.set(null)
    memories.create('Tạo khi đã đăng xuất', 'other')
    expect(scope.set(BINH).claimed).toBe(false)
    expect(memories.list()).toEqual([])
  })
})
