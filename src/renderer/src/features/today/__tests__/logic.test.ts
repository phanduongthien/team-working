import { describe, expect, it } from 'vitest'
import type { TaskRow } from '@shared/supabase.types'
import type { TimeEntry } from '@shared/timesheet'
import { blocksStartingNow, buildReportRequest, periodRange } from '../logic'

const NOW = new Date(2026, 9, 28, 17, 0).getTime() // thứ Tư 28/10/2026
let n = 0
const task = (patch: Partial<TaskRow>): TaskRow => ({
  id: `t${++n}`, team_id: 't', project_id: 'p', parent_id: null, title: `Task ${n}`, description: '', assignee_id: 'me', assigner_id: 'm',
  priority: 'medium', status: 'todo', due_date: null, estimate_hours: null, position: 0, ai_generated: false, completed_at: null,
  created_at: '', updated_at: '', ...patch
})

describe('periodRange', () => {
  it('ngày và tuần (thứ Hai → Chủ nhật)', () => {
    expect(periodRange('day', NOW)).toEqual({ from: new Date(2026, 9, 28).getTime(), to: new Date(2026, 9, 29).getTime() })
    expect(periodRange('week', NOW)).toEqual({ from: new Date(2026, 9, 26).getTime(), to: new Date(2026, 10, 2).getTime() })
  })
})

describe('buildReportRequest', () => {
  it('phân loại task theo kỳ và gộp giờ đã ghi', () => {
    const entries: TimeEntry[] = [
      { id: 'e1', taskId: 'x', projectId: null, title: 'Viết API', projectName: null, kind: 'timer', note: '', startedAt: NOW - 3600_000, endedAt: NOW - 1800_000 }
    ]
    const req = buildReportRequest({
      period: 'day',
      periodLabel: '28/10/2026',
      language: 'vi',
      notes: 'Mai họp',
      now: NOW,
      entries,
      tasks: [
        task({ title: 'Xong hôm nay', status: 'done', completed_at: new Date(2026, 9, 28, 10).toISOString() }),
        task({ title: 'Xong hôm qua', status: 'done', completed_at: new Date(2026, 9, 27, 10).toISOString() }),
        task({ title: 'Đang code', status: 'in_progress' }),
        task({ title: 'Chờ review', status: 'review' }),
        task({ title: 'Kẹt', status: 'blocked' }),
        task({ title: 'Chưa làm', status: 'todo' })
      ]
    })
    expect(req).toMatchObject({
      done: ['Xong hôm nay'],
      inProgress: ['Đang code', 'Chờ review'],
      blocked: ['Kẹt'],
      timeByTask: [{ title: 'Viết API', minutes: 30 }],
      notes: 'Mai họp'
    })
  })
})

describe('blocksStartingNow', () => {
  it('chỉ khối bắt đầu đúng phút và chưa nhắc', () => {
    const blocks = [
      { start: '09:00', end: '10:00', taskId: null, note: 'a' },
      { start: '10:00', end: '11:00', taskId: null, note: 'b' }
    ]
    expect(blocksStartingNow(blocks, '10:00', new Set())).toEqual([blocks[1]])
    expect(blocksStartingNow(blocks, '10:00', new Set(['10:00']))).toEqual([])
  })
})
