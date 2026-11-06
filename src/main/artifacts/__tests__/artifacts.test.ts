import { join } from 'node:path'
import ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  applyEdits,
  computeSheet,
  hideArtifactBlocks,
  parseArtifactBlocks,
  parseSheet,
  parseSlides,
  serializeSheet
} from '@shared/artifacts'
import { evaluate, parseFormula, toExcel } from '@shared/formula'
import { openDatabase } from '../../db/client'
import { ConversationRepository } from '../../db/repositories'
import { toCsv, toDocx, toPptx, toUnityJson, toXlsx } from '../export'
import { ARTIFACT_CSP, artifactDocument, handleArtifactRequest } from '../protocol'
import { ArtifactService } from '../service'

describe('công thức an toàn (không eval)', () => {
  const ev = (s: string, vars: Record<string, number> = {}): number =>
    evaluate(parseFormula(s), (n) => vars[n] ?? NaN)
  it('toán tử, ưu tiên, hàm, if', () => {
    expect(ev('2 + 3 * 4 ^ 2')).toBe(50)
    expect(ev('-(1 + 2) * 3')).toBe(-9)
    expect(ev('Damage * AttackSpeed', { Damage: 80, AttackSpeed: 1.5 })).toBe(120)
    expect(ev('round(10 / 3, 2)')).toBe(3.33)
    expect(ev('if(HP > 100, 1, 0)', { HP: 150 })).toBe(1)
    expect(ev('max(1, 5, 3) + min(4, 2)')).toBe(7)
    expect(ev('1 / 0')).toBeNaN()
  })
  it('chặn mọi thứ không phải công thức', () => {
    for (const bad of [
      'alert(1)',
      'constructor.constructor("x")()',
      'a; b',
      '`x`',
      'a[0]',
      '1 +',
      'eval("1")',
      'x.y'
    ])
      expect(() => parseFormula(bad), bad).toThrow()
  })
  it('đổi sang công thức Excel', () => {
    expect(
      toExcel(parseFormula('round(Damage * AttackSpeed, 1) % 2'), (n) =>
        n === 'Damage' ? 'B2' : 'C2'
      )
    ).toBe('MOD(ROUND((B2*C2),1),2)')
  })
})

describe('khối artifact trong câu trả lời', () => {
  it('tách khối tạo + khối sửa; chữ còn lại để hiện trong chat', () => {
    const r = parseArtifactBlocks(
      'Xong nè!\n<artifact type="sheet" title="Cân bằng">\nA, B = A * 2\n1\n</artifact>\n<artifact-edit title="GDD"><find>cũ &lt;1&gt;</find><replace>mới</replace><find>x</find><replace>y</replace></artifact-edit>\nThêm câu.'
    )
    expect(r.text).toBe('Xong nè!\n\nThêm câu.')
    expect(r.ops).toEqual([
      { kind: 'create', type: 'sheet', title: 'Cân bằng', content: 'A, B = A * 2\n1' },
      {
        kind: 'edit',
        title: 'GDD',
        edits: [
          { find: 'cũ <1>', replace: 'mới' },
          { find: 'x', replace: 'y' }
        ]
      }
    ])
  })
  it('thiếu title / sai type → bỏ, ghi lỗi; đang stream thì ẩn khối chưa đóng', () => {
    expect(parseArtifactBlocks('<artifact type="exe" title="X">1</artifact>').invalid).toEqual([
      'bad_type:X'
    ])
    expect(parseArtifactBlocks('<artifact>1</artifact>').invalid).toEqual(['missing_title'])
    expect(hideArtifactBlocks('Đây nè <artifact type="doc" title="A">\n# Ti')).toEqual({
      text: 'Đây nè',
      writing: true
    })
    expect(hideArtifactBlocks('Đây nè <arti').text).toBe('Đây nè')
  })
  it('find phải khớp đúng một chỗ — không thì không sửa gì', () => {
    expect(applyEdits('a b c', [{ find: 'b', replace: 'B' }])).toBe('a B c')
    expect(() => applyEdits('a b b', [{ find: 'b', replace: 'B' }])).toThrow('ambiguous')
    expect(() =>
      applyEdits('a b c', [
        { find: 'b', replace: 'B' },
        { find: 'z', replace: 'Z' }
      ])
    ).toThrow('not_found')
  })
})

describe('bảng cân bằng', () => {
  const src =
    'Name, Damage, AttackSpeed, DPS = Damage * AttackSpeed\nWarrior, 80, 1\nArcher, 50, 1.5\nMage, 120, 0.8\nRogue, 60, 1.2\nGiant, 400, 2'
  it('tính công thức, tô ô bất thường, giữ nguyên khi serialize', () => {
    const c = computeSheet(parseSheet(src))
    expect(c.values.map((r) => r[3])).toEqual([80, 75, 96, 72, 800])
    expect(c.outliers[4][3]).toBeGreaterThan(0) // Giant quá mạnh
    expect(c.outliers[0][3]).toBe(0)
    expect(parseSheet(serializeSheet(parseSheet(src)))).toEqual(parseSheet(src))
  })
  it('lỗi công thức / cột không tồn tại / vòng lặp → báo, không treo', () => {
    const c = computeSheet(parseSheet('A, B = A + Z, C = D, D = C\n1'))
    expect(c.errors.join(' ')).toContain('không có cột "Z"')
    expect(c.values[0][2]).toBe('#LỖI')
  })
  it('xuất xlsx giữ công thức + tô màu, CSV, JSON cho Unity', async () => {
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load((await toXlsx(src, 'Cân bằng')) as unknown as ArrayBuffer)
    const ws = wb.worksheets[0]
    expect((ws.getCell('D2').value as { formula: string }).formula).toBe('(B2*C2)')
    expect((ws.getCell('D6').fill as { fgColor?: { argb: string } }).fgColor?.argb).toMatch(
      /FFFCA5A5|FFFEF08A/
    )
    expect(toCsv(src).split('\r\n')[5]).toBe('Giant,400,2,800')
    expect(JSON.parse(toUnityJson(src)).items[1]).toEqual({
      Name: 'Archer',
      Damage: 50,
      AttackSpeed: 1.5,
      DPS: 75
    })
  })
})

