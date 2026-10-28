import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChatMode } from '@shared/ai'

/** Mỗi chế độ hội thoại ứng với một skill trong assistant-skills/. */
export const MODE_SKILLS: Record<ChatMode, string | null> = {
  free: null,
  study: 'study-tutor',
  code: 'code-helper',
  project: 'project-planner'
}

const BOM = 0xfeff

export function stripFrontmatter(markdown: string): string {
  const text = markdown.charCodeAt(0) === BOM ? markdown.slice(1) : markdown
  const match = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/)
  return (match ? text.slice(match[0].length) : text).trim()
}

/**
 * Đọc SKILL.md theo tên. Chạy CLI với --restricted nên CLI không tự nạp skill —
 * app chèn nội dung skill thẳng vào system prompt.
 */
export async function loadSkill(skillsDir: string, name: string): Promise<string | undefined> {
  try {
    return stripFrontmatter(await readFile(join(skillsDir, name, 'SKILL.md'), 'utf8'))
  } catch {
    return undefined
  }
}

export async function loadModeSkill(skillsDir: string, mode: ChatMode): Promise<string | undefined> {
  const name = MODE_SKILLS[mode]
  return name ? loadSkill(skillsDir, name) : undefined
}
