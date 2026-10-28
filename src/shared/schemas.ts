import { z } from 'zod'
import { CHAT_MODES } from './ai'

export const chatModeSchema = z.enum(CHAT_MODES)

export const idSchema = z.uuid()

export const conversationListSchema = z.object({
  query: z.string().trim().max(200).optional()
})

export const conversationCreateSchema = z.object({
  mode: chatModeSchema.default('free')
})

export const conversationUpdateSchema = z.object({
  id: idSchema,
  title: z.string().trim().min(1).max(120).optional(),
  pinned: z.boolean().optional(),
  mode: chatModeSchema.optional()
})

export const MAX_ATTACHMENTS = 5

export const chatSendSchema = z.object({
  conversationId: idSchema,
  text: z.string().trim().min(1).max(100_000),
  /** ID file đã chọn qua hộp thoại của main — renderer không bao giờ gửi đường dẫn. */
  attachmentIds: z.array(idSchema).max(MAX_ATTACHMENTS).default([])
})

export const chatAbortSchema = z.object({
  requestId: idSchema
})

export const PERSONAS = ['friendly', 'serious', 'humorous', 'concise', 'custom'] as const
export const LANGUAGES = ['vi', 'en'] as const
export const THEMES = ['system', 'light', 'dark'] as const
export const ACCENTS = ['blue', 'violet', 'green', 'orange', 'rose'] as const

/** Avatar: emoji chọn sẵn hoặc ảnh upload dạng data URL (giới hạn ~256KB). */
export const avatarSchema = z.union([
  z.string().min(1).max(16),
  z
    .string()
    .max(350_000)
    .regex(/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/)
])

export const assistantProfileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  avatar: avatarSchema,
  persona: z.enum(PERSONAS),
  customPersona: z.string().trim().max(500),
  language: z.enum(LANGUAGES)
})

export const appearanceSchema = z.object({
  theme: z.enum(THEMES),
  accent: z.enum(ACCENTS)
})

export const externalUrlSchema = z.url({ protocol: /^https?$/ })

// ---- Trí nhớ ----

export const MEMORY_CATEGORIES = ['goal', 'skill', 'preference', 'project', 'deadline', 'other'] as const
export const MEMORY_ACTIONS = ['add', 'update', 'delete'] as const
export const SUGGESTION_STATUSES = ['pending', 'accepted', 'rejected'] as const

export const memoryCategorySchema = z.enum(MEMORY_CATEGORIES)
export const memoryContentSchema = z.string().trim().min(1).max(500)

export const memoryCreateSchema = z.object({
  content: memoryContentSchema,
  category: memoryCategorySchema
})

export const memoryUpdateSchema = z.object({
  id: idSchema,
  content: memoryContentSchema,
  category: memoryCategorySchema
})

/** Người dùng duyệt đề xuất; có thể sửa nội dung/loại trước khi chấp nhận. */
export const suggestionResolveSchema = z.object({
  id: idSchema,
  accept: z.boolean(),
  content: memoryContentSchema.optional(),
  category: memoryCategorySchema.optional()
})

/** Định dạng JSON mà skill memory-keeper trả về. */
export const memorySuggestionsOutputSchema = z.object({
  type: z.literal('memory_suggestions'),
  items: z
    .array(
      z.object({
        action: z.enum(MEMORY_ACTIONS),
        id: z.string().optional(),
        content: z.string().trim().max(500).default(''),
        category: z.string().optional()
      })
    )
    .max(20)
})

export const userProfileSchema = z.object({
  name: z.string().trim().max(80),
  role: z.string().trim().max(120),
  goals: z.string().trim().max(1000),
  skills: z.string().trim().max(1000),
  interests: z.string().trim().max(500),
  answerStyle: z.string().trim().max(500)
})

export const DEFAULT_PROFILE: UserProfile = {
  name: '',
  role: '',
  goals: '',
  skills: '',
  interests: '',
  answerStyle: ''
}

// ---- Team: trợ lý chia việc ----

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const
export const TASK_STATUSES = ['todo', 'in_progress', 'review', 'done', 'blocked'] as const
export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'done', 'archived'] as const
export const TEAM_ROLES = ['owner', 'manager', 'member'] as const

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const planRequestSchema = z.object({
  projectName: z.string().trim().min(1).max(120),
  description: z.string().max(5000),
  goal: z.string().max(2000),
  dueDate: isoDate.nullable(),
  today: isoDate,
  instructions: z.string().max(2000).default(''),
  members: z
    .array(
      z.object({
        id: idSchema,
        name: z.string().max(80),
        skills: z.array(z.string().max(60)).max(30),
        openHours: z.number().min(0).max(10_000)
      })
    )
    .max(100)
})

