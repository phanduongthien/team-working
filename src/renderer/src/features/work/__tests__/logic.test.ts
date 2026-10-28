import { describe, expect, it } from 'vitest'
import type { TaskRow, TaskStatusEventRow } from '@shared/supabase.types'
import {
  addDays,
  burndown,
  dueSoon,
  groupByStatus,
  isOverdue,
  monthGrid,
  positionForDrop,
  progressBy,
  progressOf,
  sortTasks
} from '../logic'

let n = 0
const task = (patch: Partial<TaskRow>): TaskRow => ({
  id: `t${++n}`,
  team_id: 'team',
  project_id: 'p1',
  parent_id: null,
  title: `Task ${n}`,
  description: '',
  assignee_id: null,
  assigner_id: 'm',
  priority: 'medium',
  status: 'todo',
  due_date: null,
  estimate_hours: null,
  position: n * 1000,
  ai_generated: false,
  completed_at: null,
  created_at: `2026-10-0${(n % 9) + 1}T00:00:00Z`,
  updated_at: '',
  ...patch
})

describe('ngày', () => {
  it('addDays qua tháng/năm', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('monthGrid bắt đầu thứ Hai, đủ các tuần của tháng', () => {
    const grid = monthGrid(2026, 9) // tháng 10/2026: 1/10 là thứ Năm
    expect(grid[0]).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(grid.at(-1)).toContain('2026-10-31')
    expect(grid.every((w) => w.length === 7)).toBe(true)
    expect(grid).toHaveLength(5)
  })
})

describe('Kanban', () => {
  it('groupByStatus bỏ subtask, xếp theo position', () => {
    const a = task({ status: 'todo', position: 2000 })
    const b = task({ status: 'todo', position: 1000 })
    const sub = task({ status: 'todo', parent_id: a.id })
    const c = task({ status: 'done' })
    const g = groupByStatus([a, b, sub, c])
    expect(g.todo.map((t) => t.id)).toEqual([b.id, a.id])
    expect(g.done).toEqual([c])
    expect(g.blocked).toEqual([])
  })

  it('positionForDrop: cột rỗng, cuối cột, đầu cột, giữa hai task', () => {
    const col = [task({ position: 1000 }), task({ position: 2000 })]
    expect(positionForDrop([], null)).toBe(1000)
    expect(positionForDrop(col, null)).toBe(3000)
    expect(positionForDrop(col, col[0].id)).toBe(0)
    expect(positionForDrop(col, col[1].id)).toBe(1500)
  })

  it('sortTasks theo hạn (không hạn xuống cuối) rồi ưu tiên', () => {
    const a = task({ due_date: '2026-11-02', priority: 'low' })
    const b = task({ due_date: null, priority: 'urgent' })
    const c = task({ due_date: '2026-11-02', priority: 'urgent' })
    expect(sortTasks([a, b, c], 'due').map((t) => t.id)).toEqual([c.id, a.id, b.id])
    expect(sortTasks([a, b, c], 'priority').map((t) => t.id)).toEqual([c.id, b.id, a.id])
  })
})

describe('nhắc hạn & trễ hạn', () => {
  it('isOverdue chỉ với task chưa xong, quá hạn', () => {
    expect(isOverdue(task({ due_date: '2026-10-27' }), '2026-10-28')).toBe(true)
    expect(isOverdue(task({ due_date: '2026-10-27', status: 'done' }), '2026-10-28')).toBe(false)
    expect(isOverdue(task({ due_date: '2026-10-28' }), '2026-10-28')).toBe(false)
  })

  it('dueSoon: task của tôi hạn hôm nay/ngày mai', () => {
    const mine = task({ assignee_id: 'me', due_date: '2026-10-29' })
    const today = task({ assignee_id: 'me', due_date: '2026-10-28' })
    const later = task({ assignee_id: 'me', due_date: '2026-10-30' })
    const done = task({ assignee_id: 'me', due_date: '2026-10-28', status: 'done' })
    const other = task({ assignee_id: 'you', due_date: '2026-10-28' })
    expect(dueSoon([mine, today, later, done, other], 'me', '2026-10-28').map((t) => t.id)).toEqual([mine.id, today.id])
  })
})

describe('dashboard', () => {
  it('progressOf: %, trễ hạn, giờ còn mở', () => {
    const p = progressOf(
      [task({ status: 'done', estimate_hours: 3 }), task({ estimate_hours: 4, due_date: '2026-10-01' }), task({ estimate_hours: 2 }), task({})],
      '2026-10-28'
    )
    expect(p).toEqual({ total: 4, done: 1, percent: 25, overdue: 1, openHours: 6 })
    expect(progressOf([], '2026-10-28').percent).toBe(0)
  })

  it('progressBy người được giao, bỏ task chưa giao', () => {
    const map = progressBy([task({ assignee_id: 'a', status: 'done' }), task({ assignee_id: 'a' }), task({})], 'assignee_id', '2026-10-28')
    expect([...map.keys()]).toEqual(['a'])
    expect(map.get('a')?.percent).toBe(50)
  })

  it('burndown từ lịch sử trạng thái + đường lý tưởng', () => {
    const ev = (id: number, task_id: string, to: TaskStatusEventRow['to_status'], at: string): TaskStatusEventRow => ({
      id,
      task_id,
      team_id: 'team',
      project_id: 'p1',
      from_status: null,
      to_status: to,
      changed_by: null,
      at
    })
    const points = burndown(
      [
        ev(1, 'a', 'todo', '2026-10-01T09:00:00'),
        ev(2, 'b', 'todo', '2026-10-01T09:00:00'),
        ev(3, 'a', 'done', '2026-10-02T10:00:00'),
        ev(4, 'c', 'todo', '2026-10-03T08:00:00'),
        ev(5, 'b', 'done', '2026-10-03T18:00:00')
      ],
      '2026-10-01',
      '2026-10-03'
    )
    expect(points).toEqual([
      { date: '2026-10-01', remaining: 2, ideal: 2 },
      { date: '2026-10-02', remaining: 1, ideal: 1 },
      { date: '2026-10-03', remaining: 1, ideal: 0 }
    ])
  })
})
