import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { describeChange, insideProject } from '../change'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tw-code-'))
  writeFileSync(join(root, 'app.ts'), 'const a = 1\nconst b = 2\nconsole.log(a + b)\n')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('insideProject', () => {
  it('chặn ../, đường dẫn tuyệt đối ngoài dự án và chính thư mục gốc', () => {
    expect(insideProject(root, 'src/x.ts')).toBe('src/x.ts')
    expect(insideProject(root, join(root, 'app.ts'))).toBe('app.ts')
    expect(insideProject(root, '../ngoai.txt')).toBeNull()
    expect(insideProject(root, join(tmpdir(), 'khac.txt'))).toBeNull()
    expect(insideProject(root, root)).toBeNull()
  })
})

describe('describeChange', () => {
  it('Edit → diff đúng dòng thay đổi', async () => {
    const r = await describeChange(root, 'Edit', { file_path: join(root, 'app.ts'), old_string: 'const b = 2', new_string: 'const b = 3' })
    expect(r).toMatchObject({ path: 'app.ts', isNewFile: false, added: 1, removed: 1 })
    expect('patch' in r && r.patch).toContain('-const b = 2\n+const b = 3')
  })

  it('Edit replace_all thay mọi chỗ; old_string không có → lỗi', async () => {
    const r = await describeChange(root, 'Edit', { file_path: 'app.ts', old_string: 'const', new_string: 'let', replace_all: true })
    expect(r).toMatchObject({ added: 2, removed: 2 })
    expect(await describeChange(root, 'Edit', { file_path: 'app.ts', old_string: 'không có', new_string: 'x' })).toEqual({ error: 'old_string_not_found' })
  })

  it('Write file mới → isNewFile', async () => {
    const r = await describeChange(root, 'Write', { file_path: join(root, 'src', 'new.ts'), content: 'export {}\n' })
    expect(r).toMatchObject({ path: 'src/new.ts', isNewFile: true, added: 1, removed: 0 })
  })

  it('ngoài dự án / tool khác / input sai → lỗi', async () => {
    expect(await describeChange(root, 'Write', { file_path: join(tmpdir(), 'x.txt'), content: 'x' })).toEqual({ error: 'outside_project' })
    expect(await describeChange(root, 'Bash', { file_path: 'a', command: 'rm -rf /' })).toEqual({ error: 'unsupported_tool' })
    expect(await describeChange(root, 'Write', { content: 'x' })).toEqual({ error: 'invalid_input' })
  })
})
