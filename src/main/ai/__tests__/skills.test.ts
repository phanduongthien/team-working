import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHAT_MODES } from '@shared/ai'
import { MODE_SKILLS, loadModeSkill, stripFrontmatter } from '../skills'

const skillsDir = join(__dirname, '..', '..', '..', '..', 'assistant-skills')

describe('skills', () => {
  it('bỏ frontmatter YAML', () => {
    expect(stripFrontmatter('---\nname: a\ndescription: b\n---\n\n# Nội dung\n')).toBe('# Nội dung')
    expect(stripFrontmatter('# Không có frontmatter')).toBe('# Không có frontmatter')
  })

  it('mọi skill được map theo chế độ đều tồn tại trong assistant-skills/', async () => {
    for (const mode of CHAT_MODES) {
      const skill = await loadModeSkill(skillsDir, mode)
      if (MODE_SKILLS[mode]) expect(skill, mode).toMatch(/^# /)
      else expect(skill).toBeUndefined()
    }
  })

  it('trả undefined khi thiếu file', async () => {
    expect(await loadModeSkill(join(skillsDir, 'khong-co'), 'study')).toBeUndefined()
  })
})
