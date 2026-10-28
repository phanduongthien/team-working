import { describe, expect, it } from 'vitest'
import { buildIssuePrompt, parseIssue } from '../issue'

describe('issue-writer', () => {
  it('prompt chứa nội dung người dùng, bỏ tiêu đề trống', () => {
    const p = buildIssuePrompt({ title: '', description: 'Muốn có chế độ tối cho lịch', kind: 'idea', language: 'vi' })
    expect(p).toContain('ý tưởng tính năng')
    expect(p).not.toContain('Tiêu đề người dùng đặt')
    expect(p.endsWith('Muốn có chế độ tối cho lịch')).toBe(true)
  })

  it('parse: bỏ nhãn lạ, thêm nhãn mặc định, bỏ dấu chấm cuối tiêu đề', () => {
    const draft = parseIssue(
      '```json\n' + JSON.stringify({ type: 'issue', title: 'Thêm chế độ tối cho lịch.', body: '## Vấn đề\n...', labels: ['ui', 'urgent'] }) + '\n```',
      'idea'
    )
    expect(draft).toEqual({ title: 'Thêm chế độ tối cho lịch', body: '## Vấn đề\n...', labels: ['enhancement', 'ui'] })
    expect(parseIssue('không phải json', 'bug')).toBeNull()
  })
})
