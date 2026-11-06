import { z } from 'zod'
import { themeSchema, type Theme } from './artifacts'

/** Tên skill: chữ thường, số, gạch nối — dùng làm tên thư mục nên phải chặt. */
export const SKILL_NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
export const skillNameSchema = z.string().regex(SKILL_NAME_RE)

/** Skill ghi chú phong cách của người dùng (học từ hội thoại, chỉ lưu khi người dùng đồng ý). */
export const STYLE_SKILL = 'my-style'

/** Theme slide do skill cung cấp (`themes/*.json` trong thư mục skill) — cùng định dạng theme artifact. */
export const skillThemeSchema = themeSchema
export type SkillTheme = Theme

export type SkillSource = 'builtin' | 'user'

export type SkillInfo = {
  name: string
  description: string
  source: SkillSource
  /** Skill có sẵn luôn bật (app tự dùng theo chế độ); skill người dùng bật/tắt được. */
  enabled: boolean
  /** Nơi cài từ (thư mục / file .zip) — chỉ skill người dùng. */
  origin?: string
  installedAt?: string
  files: string[]
  themes: SkillTheme[]
}

export type SkillDetail = SkillInfo & { body: string }

/** Bản xem trước trước khi cài: người dùng đọc nội dung rồi mới bấm Cài. */
export type SkillPreview = {
  token: string
  name: string
  description: string
  body: string
  origin: string
  files: { path: string; size: number }[]
  /** File bị bỏ qua (script, file nhị phân, quá lớn…) — skill chỉ là chữ, không chạy gì. */
  skipped: string[]
  themes: SkillTheme[]
  /** Đã có skill người dùng cùng tên → cài sẽ thay thế. */
  replaces: boolean
}

export type SkillPreviewResult = SkillPreview | { error: SkillInstallError } | null

export const SKILL_INSTALL_ERRORS = [
  'no_skill_md',
  'many_skill_md',
  'bad_frontmatter',
  'bad_name',
  'builtin_name',
  'too_large',
  'bad_zip',
  'unreadable'
] as const
export type SkillInstallError = (typeof SKILL_INSTALL_ERRORS)[number]

export const skillsSettingsSchema = z.object({
  /** Tên skill người dùng đang tắt. */
  disabled: z.array(skillNameSchema).max(500)
})
export type SkillsSettings = z.infer<typeof skillsSettingsSchema>
export const DEFAULT_SKILLS_SETTINGS: SkillsSettings = { disabled: [] }

export const styleNoteSchema = z.string().trim().min(1).max(300)

/** Định dạng JSON mà skill style-learner trả về. */
export const styleNotesOutputSchema = z.object({
  type: z.literal('style_notes'),
  notes: z.array(z.string()).max(20)
})

export type StyleLearnResult = { notes: string[] } | { error: string }
