import { describe, expect, it } from 'vitest'
import { fixRawTitle, organizePrompt, parseOrganize, shorten, suggestByKeywords, titleFromPrompt } from '../organize'

const group = (id: string, name: string, titles: string[] = []) => ({ id, name, collapsed: false, createdAt: 0, titles })

describe('titleFromPrompt', () => {
  it('lời nhắn mẫu artifact → lấy tên artifact, không hiện chữ thô', () => {
    expect(titleFromPrompt('Tạo artifact type="doc" title="Tài liệu thiết kế game (GDD)" cho game của mình: …')).toBe(
      'Tài liệu thiết kế game (GDD)'
    )
    expect(titleFromPrompt("Tạo artifact type='sheet' title='Bảng cân bằng chỉ số'")).toBe('Bảng cân bằng chỉ số')
  })

  it('bỏ Markdown / khối code, lấy dòng có nội dung đầu tiên', () => {
    expect(titleFromPrompt('\n\n## Lỗi **NullReference** trong `Player.cs`\nchi tiết…')).toBe('Lỗi NullReference trong Player.cs')
    expect(titleFromPrompt('```cs\nvar x = 1;\n```\nSao code này lỗi?')).toBe('Sao code này lỗi?')
  })

  it('cắt ở ranh giới từ, tối đa 60 ký tự', () => {
    const t = titleFromPrompt('mình muốn học cách làm hệ thống túi đồ trong Unity cho game nhập vai góc nhìn thứ ba')
    expect(t.length).toBeLessThanOrEqual(60)
    expect(t.endsWith('…')).toBe(true)
    expect(t).not.toMatch(/\s…$/)
    expect(shorten('a'.repeat(100))).toHaveLength(60)
  })
})

describe('fixRawTitle', () => {
  it('sửa tiêu đề cũ (kể cả đã bị cắt mất dấu đóng)', () => {
    expect(fixRawTitle('Tạo artifact type="doc" title="Tài liệu thiết kế game (GDD)" cho game của m…')).toBe(
      'Tài liệu thiết kế game (GDD)'
    )
    expect(fixRawTitle('Tạo artifact type="slides" title="Pitch deck cho nhà đầu tư và…')).toBe(
      'Pitch deck cho nhà đầu tư và'
    )
    expect(fixRawTitle('Học Unity')).toBeNull()
  })
})

describe('suggestByKeywords', () => {
  const groups = [
    group('u', 'Unity', ['Sửa lỗi va chạm Rigidbody', 'Shader nước']),
    group('h', 'Học', ['Ôn thi toán']),
    group('t', 'Tâm sự')
  ]

  it('tên nhóm xuất hiện trong tin (không dấu, không hoa thường)', () => {
    expect(suggestByKeywords('Trong unity làm sao để nhân vật nhảy?', groups)).toBe('u')
    expect(suggestByKeywords('Mình muốn tâm sự chút', groups)).toBe('t')
    expect(suggestByKeywords('mình muốn tam su', groups)).toBe('t')
  })

  it('từ trùng tiêu đề cuộc cũ trong nhóm', () => {
    expect(suggestByKeywords('Sửa lỗi Rigidbody rơi xuyên sàn khi va chạm', groups)).toBe('u')
  })

  it('không đủ điểm hoặc hoà → không gợi ý', () => {
    expect(suggestByKeywords('Hôm nay trời đẹp', groups)).toBeNull()
    expect(suggestByKeywords('học unity', groups)).toBeNull()
    expect(suggestByKeywords('bất kỳ', [])).toBeNull()
  })
})

describe('parseOrganize', () => {
  const groups = [group('u', 'Unity'), group('h', 'Học')]

  it('đọc tiêu đề + nhóm khớp tên (không dấu)', () => {
    expect(parseOrganize('```json\n{"title": "Nhân vật nhảy trong Unity.", "group": "unity"}\n```', groups)).toEqual({
      title: 'Nhân vật nhảy trong Unity',
      groupId: 'u'
    })
    expect(parseOrganize('{"title":"Ôn thi","group":"hoc"}', groups)?.groupId).toBe('h')
  })

  it('nhóm lạ / null → không gợi ý; JSON hỏng → null', () => {
    expect(parseOrganize('{"title":"X","group":"Nấu ăn"}', groups)).toEqual({ title: 'X', groupId: null })
    expect(parseOrganize('{"title":"X","group":null}', groups)?.groupId).toBeNull()
    expect(parseOrganize('không có json', groups)).toBeNull()
    expect(parseOrganize('{title: X}', groups)).toBeNull()
  })

  it('prompt chỉ gửi danh sách nhóm khi cần chọn nhóm', () => {
    expect(organizePrompt({ user: 'a', reply: 'b', groups: ['Unity'] })).toContain('"Unity"')
    expect(organizePrompt({ user: 'a', reply: 'b', groups: null })).toContain('"group": null')
  })
})
