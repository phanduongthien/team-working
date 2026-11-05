import { mkdtempSync, readdirSync, readFileSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ActionLog, dayKey, daysToPrune } from '../actionLog'
import { describeCapture, orderDisplays, planCapture, type DisplayInfo } from '../screen'

const HIDPI: DisplayInfo = { id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1.5, primary: true }

describe('planCapture', () => {
  it('cả màn hình: chụp đủ pixel vật lý, thu nhỏ về 1280 ngang', () => {
    const p = planCapture(HIDPI)
    expect(p.source).toEqual({ width: 2880, height: 1620 })
    expect(p.crop).toEqual({ x: 0, y: 0, width: 2880, height: 1620 })
    expect(p.output).toEqual({ width: 1280, height: 720 })
    expect(p.region).toEqual({ x: 0, y: 0, width: 1920, height: 1080 })
  })

  it('vùng nhỏ: cắt theo pixel vật lý, không phóng to quá pixel thật', () => {
    const p = planCapture(HIDPI, { region: { x: 100, y: 50, width: 400, height: 200 } })
    expect(p.crop).toEqual({ x: 150, y: 75, width: 600, height: 300 })
    expect(p.output).toEqual({ width: 600, height: 300 })
  })

  it('vùng tràn ra ngoài màn hình bị cắt gọn; màn hình phụ dùng toạ độ toàn cục cho region', () => {
    const second: DisplayInfo = { id: 2, bounds: { x: -1280, y: 0, width: 1280, height: 1024 }, scaleFactor: 1, primary: false }
    const p = planCapture(second, { region: { x: 1200, y: 1000, width: 500, height: 500 } })
    expect(p.crop).toEqual({ x: 1200, y: 1000, width: 80, height: 24 })
    expect(p.region).toEqual({ x: -80, y: 1000, width: 80, height: 24 })
  })

  it('max_width bị giới hạn trong [200, 1920]', () => {
    expect(planCapture(HIDPI, { maxWidth: 50 }).output.width).toBe(200)
    expect(planCapture(HIDPI, { maxWidth: 99999 }).output.width).toBe(1920)
  })

  it('mô tả có tỉ lệ đổi toạ độ ảnh → màn hình', () => {
    const text = describeCapture(0, HIDPI, planCapture(HIDPI), 2)
    expect(text).toContain('Màn hình 1/2 (chính): 1920x1080 logic, scale 150%')
    expect(text).toContain('1 px ảnh ≈ 1.50 px logic')
  })

  it('orderDisplays: chính trước, rồi trái → phải', () => {
    const a = { ...HIDPI, id: 2, primary: false, bounds: { ...HIDPI.bounds, x: 1920 } }
    const b = { ...HIDPI, id: 3, primary: false, bounds: { ...HIDPI.bounds, x: -1920 } }
    expect(orderDisplays([a, HIDPI, b]).map((d) => d.id)).toEqual([1, 3, 2])
  })
})

describe('ActionLog', () => {
  let dir: string
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('ghi jsonl theo ngày kèm file ảnh', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mmc-actions-'))
    const at = new Date(2026, 10, 5, 14, 30, 15)
    const log = new ActionLog(dir, 7, () => at)
    await log.record({ conversationId: 'c1', tool: 'screenshot', input: { display: 1 }, ok: true, summary: 'Màn hình 1', image: Buffer.from('PNG') })
    await log.record({ conversationId: 'c1', tool: 'list_displays', input: {}, ok: true, summary: '2 màn hình' })
    const day = join(dir, '2026-11-05')
    const lines = readFileSync(join(day, 'actions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ tool: 'screenshot', ok: true, image: expect.stringMatching(/^143015-screenshot-.+\.png$/) })
    expect(lines[1]).not.toHaveProperty('image')
    expect(readFileSync(join(day, lines[0].image))).toEqual(Buffer.from('PNG'))
  })

  it('xoá thư mục ngày cũ hơn số ngày giữ lại', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mmc-actions-'))
    for (const d of ['2026-10-28', '2026-10-29', '2026-11-04', 'khac']) mkdirSync(join(dir, d))
    await new ActionLog(dir, 7, () => new Date(2026, 10, 5)).prune()
    // Giữ 7 ngày tính tới 05/11 → mốc 30/10; thư mục không phải ngày thì không đụng tới.
    expect(readdirSync(dir).sort()).toEqual(['2026-11-04', 'khac'])
  })

  it('dayKey / daysToPrune', () => {
    expect(dayKey(new Date(2026, 0, 3))).toBe('2026-01-03')
    expect(daysToPrune(['2026-10-29', '2026-10-30', 'x'], new Date(2026, 10, 5), 7)).toEqual(['2026-10-29'])
  })
})
