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

export const chatSendSchema = z.object({
  conversationId: idSchema,
  text: z.string().trim().min(1).max(100_000)
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
