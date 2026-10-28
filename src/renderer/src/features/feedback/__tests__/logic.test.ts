import { describe, expect, it } from 'vitest'
import type { FeedbackReplyRow, FeedbackRow } from '@shared/supabase.types'
import { allowedVisibilities, canChangeStatus, filterTab, summaryItems } from '../logic'

let n = 0
const fb = (patch: Partial<FeedbackRow>): FeedbackRow => ({
  id: `f${++n}`,
  team_id: 't',
  kind: 'project',
  visibility: 'public',
  category: 'suggestion',
  project_id: null,
  task_id: null,
  recipient_id: null,
  author_id: 'someone',
  is_mine: false,
  title: '',
  body: `nội dung ${n}`,
  period: null,
  status: 'open',
  created_at: '2026-10-20T10:00:00Z',
  updated_at: '',
  reply_count: 0,
  ...patch
})

describe('allowedVisibilities', () => {
  it('khớp ràng buộc DB', () => {
    expect(allowedVisibilities('project', 'improve')).toEqual(['public', 'anonymous', 'private'])
    expect(allowedVisibilities('person', 'praise')).toEqual(['private', 'public'])
    expect(allowedVisibilities('person', 'improve')).toEqual(['private'])
    expect(allowedVisibilities('review', 'praise')).toEqual(['private'])
  })
})

describe('filterTab', () => {
  const pub = fb({ visibility: 'public' })
  const anon = fb({ visibility: 'anonymous', author_id: null })
  const toMe = fb({ kind: 'person', visibility: 'private', recipient_id: 'me' })
  const mine = fb({ visibility: 'private', is_mine: true })
  const list = [pub, anon, toMe, mine]

  it('bảng chung gồm công khai + ẩn danh; các tab khác lọc theo tôi', () => {
    expect(filterTab(list, 'board', 'me')).toEqual([pub, anon])
    expect(filterTab(list, 'received', 'me')).toEqual([toMe])
    expect(filterTab(list, 'sent', 'me')).toEqual([mine])
    expect(filterTab(list, 'all', 'me')).toEqual(list)
    expect(filterTab(list, 'received', undefined)).toEqual([])
  })
})

describe('canChangeStatus', () => {
  it('người nhận hoặc manager', () => {
    const f = fb({ recipient_id: 'me' })
    expect(canChangeStatus(f, 'me', false)).toBe(true)
    expect(canChangeStatus(f, 'other', false)).toBe(false)
    expect(canChangeStatus(fb({}), 'other', true)).toBe(true)
  })
})

describe('summaryItems', () => {
  it('lọc theo phạm vi + thời gian, kèm trả lời, KHÔNG có tên/ID người', () => {
    const a = fb({ project_id: 'p1', title: 'Họp', body: 'quá dài', created_at: '2026-10-10T00:00:00Z' })
    const b = fb({ project_id: 'p2', created_at: '2026-10-11T00:00:00Z' })
    const old = fb({ project_id: 'p1', created_at: '2026-08-01T00:00:00Z' })
    const reply: FeedbackReplyRow = { id: 'r', feedback_id: a.id, team_id: 't', author_id: 'x', by_feedback_author: false, is_mine: false, body: 'Sẽ rút ngắn', created_at: '' }
    const items = summaryItems([a, b, old], [reply], { type: 'project', id: 'p1' }, '2026-09-28')
    expect(items).toEqual([
      { date: '2026-10-10', kind: 'project', category: 'suggestion', status: 'open', body: 'Họp — quá dài', replies: ['Sẽ rút ngắn'] }
    ])
    expect(JSON.stringify(items)).not.toMatch(/someone|author|recipient/)
  })

  it('phạm vi một người: chỉ feedback gửi cho người đó', () => {
    const toAn = fb({ kind: 'person', recipient_id: 'an', visibility: 'private' })
    expect(summaryItems([toAn, fb({})], [], { type: 'person', id: 'an' }, '2026-01-01')).toHaveLength(1)
  })
})
