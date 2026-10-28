import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { durationSec, formatDuration, sumByDay, sumByTask, toCsv, weekDays, type TimeEntry } from '@shared/timesheet'
import { openDatabase } from '../client'
import { TimeRepository } from '../timeRepository'

const ref = (title: string, taskId: string | null = null) => ({ taskId, projectId: null, title, projectName: taskId ? 'Website' : null })
const at = (h: number, m = 0, day = 28): number => new Date(2026, 9, day, h, m).getTime()

describe('TimeRepository', () => {
  let handle: ReturnType<typeof openDatabase>
  let repo: TimeRepository
  beforeEach(() => {
    handle = openDatabase(':memory:', join(__dirname, '..', 'migrations'))
    repo = new TimeRepository(handle.db)
  })
  afterEach(() => handle.close())

  it('chỉ một bộ bấm giờ chạy: bắt đầu cái mới thì dừng cái cũ', () => {
    repo.start(ref('Viết API', 't1'), 'timer', at(9))
    repo.start(ref('Review', 't2'), 'timer', at(10))
    expect(repo.current()?.title).toBe('Review')
    const all = repo.list(at(0), at(23))
    expect(all.map((e) => [e.title, e.endedAt])).toEqual([
      ['Viết API', at(10)],
      ['Review', null]
    ])
  })

  it('dừng ghi giờ kết thúc; bấm nhầm (< 1 giây) thì bỏ', () => {
    repo.start(ref('A'), 'pomodoro', at(9))
    expect(repo.stop(at(9, 25))?.kind).toBe('pomodoro')
    repo.start(ref('B'), 'timer', at(10))
    expect(repo.stop(at(10) + 500)).toBeNull()
    expect(repo.list(at(0), at(23)).map((e) => e.title)).toEqual(['A'])
  })

  it('nhập tay, sửa, xóa; list lấy entry giao với khoảng thời gian', () => {
    const m = repo.addManual({ ...ref('Họp'), startedAt: at(14), endedAt: at(15), note: 'sprint' })
    repo.addManual({ ...ref('Hôm qua'), startedAt: at(14, 0, 27), endedAt: at(15, 0, 27), note: '' })
    expect(repo.list(at(0), at(23, 59)).map((e) => e.title)).toEqual(['Họp'])
    repo.update(m.id, { title: 'Họp sprint', note: '', startedAt: at(14), endedAt: at(16) })
    expect(durationSec(repo.list(at(0), at(23))[0])).toBe(7200)
    repo.remove(m.id)
    expect(repo.list(at(0), at(23))).toEqual([])
  })
})

describe('timesheet', () => {
  const e = (title: string, start: number, end: number | null, taskId: string | null = null): TimeEntry => ({
    id: title + start,
    taskId,
    projectId: null,
    title,
    projectName: taskId ? 'Website' : null,
    kind: 'timer',
    note: '',
    startedAt: start,
    endedAt: end
  })

  it('gộp theo ngày và theo task', () => {
    const list = [e('API', at(9), at(10), 't1'), e('API', at(13), at(13, 30), 't1'), e('Đọc tài liệu', at(9, 0, 29), at(10, 0, 29))]
    expect(Object.fromEntries(sumByDay(list))).toEqual({ '2026-10-28': 5400, '2026-10-29': 3600 })
    expect(sumByTask(list).map((r) => [r.title, r.seconds])).toEqual([
      ['API', 5400],
      ['Đọc tài liệu', 3600]
    ])
  })

  it('formatDuration và tuần bắt đầu thứ Hai', () => {
    expect(formatDuration(5400)).toBe('1h 30m')
    expect(formatDuration(300)).toBe('5m')
    expect(weekDays(at(12))).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
  })

  it('CSV có BOM, escape dấu phẩy/ngoặc kép, bỏ entry đang chạy', () => {
    const csv = toCsv(
      [e('Sửa lỗi "login", gấp', at(9), at(10, 30), 't1'), e('Đang chạy', at(11), null)],
      { date: 'Ngày', start: 'Bắt đầu', end: 'Kết thúc', hours: 'Giờ', task: 'Việc', project: 'Dự án', kind: 'Loại', note: 'Ghi chú' },
      () => 'Bấm giờ'
    )
    expect(csv.charCodeAt(0)).toBe(0xfeff)
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Ngày,Bắt đầu,Kết thúc,Giờ,Việc,Dự án,Loại,Ghi chú',
      '2026-10-28,09:00,10:30,1.50,"Sửa lỗi ""login"", gấp",Website,Bấm giờ,',
      ''
    ])
  })
})
