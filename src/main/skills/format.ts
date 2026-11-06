const BOM = 0xfeff

export type ParsedSkillMd = { name: string; description: string; body: string }

const unquote = (v: string): string => {
  const t = v.trim()
  if (t.length >= 2 && ((t[0] === '"' && t.endsWith('"')) || (t[0] === "'" && t.endsWith("'"))))
    return t.slice(1, -1)
  return t
}

/**
 * Đọc frontmatter kiểu SKILL.md của Claude (`name`, `description`). Chỉ hỗ trợ phần YAML đơn giản
 * mà skill hay dùng: `key: value`, giá trị trong nháy, và khối nhiều dòng `>` / `|`.
 * Trả null nếu không có frontmatter.
 */
export function parseSkillMd(markdown: string): ParsedSkillMd | null {
  const text = markdown.charCodeAt(0) === BOM ? markdown.slice(1) : markdown
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return null
  const fields: Record<string, string> = {}
  const lines = match[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(lines[i])
    if (!m) continue
    const [, key, raw] = m
    if (/^[>|][-+]?$/.test(raw.trim())) {
      const block: string[] = []
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) {
        block.push(lines[++i].trim())
      }
      fields[key] = (raw.trim().startsWith('>') ? block.join(' ') : block.join('\n')).trim()
    } else {
      fields[key] = unquote(raw)
    }
  }
  return {
    name: (fields.name ?? '').trim(),
    description: (fields.description ?? '').replace(/\s+/g, ' ').trim(),
    body: text.slice(match[0].length).trim()
  }
}

/** Tạo nội dung SKILL.md (dùng cho skill my-style). */
export function renderSkillMd(name: string, description: string, body: string): string {
  return `---\nname: ${name}\ndescription: ${JSON.stringify(description)}\n---\n\n${body.trim()}\n`
}
