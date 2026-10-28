import { describe, expect, it } from 'vitest'
import { composeIssueBody, kindFromParam, manualDraft } from '../logic'

const headings = { env: 'Environment', log: 'Recent log' }

describe('ideas logic', () => {
  it('manualDraft giữ nội dung và gắn nhãn theo loại', () => {
    expect(manualDraft('idea', ' Dark mode ', ' please ')).toEqual({ title: 'Dark mode', body: 'please', labels: ['enhancement'] })
    expect(manualDraft('bug', 'Crash', 'x').labels).toEqual(['bug'])
  })

  it('composeIssueBody không đổi gì khi không đính kèm', () => {
    expect(composeIssueBody(' body \n', null, headings)).toBe('body')
  })

  it('composeIssueBody thêm môi trường và log trong khối code', () => {
    const out = composeIssueBody('Steps', { version: '0.1.0', os: 'Windows 10.0 (x64)', logTail: 'line1\nline2' }, headings)
    expect(out).toContain('### Environment\n- Team Working 0.1.0\n- Windows 10.0 (x64)')
    expect(out).toContain('### Recent log\n```\nline1\nline2\n```')
  })

  it('composeIssueBody bỏ mục log khi log trống', () => {
    const out = composeIssueBody('Steps', { version: '0.1.0', os: 'Win', logTail: '  ' }, headings)
    expect(out).not.toContain('Recent log')
  })

  it('kindFromParam mặc định là idea', () => {
    expect(kindFromParam('bug')).toBe('bug')
    expect(kindFromParam(null)).toBe('idea')
    expect(kindFromParam('xyz')).toBe('idea')
  })
})