describe('slide + docx', () => {
  const deck =
    'theme: pixel\nlayout: title\n# Game Hay\n## Tagline\n---\nlayout: two-column\n# Gameplay\n- Đánh\n|||\n- Né\nnotes: nói chậm\n---\n# Số liệu\nchart: {"type":"bar","labels":["A"],"datasets":[{"label":"x","data":[1]}]}'
  it('đọc slide Markdown', () => {
    const d = parseSlides(deck)
    expect(d.theme).toBe('pixel')
    expect(d.slides).toHaveLength(3)
    expect(d.slides[1]).toMatchObject({
      layout: 'two-column',
      bullets: ['Đánh'],
      right: ['Né'],
      notes: 'nói chậm'
    })
    expect(d.slides[2].chart?.labels).toEqual(['A'])
  })
  it('xuất pptx / docx ra file Office hợp lệ (zip)', async () => {
    const pptx = await toPptx(deck, 'Pitch', [])
    const docx = await toDocx(
      '# Tiêu đề\n\nĐoạn **đậm** và *nghiêng*.\n\n- a\n- b\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```mermaid\nflowchart LR\n```',
      'GDD'
    )
    for (const buf of [pptx, docx]) expect(buf.subarray(0, 2).toString()).toBe('PK')
  })
})

describe('ArtifactService + protocol', () => {
  let service: ArtifactService
  let conv: string
  beforeEach(() => {
    const { db } = openDatabase(':memory:', join(__dirname, '..', '..', 'db', 'migrations'))
    const convs = new ConversationRepository(db, () => 'local')
    conv = convs.create('free').id
    service = new ArtifactService({ db, ownsConversation: (id) => !!convs.get(id) })
  })

  it('tạo → sửa → người dùng sửa → ngữ cảnh cho trợ lý có bản mới + lỗi sửa', () => {
    const a = service.applyReply(conv, 'ok <artifact type="doc" title="GDD">Tên: A</artifact>')
    expect(a.text).toBe('ok')
    const id = a.artifacts[0].id!
    expect(
      service.applyReply(
        conv,
        '<artifact-edit title="gdd"><find>A</find><replace>B</replace></artifact-edit>'
      ).artifacts[0].version
    ).toBe(2)
    service.saveUserVersion(id, 'Tên: C')
    const bad = service.applyReply(
      conv,
      '<artifact-edit title="GDD"><find>Z</find><replace>B</replace></artifact-edit>'
    )
    expect(bad.artifacts[0].error).toBe('not_found')
    const ctx = service.contextFor(conv)
    expect(ctx).toContain('"GDD" (doc, v3)')
    expect(ctx).toContain('Người dùng vừa tự sửa "GDD" thành v3')
    expect(ctx).toContain('Tên: C')
    expect(ctx).toContain('không tìm thấy đoạn <find>"Z"</find>')
    expect(service.contextFor(conv)).not.toContain('vừa tự sửa') // chỉ báo một lần
    expect(service.restore(id, 1)?.version).toBe(4)
    expect(service.content(id)?.version.content).toBe('Tên: A')
  })

  it('protocol: CSP chặn mạng ở header; JSON nhúng không thoát được khỏi <script>', async () => {
    const a = service.applyReply(
      conv,
      '<artifact type="doc" title="X"></script><script>alert(1)</script></artifact>'
    ).artifacts[0]
    const res = await handleArtifactRequest(`mmc-artifact://view/${a.id}/1`, {
      service,
      libDir: '.',
      themes: () => []
    })
    expect(res.headers.get('content-security-policy')).toBe(ARTIFACT_CSP)
    expect(ARTIFACT_CSP).toContain("connect-src 'none'")
    const html = await res.text()
    expect(html).not.toContain('</script><script>alert(1)')
    expect(
      (
        await handleArtifactRequest('mmc-artifact://lib/../../secret.txt', {
          service,
          libDir: '.',
          themes: () => []
        })
      ).status
    ).toBe(404)
    expect(
      (
        await handleArtifactRequest(`mmc-artifact://view/${crypto.randomUUID()}/1`, {
          service,
          libDir: '.',
          themes: () => []
        })
      ).status
    ).toBe(404)
    expect(artifactDocument('html', 't', '<html><head><title>x</title></head></html>', [])).toMatch(
      /<head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"/
    )
  })
})
