import { describe, expect, it } from 'vitest'
import { buildCoachPrompt, buildSummaryPrompt, cleanText } from '../prompts'

describe('buildCoachPrompt', () => {
  it('viết feedback ẩn danh: nhắc loại bỏ chi tiết lộ danh tính, giữ bản nháp', () => {
    const p = buildCoachPrompt({
      draft: 'review code chậm quá',
      mode: 'compose',
      kind: 'project',
      visibility: 'anonymous',
      category: 'improve',
      original: '',
      language: 'vi'
    })
    expect(p).toContain('ẨN DANH')
    expect(p).toContain('cần cải thiện')
    expect(p.endsWith('## Bản nháp\nreview code chậm quá')).toBe(true)
    expect(p).not.toContain('## Feedback gốc')
  })

  it('trả lời: kèm feedback gốc', () => {
    const p = buildCoachPrompt({
      draft: 'ok em sửa',
      mode: 'reply',
      kind: 'person',
      visibility: 'private',
      category: 'improve',
      original: 'Cần viết test',
      language: 'en'
    })
    expect(p).toContain('TRẢ LỜI')
    expect(p).toContain('English')
    expect(p).toContain('## Feedback gốc\nCần viết test')
  })
})

describe('buildSummaryPrompt', () => {
  it('liệt kê feedback (không có tên người) kèm trả lời', () => {
    const p = buildSummaryPrompt({
      scope: 'Dự án Website',
      period: '30 ngày qua',
      language: 'vi',
      items: [
        { date: '2026-10-01', kind: 'project', category: 'improve', status: 'open', body: 'Họp\nquá dài', replies: ['Sẽ rút ngắn'] }
      ]
    })
    expect(p).toContain('"Dự án Website" trong kỳ 30 ngày qua')
    expect(p).toContain('1. [2026-10-01] (góp ý về dự án/quy trình, cần cải thiện, trạng thái: open) Họp quá dài\n   Trả lời: Sẽ rút ngắn')
  })
})

describe('cleanText', () => {
  it('bỏ khối code bao ngoài', () => {
    expect(cleanText('```\nXin chào\n```')).toBe('Xin chào')
    expect(cleanText('  văn bản  ')).toBe('văn bản')
  })
})
