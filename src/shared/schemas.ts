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
