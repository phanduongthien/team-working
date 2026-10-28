import { describe, expect, it } from 'vitest'
import type { Memory, Message } from '@shared/types'
import { MAX_TRANSCRIPT_CHARS, buildExtractionPrompt, extractJsonBlock, parseSuggestions } from '../extraction'

const memory = (id: string, content: string): Memory => ({
  id,
  content,
  category: 'goal',
  sourceConversationId: null,
  createdAt: 0,
  updatedAt: 0,
  lastUsedAt: null
})

const msg = (role: 'user' | 'assistant', content: string): Message => ({
  id: content,
  conversationId: 'c',
  role,
  content,
  status: 'done',
  error: null,
  toolEvents: [],
  attachments: [],
  usage: null,
  createdAt: 0
})

const existing = [memory('m1', 'Đang học React'), memory('m2', 'Deadline đồ án 15/12')]

describe('extractJsonBlock', () => {
  it('đọc JSON trong khối ```json và JSON trần có chữ xung quanh', () => {
    expect(extractJsonBlock('Đây:\n```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJsonBlock('ok {"a":2} xong')).toEqual({ a: 2 })
    expect(extractJsonBlock('không có json')).toBeNull()
    expect(extractJsonBlock('{hỏng')).toBeNull()
  })
})

describe('parseSuggestions', () => {
  const wrap = (items: unknown[]): string => JSON.stringify({ type: 'memory_suggestions', items })

  it('giữ add/update/delete hợp lệ, category lạ → other', () => {
    const out = parseSuggestions(
      wrap([
        { action: 'add', content: 'Thích ví dụ bằng Python', category: 'preference' },
        { action: 'update', id: 'm2', content: 'Deadline đồ án dời sang 20/12', category: 'deadline' },
        { action: 'delete', id: 'm1' },
        { action: 'add', content: 'Làm ở công ty X', category: 'job' }
      ]),
      existing
    )
    expect(out).toEqual([
      { action: 'add', targetMemoryId: null, content: 'Thích ví dụ bằng Python', category: 'preference' },
      { action: 'update', targetMemoryId: 'm2', content: 'Deadline đồ án dời sang 20/12', category: 'deadline' },
      { action: 'delete', targetMemoryId: 'm1', content: 'Đang học React', category: 'goal' },
      { action: 'add', targetMemoryId: null, content: 'Làm ở công ty X', category: 'other' }
    ])
  })

  it('bỏ mục trùng memory cũ, trùng nhau, rỗng, hoặc id không tồn tại', () => {
    const out = parseSuggestions(
      wrap([
        { action: 'add', content: '  đang học   react ' },
        { action: 'add', content: 'Mới' },
        { action: 'add', content: 'mới' },
        { action: 'add', content: '' },
        { action: 'update', id: 'khong-co', content: 'x' },
        { action: 'update', id: 'm1', content: 'Đang học React' },
        { action: 'delete' }
      ]),
      existing
    )
    expect(out?.map((s) => s.content)).toEqual(['Mới'])
  })

  it('danh sách rỗng hợp lệ; sai định dạng trả null', () => {
    expect(parseSuggestions(wrap([]), existing)).toEqual([])
    expect(parseSuggestions('{"type":"other"}', existing)).toBeNull()
    expect(parseSuggestions('xin lỗi, tôi không hiểu', existing)).toBeNull()
  })
})

describe('buildExtractionPrompt', () => {
  it('liệt kê memory kèm id và hội thoại theo vai', () => {
    const prompt = buildExtractionPrompt([msg('user', 'Mình học React'), msg('assistant', 'Tuyệt!')], existing)
    expect(prompt).toContain('- id=m1 [goal] Đang học React')
    expect(prompt).toContain('NGƯỜI DÙNG: Mình học React\n\nTRỢ LÝ: Tuyệt!')
  })

  it('giữ phần cuối khi hội thoại quá dài', () => {
    const long = msg('user', 'đầu ' + 'x'.repeat(MAX_TRANSCRIPT_CHARS) + ' CUỐI')
    const prompt = buildExtractionPrompt([long], [])
    expect(prompt).toContain('CUỐI')
    expect(prompt).not.toContain('đầu ')
    expect(prompt).toContain('(chưa có)')
  })
})
