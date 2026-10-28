import { describe, expect, it } from 'vitest'
import type { QuizQuestion } from '@shared/schemas'
import { gradeLocally, mergeResults, score, stepProgress } from '../logic'

const mc = (answer: string): QuizQuestion => ({ q: 'q', choices: ['A', 'B', answer], answer, explain: '' })
const text: QuizQuestion = { q: 'Giải thích', choices: [], answer: 'x', explain: '' }

describe('learning logic', () => {
  it('tiến độ bước học', () => {
    expect(stepProgress([{ status: 'done' }, { status: 'doing' }, { status: 'todo' }, { status: 'done' }])).toEqual({ done: 2, total: 4, percent: 50 })
    expect(stepProgress([]).percent).toBe(0)
  })

  it('chấm trắc nghiệm trên máy (không phân biệt hoa thường/khoảng trắng); tự luận → null', () => {
    expect(gradeLocally([mc('useState'), mc('JSX'), text], [' usestate ', 'A', 'trả lời'])).toEqual([true, false, null])
  })

  it('gộp kết quả: tự luận lấy từ trợ lý, thiếu thì tính sai; tính điểm', () => {
    const results = mergeResults([true, null, null], { results: [{ index: 1, correct: true, feedback: 'đúng ý' }], weakPoints: [] })
    expect(results).toEqual([
      { correct: true, feedback: '' },
      { correct: true, feedback: 'đúng ý' },
      { correct: false, feedback: '' }
    ])
    expect(score(results)).toBe(2)
  })
})
