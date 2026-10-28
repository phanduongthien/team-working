import { describe, expect, it } from 'vitest'
import { newIssueUrl, parseGithubRepo, sanitizeLog } from '../release'

describe('parseGithubRepo', () => {
  it('chỉ nhận dạng owner/repo hợp lệ', () => {
    expect(parseGithubRepo('team-working/your-agent')).toEqual({ owner: 'team-working', repo: 'your-agent' })
    expect(parseGithubRepo(' a/b ')).toEqual({ owner: 'a', repo: 'b' })
    for (const bad of [undefined, '', 'your-agent', 'a/b/c', 'a/Your agent', '-a/b', 'a/../b']) {
      expect(parseGithubRepo(bad), String(bad)).toBeNull()
    }
  })
})

describe('newIssueUrl', () => {
  it('dựng link tạo issue có tiêu đề, nội dung, nhãn (đã mã hóa URL)', () => {
    const url = new URL(newIssueUrl({ owner: 'o', repo: 'r' }, { title: 'Lỗi & ý tưởng', body: '## Mô tả\nabc', labels: ['bug', 'from-app'] }))
    expect(url.origin + url.pathname).toBe('https://github.com/o/r/issues/new')
    expect(url.searchParams.get('title')).toBe('Lỗi & ý tưởng')
    expect(url.searchParams.get('body')).toBe('## Mô tả\nabc')
    expect(url.searchParams.get('labels')).toBe('bug,from-app')
  })

  it('cắt nội dung quá dài', () => {
    const url = new URL(newIssueUrl({ owner: 'o', repo: 'r' }, { title: 't', body: 'x'.repeat(20000) }))
    expect(url.searchParams.get('body')!.length).toBeLessThan(6100)
  })
})

describe('sanitizeLog', () => {
  it('che thư mục người dùng và email', () => {
    expect(sanitizeLog('lỗi tại C:\\Users\\LEGION\\AppData\\Roaming\\x.db, gửi a.b@gmail.com')).toBe('lỗi tại %USERPROFILE%\\AppData\\Roaming\\x.db, gửi <email>')
    expect(sanitizeLog('/home/an/.config và /Users/binh/x')).toBe('~/.config và ~/x')
  })
})
