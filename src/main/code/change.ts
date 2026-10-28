import { readFile } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'
import { createTwoFilesPatch } from 'diff'

export type FileChange = {
  /** Đường dẫn tương đối trong thư mục dự án. */
  path: string
  isNewFile: boolean
  patch: string
  added: number
  removed: number
}

export type ChangeResult = FileChange | { error: 'outside_project' | 'unsupported_tool' | 'old_string_not_found' | 'invalid_input' }

const MAX_FILE_BYTES = 2 * 1024 * 1024

/** Đường dẫn có nằm TRONG thư mục dự án không (chặn ../ và ổ đĩa khác). */
export function insideProject(root: string, target: string): string | null {
  const abs = isAbsolute(target) ? resolve(target) : resolve(root, target)
  const rel = relative(resolve(root), abs)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return rel.replace(/\\/g, '/')
}

async function readOrEmpty(path: string): Promise<{ text: string; exists: boolean }> {
  try {
    const buf = await readFile(path)
    if (buf.length > MAX_FILE_BYTES) return { text: '', exists: true }
    return { text: buf.toString('utf8'), exists: true }
  } catch {
    return { text: '', exists: false }
  }
}

function count(patch: string): { added: number; removed: number } {
  let added = 0
  let removed = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) added++
    else if (line.startsWith('-') && !line.startsWith('---')) removed++
  }
  return { added, removed }
}

/**
 * Tool Claude muốn chạy → diff để người dùng duyệt. Chỉ hỗ trợ Edit/Write;
 * file ngoài thư mục dự án bị từ chối.
 */
export async function describeChange(root: string, toolName: string, input: unknown): Promise<ChangeResult> {
  const data = (input ?? {}) as Record<string, unknown>
  if (typeof data.file_path !== 'string') return { error: 'invalid_input' }
  const rel = insideProject(root, data.file_path)
  if (!rel) return { error: 'outside_project' }
  const abs = resolve(root, rel)
  const before = await readOrEmpty(abs)

  let after: string
  if (toolName === 'Write') {
    if (typeof data.content !== 'string') return { error: 'invalid_input' }
    after = data.content
  } else if (toolName === 'Edit') {
    const { old_string: oldStr, new_string: newStr, replace_all: all } = data
    if (typeof oldStr !== 'string' || typeof newStr !== 'string') return { error: 'invalid_input' }
    if (!before.text.includes(oldStr)) return { error: 'old_string_not_found' }
    after = all === true ? before.text.split(oldStr).join(newStr) : before.text.replace(oldStr, () => newStr)
  } else {
    return { error: 'unsupported_tool' }
  }

  const patch = createTwoFilesPatch(`a/${rel}`, `b/${rel}`, before.text, after, '', '', { context: 3 })
  return { path: rel, isNewFile: !before.exists, patch, ...count(patch) }
}
