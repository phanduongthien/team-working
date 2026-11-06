import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SkillsSettings } from '@shared/skills'
import type { Message } from '@shared/types'
import { parseSkillMd } from '../format'
import {
  inspectPackage,
  readSource,
  safeRelPath,
  SkillPackageError,
  type RawFiles
} from '../package'
import { explicitSkills, normalize, selectSkills } from '../select'
import { SkillStore } from '../store'
import { buildStylePrompt, learnStyle, parseStyleNotes } from '../style'

const md = (name: string, description: string, body = '# Nội dung'): string =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`
const raw = (files: Record<string, string | null>): RawFiles =>
  new Map(Object.entries(files).map(([k, v]) => [k, v === null ? null : strToU8(v)]))
const code = (fn: () => unknown): string | undefined => {
  try {
    fn()
  } catch (e) {
    return e instanceof SkillPackageError ? e.code : String(e)
  }
  return undefined
}

const THEME = {
  id: 'pixel-neon',
  name: 'Pixel neon',
  colors: { background: '#000000', text: '#ffffff', accent: '#ff00ff', muted: '#888888' },
  fonts: { heading: 'Consolas', body: 'Segoe UI' }
}

describe('parseSkillMd', () => {
  it('đọc name, description (kể cả nháy và khối nhiều dòng) và nội dung', () => {
    expect(parseSkillMd(md('a', 'mô tả'))).toEqual({
      name: 'a',
      description: 'mô tả',
      body: '# Nội dung'
    })
    expect(
      parseSkillMd('---\nname: "b"\ndescription: >\n  dòng 1\n  dòng 2\nlicense: MIT\n---\nX')
    ).toEqual({
      name: 'b',
      description: 'dòng 1 dòng 2',
      body: 'X'
    })
    expect(parseSkillMd('\ufeff---\r\nname: c\r\ndescription: d\r\n---\r\nY')?.name).toBe('c')
    expect(parseSkillMd('# không có frontmatter')).toBeNull()
  })
})

describe('inspectPackage', () => {
  const builtin = new Set(['study-tutor'])

  it('nhận SKILL.md ở gốc hoặc trong một thư mục con, chỉ giữ file chữ', () => {
    const pkg = inspectPackage(
      raw({
        'slide-pixel/SKILL.md': md('slide-pixel', 'Làm slide phong cách pixel'),
        'slide-pixel/reference.md': 'thêm',
        'slide-pixel/scripts/run.py': 'print(1)',
        'slide-pixel/logo.png': '\u0000\u00ff',
        'slide-pixel/themes/neon.json': JSON.stringify(THEME),
        'slide-pixel/themes/hong.json': '{"id":"x"}',
        'slide-pixel/big.md': null,
        'khac.txt': 'ngoài gốc'
      }),
      builtin
    )
    expect(pkg.name).toBe('slide-pixel')
    expect([...pkg.files.keys()].sort()).toEqual(['SKILL.md', 'reference.md', 'themes/neon.json'])
    expect(pkg.skipped).toEqual([
      'big.md',
      'khac.txt',
      'logo.png',
      'scripts/run.py',
      'themes/hong.json'
    ])
    expect(pkg.themes.map((t) => t.id)).toEqual(['pixel-neon'])
  })

  it('báo lỗi rõ ràng', () => {
    expect(code(() => inspectPackage(raw({ 'a.md': 'x' }), builtin))).toBe('no_skill_md')
    expect(
      code(() =>
        inspectPackage(raw({ 'a/SKILL.md': md('a', 'd'), 'b/SKILL.md': md('b', 'd') }), builtin)
      )
    ).toBe('many_skill_md')
    expect(code(() => inspectPackage(raw({ 'SKILL.md': '# thiếu frontmatter' }), builtin))).toBe(
      'bad_frontmatter'
    )
    expect(code(() => inspectPackage(raw({ 'SKILL.md': md('a', '') }), builtin))).toBe(
      'bad_frontmatter'
    )
    expect(code(() => inspectPackage(raw({ 'SKILL.md': md('Tên Hoa', 'd') }), builtin))).toBe(
      'bad_name'
    )
    expect(code(() => inspectPackage(raw({ 'SKILL.md': md('study-tutor', 'd') }), builtin))).toBe(
      'builtin_name'
    )
  })

  it('chặn đường dẫn thoát khỏi thư mục (zip slip)', () => {
    expect(safeRelPath('../x.md')).toBeNull()
    expect(safeRelPath('a/../../x.md')).toBeNull()
    expect(safeRelPath('/etc/x')).toBeNull()
    expect(safeRelPath('C:\\Windows\\x')).toBeNull()
    expect(safeRelPath('a\\b.md')).toBe('a/b.md')
    const pkg = inspectPackage(raw({ 'SKILL.md': md('a', 'd'), '../evil.md': 'x' }), builtin)
    expect([...pkg.files.keys()]).toEqual(['SKILL.md'])
    expect(pkg.skipped).toEqual(['../evil.md'])
  })
})

describe('select', () => {
  const skills = [
    { name: 'slide-pixel', description: 'Làm slide thuyết trình phong cách pixel art cho game' },
    {
      name: 'viet-bao-cao',
      description: 'Viết báo cáo tuần cho quản lý dự án, có số liệu tiến độ'
    },
    { name: 'unity-debug', description: 'Gỡ lỗi Unity C#, đọc log NullReferenceException' }
  ]

  it('bỏ dấu tiếng Việt', () => {
    expect(normalize('Đường Báo Cáo')).toBe('duong bao cao')
  })

  it('gọi đích danh', () => {
    const names = skills.map((s) => s.name)
    expect(explicitSkills('Dùng skill slide-pixel làm giúp mình', names)).toEqual(['slide-pixel'])
    expect(explicitSkills('/unity-debug lỗi này là gì', names)).toEqual(['unity-debug'])
    expect(explicitSkills('skill “viet-bao-cao” nhé', names)).toEqual(['viet-bao-cao'])
    expect(explicitSkills('skill khong-co', names)).toEqual([])
  })

  it('tự chọn theo description, không nhồi hết', () => {
    expect(selectSkills('Làm giúp mình slide thuyết trình về game pixel', skills)).toEqual([
      'slide-pixel'
    ])
    expect(selectSkills('Viết báo cáo tuần cho dự án', skills)).toEqual(['viet-bao-cao'])
    expect(selectSkills('chào bạn, hôm nay thế nào', skills)).toEqual([])
    expect(selectSkills('dùng skill unity-debug, viết báo cáo tuần cho dự án', skills)).toEqual([
      'unity-debug',
      'viet-bao-cao'
    ])
  })
})

describe('SkillStore', () => {
  let dir: string
  let builtinDir: string
  let userDir: string
  let settings: SkillsSettings
  let store: SkillStore

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'skills-'))
    builtinDir = join(dir, 'builtin')
    userDir = join(dir, 'user')
    mkdirSync(join(builtinDir, 'study-tutor'), { recursive: true })
    writeFileSync(join(builtinDir, 'study-tutor', 'SKILL.md'), md('study-tutor', 'Gia sư'))
    settings = { disabled: [] }
    store = new SkillStore({
      builtinDir,
      userDir,
      getSettings: () => settings,
      setSettings: (v) => (settings = v),
      log: { info: () => {}, warn: () => {} }
    })
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const makeFolder = (name: string, description: string, body = '# Hướng dẫn'): string => {
    const src = join(dir, 'src', name)
    mkdirSync(join(src, 'themes'), { recursive: true })
    writeFileSync(join(src, 'SKILL.md'), md(name, description, body))
    writeFileSync(join(src, 'run.sh'), 'rm -rf /')
    writeFileSync(join(src, 'themes', 'neon.json'), JSON.stringify(THEME))
    return src
  }

  it('xem trước không ghi gì; cài đúng gói đã xem; liệt kê kèm skill có sẵn', async () => {
    const preview = await store.preview(makeFolder('slide-pixel', 'Làm slide pixel art cho game'))
    if (!preview || 'error' in preview) throw new Error('preview failed')
    expect(preview.skipped).toEqual(['run.sh'])
    expect(preview.replaces).toBe(false)
    expect(await store.list()).toHaveLength(1)

    const info = await store.install(preview.token)
    expect(info).toMatchObject({ name: 'slide-pixel', source: 'user', enabled: true })
    expect(info.files).toEqual(['SKILL.md', 'themes/neon.json'])
    expect((await store.list()).map((s) => `${s.source}:${s.name}`)).toEqual([
      'user:slide-pixel',
      'builtin:study-tutor'
    ])
    await expect(store.install(preview.token)).rejects.toThrow('preview_expired')
    expect(store.themesSync().map((t) => t.id)).toEqual(['pixel-neon'])
    await store.setEnabled('slide-pixel', false)
    expect(store.themesSync()).toEqual([])
  })

  it('cài từ .zip, báo thay thế khi trùng tên', async () => {
    const zip = join(dir, 'a.zip')
    writeFileSync(
      zip,
      zipSync({
        'my-skill/SKILL.md': strToU8(md('my-skill', 'mô tả')),
        'my-skill/x.exe': new Uint8Array([0, 1])
      })
    )
    const p1 = await store.preview(zip)
    if (!p1 || 'error' in p1) throw new Error('preview failed')
    expect(p1.skipped).toEqual(['x.exe'])
    await store.install(p1.token)
    const p2 = await store.preview(zip)
    expect(p2 && !('error' in p2) && p2.replaces).toBe(true)
    writeFileSync(join(dir, 'hong.zip'), 'không phải zip')
    expect(await store.preview(join(dir, 'hong.zip'))).toEqual({ error: 'bad_zip' })
    expect(await readSource(join(dir, 'khong-co')).catch((e: SkillPackageError) => e.code)).toBe(
      'unreadable'
    )
  })

  it('bật/tắt, xoá; prompt chỉ chứa skill liên quan + my-style', async () => {
    for (const [n, d] of [
      ['slide-pixel', 'Làm slide thuyết trình pixel art cho game'],
      ['viet-bao-cao', 'Viết báo cáo tuần cho quản lý dự án']
    ]) {
      const p = await store.preview(makeFolder(n, d, `Hướng dẫn của ${n}`))
      if (!p || 'error' in p) throw new Error('preview failed')
      await store.install(p.token)
    }
    await store.setStyleNotes(['Trả lời ngắn', 'Trả lời ngắn', ' Slide nền tối '])
    expect(await store.styleNotes()).toEqual(['Trả lời ngắn', 'Slide nền tối'])

    const r = await store.promptFor('làm slide thuyết trình game pixel')
    expect(r.used).toEqual(['my-style', 'slide-pixel'])
    expect(r.section).toContain('### Skill: slide-pixel')
    expect(r.section).toContain('Hướng dẫn của slide-pixel')
    expect(r.section).toContain('pixel-neon')
    expect(r.section).not.toContain('Hướng dẫn của viet-bao-cao')
    expect(r.section).toContain('viet-bao-cao') // vẫn liệt kê tên để gọi đích danh
    expect(r.section).toContain('- Trả lời ngắn')

    await store.setEnabled('slide-pixel', false)
    expect((await store.promptFor('dùng skill slide-pixel')).used).toEqual(['my-style'])
    await store.setEnabled('slide-pixel', true)
    await store.remove('slide-pixel')
    expect((await store.list()).some((s) => s.name === 'slide-pixel')).toBe(false)

    await store.setStyleNotes([])
    await store.remove('viet-bao-cao')
    expect(await store.promptFor('bất kỳ')).toEqual({ section: '', used: [] })
  })

  it('my-style là SKILL.md hợp lệ', async () => {
    await store.setStyleNotes(['Dùng gạch đầu dòng'])
    const parsed = parseSkillMd(await readFile(join(userDir, 'my-style', 'SKILL.md'), 'utf8'))
    expect(parsed?.name).toBe('my-style')
    expect(parsed?.description).toMatch(/Phong cách/)
  })
})

describe('học phong cách', () => {
  const msg = (role: 'user' | 'assistant', content: string): Message =>
    ({ id: content, role, content, status: 'done' }) as unknown as Message

  it('prompt có ghi chú cũ + hội thoại', () => {
    const p = buildStylePrompt([msg('user', 'ngắn thôi'), msg('assistant', 'ok')], ['Dùng emoji'])
    expect(p).toContain('- Dùng emoji')
    expect(p).toContain('NGƯỜI DÙNG: ngắn thôi')
  })

  it('parse: bỏ trùng, bỏ ghi chú đã có, sai định dạng → null', () => {
    expect(
      parseStyleNotes(
        '```json\n{"type":"style_notes","notes":["A", "a ", "Dùng emoji", ""]}\n```',
        ['dùng emoji']
      )
    ).toEqual(['A'])
    expect(parseStyleNotes('không phải json', [])).toBeNull()
  })

  it('không có tin nhắn → no_messages, không gọi AI', async () => {
    let called = false
    const r = await learnStyle({
      conversations: { list: () => [] },
      messages: { recent: () => [] },
      getProvider: () => {
        called = true
        throw new Error('x')
      },
      loadSkill: async () => '',
      existingNotes: async () => [],
      workspaceDir: tmpdir(),
      log: { warn: () => {} }
    })
    expect(r).toEqual({ error: 'no_messages' })
    expect(called).toBe(false)
  })

  it('trả đề xuất từ AI (không tự lưu)', async () => {
    const r = await learnStyle({
      conversations: { list: () => [{ id: 'c1', updatedAt: 1 }] as never },
      messages: { recent: () => [msg('user', 'viết ngắn thôi')] },
      getProvider: () => ({
        id: 'fake',
        stateful: false,
        isAvailable: async () => ({ ok: true }),
        async *chat() {
          yield { type: 'text' as const, delta: '{"type":"style_notes","notes":["Viết ngắn"]}' }
          yield { type: 'done' as const }
        }
      }),
      loadSkill: async () => 'skill',
      existingNotes: async () => [],
      workspaceDir: tmpdir(),
      log: { warn: () => {} }
    })
    expect(r).toEqual({ notes: ['Viết ngắn'] })
  })
})
