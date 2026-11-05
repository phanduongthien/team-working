import { describe, expect, it, vi } from 'vitest'
import { chatSendSchema } from '@shared/schemas'

vi.mock('@renderer/lib/api', () => ({ api: {} }))
const { dragHasFiles, pasteKind } = await import('../draft')

const clip = (opts: { text?: string; files?: number; types?: string[] }) => ({
  types: opts.types ?? [],
  files: { length: opts.files ?? 0 } as FileList,
  getData: (type: string) => (type === 'text/plain' ? (opts.text ?? '') : '')
})

describe('pasteKind', () => {
  it('có chữ → dán chữ như cũ, kể cả khi kèm ảnh (vd copy từ Word)', () => {
    expect(pasteKind(clip({ text: 'xin chào', types: ['text/plain'] }))).toBe('text')
    expect(pasteKind(clip({ text: 'đoạn văn', files: 1, types: ['text/plain', 'text/html', 'image/png', 'Files'] }))).toBe('text')
  })
  it('ảnh chụp màn hình / ảnh copy từ trình duyệt (trình duyệt đưa ra File) → gửi nội dung file', () => {
    expect(pasteKind(clip({ files: 1, types: ['Files'] }))).toBe('files')
  })
  it('có ảnh hoặc danh sách file nhưng không có File → main đọc clipboard', () => {
    expect(pasteKind(clip({ types: ['image/png'] }))).toBe('clipboard')
    expect(pasteKind(clip({ types: ['text/uri-list'] }))).toBe('clipboard')
    expect(pasteKind(clip({ types: ['Files'] }))).toBe('clipboard')
  })
  it('clipboard rỗng → để trình duyệt xử lý', () => {
    expect(pasteKind(clip({}))).toBe('text')
  })
})

it('dragHasFiles chỉ nhận kéo thả có file (không phải kéo chữ)', () => {
  expect(dragHasFiles(['Files'])).toBe(true)
  expect(dragHasFiles(['text/plain'])).toBe(false)
})

describe('chatSendSchema', () => {
  const conv = '11111111-2222-4333-8444-555555555555'
  const att = '99999999-2222-4333-8444-555555555555'
  it('gửi được chỉ ảnh, hoặc chỉ chữ; không được gửi tin rỗng', () => {
    expect(chatSendSchema.safeParse({ conversationId: conv, text: '', attachmentIds: [att] }).success).toBe(true)
    expect(chatSendSchema.safeParse({ conversationId: conv, text: 'hi' }).success).toBe(true)
    expect(chatSendSchema.safeParse({ conversationId: conv, text: '   ', attachmentIds: [] }).success).toBe(false)
  })
  it('tối đa 10 file mỗi tin', () => {
    const ids = Array.from({ length: 11 }, (_, i) => `99999999-2222-4333-8444-${String(i).padStart(12, '0')}`)
    expect(chatSendSchema.safeParse({ conversationId: conv, text: 'x', attachmentIds: ids }).success).toBe(false)
  })
})
