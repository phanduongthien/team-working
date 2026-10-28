import { describe, expect, it } from 'vitest'
import type { DayPlanRequest, QuizGradeRequest } from '@shared/schemas'
import { buildDayPlanPrompt, buildGradePrompt, buildReportPrompt, parseDayPlan, parseGrade, parseLearningPath, parseQuiz } from '../study'

const json = (obj: unknown): string => '```json\n' + JSON.stringify(obj) + '\n```'

describe('parseLearningPath', () => {
  it('đổi dueInDays → ngày; giờ ước lượng lạ → null', () => {
    const steps = parseLearningPath(
      json({ type: 'learning_path', goal: 'React', steps: [
        { title: 'JSX', description: 'cơ bản', resources: ['react.dev'], estimatedHours: 4, dueInDays: 7 },
        { title: 'Hooks', estimatedHours: -1, dueInDays: 'mai' }
      ] }),
      '2026-10-28'
    )
    expect(steps).toEqual([
      { title: 'JSX', description: 'cơ bản', resources: ['react.dev'], estimatedHours: 4, dueDate: '2026-11-04' },
      { title: 'Hooks', description: '', resources: [], estimatedHours: null, dueDate: null }
    ])
    expect(parseLearningPath('không có', '2026-10-28')).toBeNull()
  })
})

describe('parseQuiz', () => {
  it('trắc nghiệm có đáp án ngoài lựa chọn → chuyển thành tự luận', () => {
    const q = parseQuiz(json({ type: 'quiz', questions: [
      { q: '1+1?', choices: ['1', '2', '3'], answer: '2', explain: 'cộng' },
      { q: 'useState trả về gì?', choices: ['a', 'b'], answer: 'một cặp [state, setState]', explain: '' },
      { q: 'Giải thích JSX', answer: 'cú pháp giống HTML', explain: '' }
    ] }))
    expect(q?.map((x) => x.choices.length)).toEqual([3, 0, 0])
    expect(parseQuiz(json({ type: 'quiz', questions: [] }))).toBeNull()
  })
})

describe('chấm quiz', () => {
  const req: QuizGradeRequest = {
    topic: 'React',
    language: 'vi',
    items: [
      { q: '1+1?', choices: ['1', '2'], answer: '2', explain: '', userAnswer: '1', localCorrect: false },
      { q: 'JSX là gì?', choices: [], answer: 'cú pháp', explain: '', userAnswer: 'cú pháp giống HTML', localCorrect: null }
    ]
  }

  it('prompt đánh dấu câu cần chấm', () => {
    const p = buildGradePrompt(req)
    expect(p).toContain('### Câu 0 (đã sai)')
    expect(p).toContain('### Câu 1 (CẦN CHẤM)')
  })

  it('chỉ nhận kết quả của câu cần chấm, bỏ trùng; tối đa 5 chỗ yếu', () => {
    const g = parseGrade(
      json({ type: 'quiz_grade', results: [
        { index: 0, correct: true, feedback: 'không được ghi đè trắc nghiệm' },
        { index: 1, correct: true, feedback: 'đúng ý' },
        { index: 1, correct: false, feedback: 'trùng' }
      ], weakPoints: ['a', 'b', 'c', 'd', 'e', 'f'] }),
      req
    )
    expect(g).toEqual({ results: [{ index: 1, correct: true, feedback: 'đúng ý' }], weakPoints: ['a', 'b', 'c', 'd', 'e'] })
  })
})

describe('kế hoạch ngày', () => {
  const req: DayPlanRequest = {
    today: '2026-10-28',
    now: '10:15',
    workday: { start: '09:00', end: '17:30' },
    loggedMinutesToday: 60,
    language: 'vi',
    tasks: [{ id: 't1', title: 'Viết API', project: 'Web', priority: 'high', status: 'todo', dueDate: '2026-10-29', estimateHours: 3 }]
  }

  it('prompt có task kèm id và khung giờ', () => {
    const p = buildDayPlanPrompt(req)
    expect(p).toContain('- id=t1 | Viết API (Web) | ưu tiên high')
    expect(p).toContain('bây giờ 10:15')
  })

  it('cắt theo khung giờ, bỏ taskId lạ, bỏ khối chồng lấn, sắp theo giờ', () => {
    const blocks = parseDayPlan(
      json({ type: 'day_plan', blocks: [
        { start: '13:00', end: '15:00', taskId: 't1', note: 'Viết API' },
        { start: '09:00', end: '11:00', taskId: 'lạ', note: 'sáng' },
        { start: '14:00', end: '14:30', taskId: null, note: 'chồng lấn' },
        { start: '17:00', end: '18:30', taskId: null, note: 'tổng kết' },
        { start: '25:00', end: '26:00', taskId: null, note: 'sai giờ' }
      ] }),
      req
    )
    expect(blocks).toEqual([
      { start: '10:15', end: '11:00', taskId: null, note: 'sáng' },
      { start: '13:00', end: '15:00', taskId: 't1', note: 'Viết API' },
      { start: '17:00', end: '17:30', taskId: null, note: 'tổng kết' }
    ])
  })
})

describe('báo cáo', () => {
  it('liệt kê dữ liệu thật, không có thì ghi (không có)', () => {
    const p = buildReportPrompt({ periodType: 'week', periodLabel: 'Tuần 44', language: 'vi', done: ['API'], inProgress: [], blocked: [], timeByTask: [{ title: 'API', minutes: 90 }], notes: '' })
    expect(p).toContain('cuối tuần (Tuần 44)')
    expect(p).toContain('## Đã xong\n- API')
    expect(p).toContain('## Đang làm\n(không có)')
    expect(p).toContain('- API: 90 phút')
  })
})