/** Định dạng JSON mà skill project-planner trả về (lỏng — làm sạch ở main). */
export const taskPlanOutputSchema = z.object({
  type: z.literal('task_plan'),
  tasks: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().max(5000).default(''),
        assigneeId: z.string().nullish(),
        priority: z.string().nullish(),
        estimateHours: z.number().nullish(),
        dueDate: z.string().nullish(),
        dependsOn: z.array(z.string()).default([]),
        reason: z.string().max(1000).default('')
      })
    )
    .max(60)
})

export type PlanRequest = z.infer<typeof planRequestSchema>
export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskStatus = (typeof TASK_STATUSES)[number]
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]
export type TeamRole = (typeof TEAM_ROLES)[number]

export type PlannedTask = {
  title: string
  description: string
  assigneeId: string | null
  priority: TaskPriority
  estimateHours: number | null
  dueDate: string | null
  dependsOn: string[]
  reason: string
}

export type PlanResult = { tasks: PlannedTask[] } | { error: string }

// ---- Feedback: trợ lý viết & tóm tắt ----

export const FEEDBACK_KINDS = ['project', 'person', 'review'] as const
export const FEEDBACK_VISIBILITIES = ['public', 'anonymous', 'private'] as const
export const FEEDBACK_CATEGORIES = ['praise', 'improve', 'suggestion'] as const

export const feedbackCoachSchema = z.object({
  draft: z.string().trim().min(1).max(5000),
  /** compose = viết feedback mới; reply = người nhận/người trong thread trả lời. */
  mode: z.enum(['compose', 'reply']),
  kind: z.enum(FEEDBACK_KINDS),
  visibility: z.enum(FEEDBACK_VISIBILITIES),
  category: z.enum(FEEDBACK_CATEGORIES),
  /** Nội dung feedback gốc khi trả lời (để giữ ngữ cảnh). */
  original: z.string().max(5000).default(''),
  language: z.enum(['vi', 'en']).default('vi')
})

export const feedbackSummarySchema = z.object({
  scope: z.string().trim().min(1).max(200),
  period: z.string().trim().min(1).max(80),
  language: z.enum(['vi', 'en']).default('vi'),
  /** Đã bỏ tên người — chỉ nội dung, loại, ngày. */
  items: z
    .array(
      z.object({
        date: z.string().max(20),
        kind: z.enum(FEEDBACK_KINDS),
        category: z.enum(FEEDBACK_CATEGORIES),
        status: z.string().max(20),
        body: z.string().max(5000),
        replies: z.array(z.string().max(5000)).max(50).default([])
      })
    )
    .min(1)
    .max(200)
})

export type FeedbackCoachRequest = z.infer<typeof feedbackCoachSchema>
export type FeedbackSummaryRequest = z.infer<typeof feedbackSummarySchema>
export type TextResult = { text: string } | { error: string }

export const desktopNotificationSchema = z.object({
  title: z.string().trim().min(1).max(120),
  body: z.string().max(300).default(''),
  /** Route trong app mở khi bấm vào thông báo, ví dụ "/projects/<id>?task=<id>". */
  route: z.string().regex(/^\/[\w\-/?=&%.]*$/).max(300).optional()
})

export type DesktopNotification = z.infer<typeof desktopNotificationSchema>

// ---- Học tập & kế hoạch (yêu cầu gửi trợ lý) ----

const lang = z.enum(['vi', 'en']).default('vi')

export const learningPathRequestSchema = z.object({
  goal: z.string().trim().min(1).max(1000),
  level: z.string().max(300).default(''),
  hoursPerWeek: z.number().min(1).max(80),
  deadline: isoDate.nullable().default(null),
  today: isoDate,
  language: lang
})

export const quizRequestSchema = z.object({
  topic: z.string().trim().min(1).max(300),
  context: z.string().max(6000).default(''),
  count: z.number().int().min(3).max(15).default(6),
  language: lang
})

export const quizQuestionSchema = z.object({
  q: z.string().min(1).max(2000),
  /** Rỗng = câu tự luận ngắn. */
  choices: z.array(z.string().max(500)).max(8),
  answer: z.string().max(2000),
  explain: z.string().max(3000)
})

export const quizGradeRequestSchema = z.object({
  topic: z.string().max(300),
  language: lang,
  items: z
    .array(
      quizQuestionSchema.extend({
        userAnswer: z.string().max(3000),
        /** Trắc nghiệm đã chấm ở máy; null = câu tự luận cần trợ lý chấm. */
        localCorrect: z.boolean().nullable()
      })
    )
    .min(1)
    .max(15)
})

export const dayPlanRequestSchema = z.object({
  today: isoDate,
  now: z.string().regex(/^\d{2}:\d{2}$/),
  workday: z.object({ start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }),
  loggedMinutesToday: z.number().min(0).max(1440),
  language: lang,
  tasks: z
    .array(
      z.object({
        id: z.string().max(64),
        title: z.string().max(200),
        project: z.string().max(120).default(''),
        priority: z.enum(TASK_PRIORITIES),
        status: z.enum(TASK_STATUSES),
        dueDate: isoDate.nullable(),
        estimateHours: z.number().nullable()
      })
    )
    .max(60)
})

