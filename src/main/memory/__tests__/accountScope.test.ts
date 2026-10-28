import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_PROFILE } from '@shared/schemas'
import { openDatabase } from '../../db/client'
import { MemoryRepository, SettingsRepository, SuggestionRepository } from '../../db/repositories'
import { AccountScope } from '../accountScope'

const AN = '11111111-1111-4111-8111-111111111111'
const BINH = '22222222-2222-4222-8222-222222222222'

describe('AccountScope — trí nhớ theo tài khoản', () => {
  let handle: ReturnType<typeof openDatabase>
  let scope: AccountScope
  let memories: MemoryRepository
  let suggestions: SuggestionRepository
  let settings: SettingsRepository

  beforeEach(() => {
    handle = openDatabase(':memory:', join(__dirname, '..', '..', 'db', 'migrations'))
    settings = new SettingsRepository(handle.db)
    // Repository dùng chung "người hiện tại" của scope — như trong app.
    let current = (): string => 'local'
    memories = new MemoryRepository(handle.db, () => current())
    suggestions = new SuggestionRepository(handle.db, () => current())
    scope = new AccountScope({ memories, settings })
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

  it('tài khoản đầu tiên không có gì để nhận thì người sau cũng không nhận dữ liệu local mới', () => {
    scope.set(AN)
    scope.set(null)
    memories.create('Tạo khi đã đăng xuất', 'other')
    expect(scope.set(BINH).claimed).toBe(false)
    expect(memories.list()).toEqual([])
  })
})
