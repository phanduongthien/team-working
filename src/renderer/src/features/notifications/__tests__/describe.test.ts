import i18next from 'i18next'
import { beforeAll, describe, expect, it } from 'vitest'
import workVi from '../../work/i18n/vi.json'
import vi from '../i18n/vi.json'
import { describeNotification, remindKeys } from '../describe'

const i18n = i18next.createInstance()
beforeAll(async () => {
  await i18n.init({ lng: 'vi', resources: { vi: { notifications: vi, work: workVi } }, interpolation: { escapeValue: false } })
})

const nameOf = (id: string | undefined): string | undefined => (id === 'u1' ? 'An' : undefined)

describe('describeNotification', () => {
  it('giao việc: tiêu đề, nội dung, route mở đúng task', () => {
    const d = describeNotification({ type: 'task_assigned', payload: { task_id: 't1', project_id: 'p1', title: 'Viết API', by: 'u1' } }, i18n.t, nameOf)
    expect(d).toEqual({ title: 'Bạn được giao việc mới', body: 'An giao cho bạn: Viết API', route: '/projects/p1?task=t1' })
  })

  it('đổi trạng thái dịch tên trạng thái; người lạ → "Ai đó"', () => {
    const d = describeNotification({ type: 'task_status', payload: { task_id: 't', project_id: 'p', title: 'X', status: 'review', by: 'zz' } }, i18n.t, nameOf)
    expect(d.title).toBe('Task chuyển sang Review')
    expect(d.body).toBe('Ai đó: X')
  })

  it('bình luận kèm trích đoạn; thiếu task id thì không có route', () => {
    const d = describeNotification({ type: 'task_comment', payload: { title: 'X', excerpt: 'Nhớ thêm test', by: 'u1' } }, i18n.t, nameOf)
    expect(d.body).toBe('An trong “X”: Nhớ thêm test')
    expect(d.route).toBeUndefined()
  })
})

describe('remindKeys', () => {
  it('mỗi task nhắc một lần mỗi ngày', () => {
    expect(remindKeys('2026-10-28', ['a', 'b'], ['2026-10-28:a', '2026-10-27:b'])).toEqual(['2026-10-28:b'])
  })
})
