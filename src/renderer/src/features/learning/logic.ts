import type { QuizGrade, QuizQuestion } from '@shared/schemas'

export type StepStatus = 'todo' | 'doing' | 'done'
export const NEXT_STATUS: Record<StepStatus, StepStatus> = { todo: 'doing', doing: 'done', done: 'todo' }

export function stepProgress(steps: { status: string }[]): { done: number; total: number; percent: number } {
  const done = steps.filter((s) => s.status === 'done').length
  return { done, total: steps.length, percent: steps.length ? Math.round((done / steps.length) * 100) : 0 }
}

const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Chấm trắc nghiệm ngay trên máy; câu tự luận trả null (nhờ trợ lý chấm). */
export function gradeLocally(questions: QuizQuestion[], answers: string[]): (boolean | null)[] {
  return questions.map((q, i) => (q.choices.length ? norm(answers[i] ?? '') === norm(q.answer) : null))
}

export type QuestionResult = { correct: boolean; feedback: string }

/** Gộp kết quả máy + trợ lý; câu tự luận trợ lý không chấm được → tính sai (để ôn lại). */
export function mergeResults(local: (boolean | null)[], ai: QuizGrade | null): QuestionResult[] {
  return local.map((value, i) => {
    if (value !== null) return { correct: value, feedback: '' }
    const r = ai?.results.find((x) => x.index === i)
    return { correct: r?.correct ?? false, feedback: r?.feedback ?? '' }
  })
}

export function score(results: QuestionResult[]): number {
  return results.filter((r) => r.correct).length
}
