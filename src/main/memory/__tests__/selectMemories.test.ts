import { describe, expect, it } from 'vitest'
import type { MemoryCategory } from '@shared/schemas'
import type { Memory } from '@shared/types'
import { selectMemories, tokenize } from '../selectMemories'

const NOW = Date.UTC(2026, 9, 28)
const DAY = 86_400_000

const mem = (id: string, content: string, category: MemoryCategory = 'other', ageDays = 10): Memory => ({
  id,
  content,
  category,
  sourceConversationId: null,
  createdAt: NOW - ageDays * DAY,
  updatedAt: NOW - ageDays * DAY,
  lastUsedAt: null
})

describe('tokenize', () => {
  it('bỏ dấu tiếng Việt (kể cả đ), viết thường, bỏ từ dừng', () => {
    expect(tokenize('Đang học ReactJS và Đồ án')).toEqual(['hoc', 'reactjs', 'do', 'an'])
  })
})

describe('selectMemories', () => {
  const list = [
    mem('react', 'Đang học React để làm đồ án', 'goal', 20),
    mem('cat', 'Nuôi một con mèo tên Mướp', 'other', 1),
    mem('style', 'Thích câu trả lời ngắn gọn, có ví dụ', 'preference', 60),
    mem('deadline', 'Deadline đồ án ngày 15/12', 'deadline', 10)
  ]

  it('ưu tiên memory khớp từ khóa, không phân biệt dấu', () => {
    const picked = selectMemories(list, 'giup minh on lai react cho do an', { now: NOW })
    expect(picked.slice(0, 2).map((m) => m.id)).toEqual(['react', 'deadline'])
  })

  it('không khớp từ khóa thì ưu tiên sở thích trả lời và mục tiêu', () => {
    const picked = selectMemories(list, 'xin chào', { now: NOW, limit: 2 })
    expect(picked.map((m) => m.id)).toEqual(['style', 'react'])
  })

  it('memory mới hơn thắng khi điểm khác ngang nhau', () => {
    const a = mem('old', 'ghi chú A', 'other', 25)
    const b = mem('new', 'ghi chú B', 'other', 1)
    expect(selectMemories([a, b], 'xyz', { now: NOW })[0].id).toBe('new')
  })

  it('tôn trọng limit và tổng số ký tự', () => {
    const many = Array.from({ length: 50 }, (_, i) => mem(`m${i}`, `memory số ${i} ${'x'.repeat(90)}`))
    expect(selectMemories(many, 'abc', { now: NOW })).toHaveLength(15)
    const byChars = selectMemories(many, 'abc', { now: NOW, maxChars: 350 })
    expect(byChars.reduce((n, m) => n + m.content.length, 0)).toBeLessThanOrEqual(350)
    expect(byChars.length).toBe(3)
  })

  it('danh sách rỗng trả rỗng', () => {
    expect(selectMemories([], 'gì cũng được', { now: NOW })).toEqual([])
  })
})
