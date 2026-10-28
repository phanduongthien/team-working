import { describe, expect, it } from 'vitest'
import { buildPlanPrompt, parsePlan } from '../taskPlan'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('buildPlanPrompt', () => {
  it('liệt kê thành viên kèm id, kỹ năng, giờ việc mở và thông tin dự án', () => {
    const prompt = buildPlanPrompt({
      projectName: 'Website bán hàng',
      description: 'Trang bán áo',
      goal: 'Ra mắt trước Tết',
      dueDate: '2027-01-20',
      today: '2026-10-28',
      instructions: '',
      members: [
        { id: A, name: 'An', skills: ['React', 'CSS'], openHours: 6 },
        { id: B, name: 'Bình', skills: [], openHours: 0 }
      ]
    })
    expect(prompt).toContain(`- id=${A} | An | kỹ năng: React, CSS | đang có 6 giờ việc mở`)
    expect(prompt).toContain('kỹ năng: (chưa khai báo)')
    expect(prompt).toContain('Hạn chót: 2027-01-20')
    expect(prompt).not.toContain('Yêu cầu thêm')
  })
})

describe('parsePlan', () => {
  const wrap = (tasks: unknown[]): string => '```json\n' + JSON.stringify({ type: 'task_plan', tasks }) + '\n```'

  it('giữ task hợp lệ và làm sạch trường lạ', () => {
    const out = parsePlan(
      wrap([
        { title: 'Thiết kế UI', assigneeId: A, priority: 'high', estimateHours: 6.1, dueDate: '2026-11-05', dependsOn: [], reason: 'An giỏi React' },
        { title: 'Viết API', assigneeId: 'nguoi-la', priority: 'cao', estimateHours: -3, dueDate: '5/11' }
      ]),
      [A, B]
    )
    expect(out).toEqual([
      { title: 'Thiết kế UI', description: '', assigneeId: A, priority: 'high', estimateHours: 6, dueDate: '2026-11-05', dependsOn: [], reason: 'An giỏi React' },
      { title: 'Viết API', description: '', assigneeId: null, priority: 'medium', estimateHours: null, dueDate: null, dependsOn: [], reason: '' }
    ])
  })

  it('sai định dạng → null', () => {
    expect(parsePlan('không có json', [A])).toBeNull()
    expect(parsePlan(JSON.stringify({ type: 'task_plan', tasks: [{ title: '' }] }), [A])).toBeNull()
  })
})