export const reportRequestSchema = z.object({
  periodType: z.enum(['day', 'week']),
  periodLabel: z.string().max(60),
  language: lang,
  done: z.array(z.string().max(200)).max(100),
  inProgress: z.array(z.string().max(200)).max(100),
  blocked: z.array(z.string().max(200)).max(100),
  timeByTask: z.array(z.object({ title: z.string().max(200), minutes: z.number().min(0) })).max(100),
  notes: z.string().max(3000).default('')
})

export type LearningPathRequest = z.infer<typeof learningPathRequestSchema>
export type QuizRequest = z.infer<typeof quizRequestSchema>
export type QuizQuestion = z.infer<typeof quizQuestionSchema>
export type QuizGradeRequest = z.infer<typeof quizGradeRequestSchema>
export type DayPlanRequest = z.infer<typeof dayPlanRequestSchema>
export type ReportRequest = z.infer<typeof reportRequestSchema>

export type PlannedStep = { title: string; description: string; resources: string[]; estimatedHours: number | null; dueDate: string | null }
export type QuizGrade = { results: { index: number; correct: boolean; feedback: string }[]; weakPoints: string[] }
export type DayBlock = { start: string; end: string; taskId: string | null; note: string }

export type AiResult<T> = T | { error: string }

// ---- Thời gian ----

export const TIME_ENTRY_KINDS = ['timer', 'pomodoro', 'manual'] as const
export type TimeEntryKind = (typeof TIME_ENTRY_KINDS)[number]

const taskRef = {
  taskId: idSchema.nullable().default(null),
  projectId: idSchema.nullable().default(null),
  title: z.string().trim().min(1).max(200),
  projectName: z.string().max(120).nullable().default(null)
}

export const timeStartSchema = z.object({ ...taskRef, kind: z.enum(['timer', 'pomodoro']).default('timer') })

export const timeManualSchema = z
  .object({ ...taskRef, startedAt: z.number().int().positive(), endedAt: z.number().int().positive(), note: z.string().max(500).default('') })
  .refine((v) => v.endedAt > v.startedAt && v.endedAt - v.startedAt <= 24 * 3600_000, 'invalid_range')

export const timeUpdateSchema = z
  .object({ id: idSchema, title: z.string().trim().min(1).max(200), note: z.string().max(500), startedAt: z.number().int().positive(), endedAt: z.number().int().positive() })
  .refine((v) => v.endedAt > v.startedAt && v.endedAt - v.startedAt <= 24 * 3600_000, 'invalid_range')

export const timeRangeSchema = z.object({ from: z.number().int(), to: z.number().int() }).refine((v) => v.to > v.from, 'invalid_range')

export const workdaySchema = z.object({
  start: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  end: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  focusMinutes: z.number().int().min(5).max(120),
  breakMinutes: z.number().int().min(1).max(60)
})
export type Workday = z.infer<typeof workdaySchema>
export const DEFAULT_WORKDAY: Workday = { start: '09:00', end: '17:30', focusMinutes: 25, breakMinutes: 5 }

// ---- Cấu hình AI ----

export const AI_PROVIDERS = ['claude-cli', 'anthropic-api'] as const

export const aiSettingsSchema = z.object({
  provider: z.enum(AI_PROVIDERS),
  /** Tự đề xuất memory khi rời một cuộc trò chuyện có tin nhắn mới. */
  autoSuggestMemory: z.boolean()
})

export const DEFAULT_AI_SETTINGS: AiSettings = { provider: 'claude-cli', autoSuggestMemory: true }

/** Key Anthropic API do người dùng tự tạo trên Claude Console. */
export const apiKeySchema = z
  .string()
  .trim()
  .regex(/^sk-ant-[A-Za-z0-9_-]{20,}$/)

export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number]
export type MemoryAction = (typeof MEMORY_ACTIONS)[number]
export type SuggestionStatus = (typeof SUGGESTION_STATUSES)[number]
export type UserProfile = z.infer<typeof userProfileSchema>
export type AiSettings = z.infer<typeof aiSettingsSchema>
export type AiProviderId = (typeof AI_PROVIDERS)[number]

export type AssistantProfile = z.infer<typeof assistantProfileSchema>
export type Appearance = z.infer<typeof appearanceSchema>
export type Persona = (typeof PERSONAS)[number]
export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_ASSISTANT: AssistantProfile = {
  name: 'Mây',
  avatar: '🌤️',
  persona: 'friendly',
  customPersona: '',
  language: 'vi'
}

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  accent: 'blue'
}
