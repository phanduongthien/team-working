import { z } from 'zod'
import {
  quizQuestionSchema,
  type DayBlock,
  type DayPlanRequest,
  type LearningPathRequest,
  type PlannedStep,
  type QuizGrade,
  type QuizGradeRequest,
  type QuizQuestion,
  type QuizRequest,
  type ReportRequest
} from '@shared/schemas'
import { extractJsonBlock } from '../memory/extraction'

const LANG = { vi: 'tiếng Việt', en: 'English' } as const
const jsonOnly = 'Chỉ trả về MỘT khối JSON hợp lệ, không thêm lời giải thích.'

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  return dt.toISOString().slice(0, 10)
}

// ---------------- Lộ trình học ----------------

export function buildLearningPathPrompt(req: LearningPathRequest): string {
  return [
    'Lập lộ trình học theo hướng dẫn (khối JSON {"type":"learning_path",...}).',
    jsonOnly,
    `Viết bằng ${LANG[req.language]}. Chia 4–12 bước, mỗi bước có mục tiêu rõ, tài liệu gợi ý (không bịa link; nếu không chắc thì ghi tên tài liệu/chủ đề tìm kiếm).`,
    `Hôm nay: ${req.today}. Thời gian học: khoảng ${req.hoursPerWeek} giờ/tuần.${req.deadline ? ` Cần xong trước: ${req.deadline}.` : ''}`,
    `Mục tiêu: ${req.goal}`,
    req.level ? `Trình độ hiện tại: ${req.level}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

const pathOutput = z.object({
  type: z.literal('learning_path'),
  steps: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000).default(''),
        resources: z.array(z.string().max(500)).default([]),
        // Lỏng kiểu: một trường số sai không được làm hỏng cả lộ trình.
        estimatedHours: z.unknown().optional(),
        dueInDays: z.unknown().optional()
      })
    )
    .min(1)
    .max(30)
})

export function parseLearningPath(text: string, today: string): PlannedStep[] | null {
  const parsed = pathOutput.safeParse(extractJsonBlock(text))
  if (!parsed.success) return null
  return parsed.data.steps.map((s) => ({
    title: s.title,
    description: s.description,
    resources: s.resources.slice(0, 20),
    estimatedHours: typeof s.estimatedHours === 'number' && s.estimatedHours > 0 && s.estimatedHours <= 1000 ? s.estimatedHours : null,
    dueDate: typeof s.dueInDays === 'number' && s.dueInDays >= 0 && s.dueInDays <= 3650 ? addDays(today, Math.round(s.dueInDays)) : null
  }))
}

// ---------------- Quiz ----------------

export function buildQuizPrompt(req: QuizRequest): string {
  return [
    `Tạo quiz ${req.count} câu về "${req.topic}" theo hướng dẫn (khối JSON {"type":"quiz","questions":[...]}).`,
    jsonOnly,
    `Viết bằng ${LANG[req.language]}. Trộn trắc nghiệm (choices 3–5 lựa chọn, answer là ĐÚNG NGUYÊN VĂN một lựa chọn) và tự luận ngắn (choices là mảng rỗng).`,
    'Mỗi câu có explain giải thích ngắn vì sao đúng.',
    req.context.trim() ? `## Nội dung đang học\n${req.context.trim()}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

const quizOutput = z.object({
  type: z.literal('quiz'),
  questions: z.array(
    z.object({
      q: z.string().trim().min(1).max(2000),
      choices: z.array(z.string().max(500)).nullish(),
      answer: z.string().max(2000).default(''),
      explain: z.string().max(3000).default('')
    })
  )
})

/** Làm sạch quiz: trắc nghiệm mà đáp án không nằm trong lựa chọn → đổi thành tự luận. */
export function parseQuiz(text: string): QuizQuestion[] | null {
  const parsed = quizOutput.safeParse(extractJsonBlock(text))
  if (!parsed.success) return null
  const questions = parsed.data.questions.slice(0, 15).map((q) => {
    const choices = (q.choices ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 8)
    const valid = choices.length >= 2 && choices.includes(q.answer.trim())
    return quizQuestionSchema.parse({ q: q.q, choices: valid ? choices : [], answer: q.answer.trim(), explain: q.explain })
  })
  return questions.length ? questions : null
}

export function buildGradePrompt(req: QuizGradeRequest): string {
  const items = req.items
    .map((it, i) =>
      [
        `### Câu ${i}${it.localCorrect === null ? ' (CẦN CHẤM)' : it.localCorrect ? ' (đã đúng)' : ' (đã sai)'}`,
        `Hỏi: ${it.q}`,
        `Đáp án tham khảo: ${it.answer}`,
        `Người học trả lời: ${it.userAnswer || '(bỏ trống)'}`
      ].join('\n')
    )
    .join('\n\n')
  return [
    `Chấm bài quiz về "${req.topic}". Chỉ chấm các câu ghi "CẦN CHẤM": đúng nếu ý chính khớp đáp án (không cần trùng chữ).`,
    `Sau đó nêu 1–5 chỗ yếu cần ôn dựa trên MỌI câu sai. Viết bằng ${LANG[req.language]}.`,
    'Trả về JSON: {"type":"quiz_grade","results":[{"index":0,"correct":true,"feedback":"..."}],"weakPoints":["..."]}',
    jsonOnly,
    '',
    items
  ].join('\n')
}

const gradeOutput = z.object({
  type: z.literal('quiz_grade'),
  results: z.array(z.object({ index: z.number().int(), correct: z.boolean(), feedback: z.string().max(2000).default('') })).default([]),
  weakPoints: z.array(z.string().max(300)).default([])
})

/** Chỉ nhận kết quả cho câu cần chấm (localCorrect null). */
export function parseGrade(text: string, req: QuizGradeRequest): QuizGrade | null {
  const parsed = gradeOutput.safeParse(extractJsonBlock(text))
  if (!parsed.success) return null
  const pending = new Set(req.items.flatMap((it, i) => (it.localCorrect === null ? [i] : [])))
  const results = parsed.data.results.filter((r, idx, all) => pending.has(r.index) && all.findIndex((x) => x.index === r.index) === idx)
  return { results, weakPoints: parsed.data.weakPoints.slice(0, 5) }
}

// ---------------- Kế hoạch ngày & báo cáo ----------------

export function buildDayPlanPrompt(req: DayPlanRequest): string {
  const tasks = req.tasks.length
    ? req.tasks
        .map((t) => `- id=${t.id} | ${t.title}${t.project ? ` (${t.project})` : ''} | ưu tiên ${t.priority} | trạng thái ${t.status} | hạn ${t.dueDate ?? 'không'} | ước lượng ${t.estimateHours ?? '?'} giờ`)
        .join('\n')
    : '(không có task được giao)'
  return [
    'Lập kế hoạch cho phần còn lại của hôm nay theo hướng dẫn (khối JSON {"type":"day_plan","blocks":[...]}).',
    jsonOnly,
    `Hôm nay ${req.today}, bây giờ ${req.now}. Giờ làm việc ${req.workday.start}–${req.workday.end}. Đã làm ${Math.round(req.loggedMinutesToday)} phút hôm nay.`,
    `Chỉ xếp các khối từ bây giờ tới hết giờ làm. taskId phải là một id trong danh sách hoặc null (cho nghỉ/việc khác). note viết bằng ${LANG[req.language]}.`,
    '',
    '## Task được giao',
    tasks
  ].join('\n')
}

const blocksOutput = z.object({
  type: z.literal('day_plan'),
  blocks: z.array(z.object({ start: z.string(), end: z.string(), taskId: z.string().nullish(), note: z.string().max(500).default('') })).max(40)
})

const TIME = /^([01]?\d|2[0-3]):([0-5]\d)$/
const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}
const fmt = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/** Làm sạch kế hoạch: giờ hợp lệ, trong khung giờ làm, taskId có thật, xếp theo giờ, bỏ khối chồng lấn. */
export function parseDayPlan(text: string, req: DayPlanRequest): DayBlock[] | null {
  const parsed = blocksOutput.safeParse(extractJsonBlock(text))
  if (!parsed.success) return null
  const ids = new Set(req.tasks.map((t) => t.id))
  const dayStart = Math.max(minutes(req.workday.start), minutes(req.now))
  const dayEnd = minutes(req.workday.end)
  const blocks = parsed.data.blocks
    .filter((b) => TIME.test(b.start) && TIME.test(b.end))
    .map((b) => ({ s: Math.max(minutes(b.start), dayStart), e: Math.min(minutes(b.end), dayEnd), taskId: b.taskId && ids.has(b.taskId) ? b.taskId : null, note: b.note }))
    .filter((b) => b.e > b.s)
    .sort((a, b) => a.s - b.s)
  const result: DayBlock[] = []
  let cursor = -1
  for (const b of blocks) {
    if (b.s < cursor) continue
    result.push({ start: fmt(b.s), end: fmt(b.e), taskId: b.taskId, note: b.note })
    cursor = b.e
  }
  return result
}

export function buildReportPrompt(req: ReportRequest): string {
  const list = (items: string[]): string => (items.length ? items.map((i) => `- ${i}`).join('\n') : '(không có)')
  const time = req.timeByTask.length ? req.timeByTask.map((t) => `- ${t.title}: ${Math.round(t.minutes)} phút`).join('\n') : '(chưa ghi giờ)'
  return [
    `Viết báo cáo tiến độ ${req.periodType === 'day' ? 'cuối ngày' : 'cuối tuần'} (${req.periodLabel}) theo hướng dẫn: Đã xong / Đang làm / Bị chặn / Kế hoạch tiếp.`,
    `Viết bằng ${LANG[req.language]}, Markdown ngắn gọn để gửi quản lý. Chỉ dùng dữ liệu bên dưới, không bịa thêm việc.`,
    'Chỉ trả về nội dung báo cáo, không lời dẫn.',
    '',
    '## Đã xong',
    list(req.done),
    '## Đang làm',
    list(req.inProgress),
    '## Bị chặn',
    list(req.blocked),
    '## Thời gian đã ghi',
    time,
    req.notes.trim() ? `## Ghi chú của người dùng\n${req.notes.trim()}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}
