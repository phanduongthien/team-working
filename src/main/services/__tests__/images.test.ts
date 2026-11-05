import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttachmentStore, type ClipboardPort } from '../attachments'
import { filePathsFromUriList } from '../electronClipboard'
import { MODEL_MAX_BYTES, MODEL_MAX_EDGE, modelCopy, sniffImage, type ImagePort } from '../images'

vi.mock('electron', () => ({ clipboard: {} }))

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)])
const BMP = Buffer.concat([Buffer.from('BM'), Buffer.alloc(32)])
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(8)])
const GIF = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(8)])

/** ImagePort giả: kích thước "đọc" từ map; encode trả buffer có độ dài theo cạnh để thử nhánh nén. */
function fakePort(sizes: Map<Buffer, { width: number; height: number } | null>, bytesFor = (edge: number, f: string, q?: number) => edge * (f === 'png' ? 4000 : (q ?? 85) * 20)) {
  const calls: { edge: number; format: string; quality?: number }[] = []
  const port: ImagePort = {
    size: (d) => sizes.get(d) ?? null,
    encode: (_d, edge, format, quality) => {
      calls.push({ edge, format, quality })
      const head = format === 'png' ? PNG.subarray(0, 8) : JPEG.subarray(0, 4)
      return Buffer.concat([head, Buffer.alloc(Math.max(0, bytesFor(edge, format, quality) - head.length))])
    }
  }
  return { port, calls }
}

describe('sniffImage', () => {
  it('nhận dạng theo nội dung, không theo tên', () => {
    expect(sniffImage(PNG)).toBe('image/png')
    expect(sniffImage(JPEG)).toBe('image/jpeg')
    expect(sniffImage(GIF)).toBe('image/gif')
    expect(sniffImage(WEBP)).toBe('image/webp')
    expect(sniffImage(BMP)).toBe('image/bmp')
    expect(sniffImage(Buffer.from('hello world'))).toBeNull()
  })
})

describe('modelCopy', () => {
  it('ảnh nhỏ, định dạng Claude nhận → dùng bản gốc', () => {
    const { port, calls } = fakePort(new Map([[PNG, { width: 1920, height: 1080 }]]))
    expect(modelCopy(port, PNG, 'image/png')).toBeNull()
    expect(calls).toEqual([])
  })

  it('cạnh dài > 2576 px → thu nhỏ về 2576, giữ PNG nếu đủ nhẹ', () => {
    const { port, calls } = fakePort(new Map([[PNG, { width: 3840, height: 2160 }]]), (edge) => edge * 100)
    const copy = modelCopy(port, PNG, 'image/png')!
    expect(copy.mime).toBe('image/png')
    expect(calls).toEqual([{ edge: MODEL_MAX_EDGE, format: 'png', quality: undefined }])
  })

  it('PNG thu nhỏ vẫn > 5 MB → chuyển JPEG, giảm chất lượng dần', () => {
    const { port, calls } = fakePort(new Map([[PNG, { width: 5000, height: 5000 }]]), (_edge, f, q) =>
      f === 'png' ? MODEL_MAX_BYTES + 1 : q === 85 ? MODEL_MAX_BYTES + 1 : MODEL_MAX_BYTES - 1
    )
    const copy = modelCopy(port, PNG, 'image/png')!
    expect(copy.mime).toBe('image/jpeg')
    expect(calls.map((c) => `${c.format}:${c.quality ?? ''}`)).toEqual(['png:', 'jpeg:85', 'jpeg:70'])
    expect(copy.data.length).toBeLessThanOrEqual(MODEL_MAX_BYTES)
  })

  it('ảnh JPEG nặng nhưng nhỏ về kích thước → nén JPEG, không đổi sang PNG', () => {
    const heavy = Buffer.concat([JPEG, Buffer.alloc(MODEL_MAX_BYTES)])
    const { port, calls } = fakePort(new Map([[heavy, { width: 2000, height: 1500 }]]), () => 1000)
    expect(modelCopy(port, heavy, 'image/jpeg')!.mime).toBe('image/jpeg')
    expect(calls[0].format).toBe('jpeg')
  })

  it('BMP luôn đổi sang PNG (Claude không nhận BMP)', () => {
    const { port } = fakePort(new Map([[BMP, { width: 800, height: 600 }]]), () => 1000)
    expect(modelCopy(port, BMP, 'image/bmp')!.mime).toBe('image/png')
  })

  it('không giải mã được: WebP/GIF nhỏ thì gửi thẳng; quá nặng thì báo không hỗ trợ', () => {
    const { port } = fakePort(new Map())
    expect(modelCopy(port, WEBP, 'image/webp')).toBeNull()
    const huge = Buffer.concat([WEBP, Buffer.alloc(MODEL_MAX_BYTES)])
    expect(() => modelCopy(port, huge, 'image/webp')).toThrow('image_unsupported')
  })

  it('nén mãi vẫn quá nặng → image_too_large', () => {
    const { port } = fakePort(new Map([[PNG, { width: 8000, height: 8000 }]]), () => MODEL_MAX_BYTES + 1)
    expect(() => modelCopy(port, PNG, 'image/png')).toThrow('image_too_large')
  })
})

describe('AttachmentStore (ảnh)', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mmc-att-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const bigPng = Buffer.concat([PNG, Buffer.alloc(100)])
  const sizes = new Map<Buffer, { width: number; height: number }>([
    [PNG, { width: 400, height: 300 }],
    [bigPng, { width: 4000, height: 3000 }]
  ])
  const port: ImagePort = {
    size: (d) => [...sizes.entries()].find(([k]) => k.equals(d))?.[1] ?? null,
    encode: (_d, edge, format) => Buffer.concat([format === 'png' ? PNG.subarray(0, 8) : JPEG.subarray(0, 4), Buffer.from(`edge=${edge}`)])
  }

  it('dán ảnh nhỏ: lưu gốc + thumbnail, không cần bản cho Claude; renderer chỉ thấy ID + thumbnail', async () => {
    const store = new AttachmentStore(dir, port)
    const { attachments, rejected } = await store.addBuffers([{ name: 'shot.png', data: PNG }])
    expect(rejected).toEqual([])
    const [a] = attachments
    expect(a).toMatchObject({ name: 'shot.png', mimeType: 'image/png', size: PNG.length, thumbnail: expect.stringMatching(/^data:image\/jpeg;base64,/) })
    expect(a).not.toHaveProperty('path')
    expect(readdirSync(dir).sort()).toEqual([`${a.id}.png`, `${a.id}.thumb.jpg`].sort())
    const [stored] = store.take([a.id])
    expect(stored.modelPath).toBeUndefined()
    expect(stored).not.toHaveProperty('thumbnail')
  })

  it('ảnh lớn: thêm bản cho Claude (modelPath) — bản gốc giữ nguyên', async () => {
    const store = new AttachmentStore(dir, port)
    const [a] = (await store.addBuffers([{ name: 'big.png', data: bigPng }])).attachments
    const [stored] = store.take([a.id])
    expect(stored.path.endsWith(`${a.id}.png`)).toBe(true)
    expect(readFileSync(stored.path)).toEqual(bigPng)
    expect(stored.modelPath!.endsWith(`${a.id}.model.png`)).toBe(true)
    expect(readFileSync(stored.modelPath!).toString('latin1')).toContain(`edge=${MODEL_MAX_EDGE}`)
    expect(stored.modelMimeType).toBe('image/png')
  })

  it('đuôi .png nhưng nội dung không phải ảnh → từ chối; file chữ / PDF vẫn nhận', async () => {
    const store = new AttachmentStore(dir, port)
    const res = await store.addBuffers([
      { name: 'fake.png', data: Buffer.from('MZ not an image') },
      { name: 'notes.md', data: Buffer.from('# Ghi chú') },
      { name: 'doc.pdf', data: Buffer.from('%PDF-1.7 ...') },
      { name: 'bad.pdf', data: Buffer.from('not pdf') },
      { name: 'virus.exe', data: Buffer.from('MZ') }
    ])
    expect(res.attachments.map((a) => a.name)).toEqual(['notes.md', 'doc.pdf'])
    expect(res.rejected).toEqual([
      { name: 'fake.png', reason: 'unsupported_type' },
      { name: 'bad.pdf', reason: 'unsupported_type' },
      { name: 'virus.exe', reason: 'unsupported_type' }
    ])
  })

  it('ảnh không nén nổi xuống giới hạn → từ chối và dọn file', async () => {
    const tooBig: ImagePort = { size: () => ({ width: 8000, height: 8000 }), encode: () => Buffer.alloc(MODEL_MAX_BYTES + 1) }
    const store = new AttachmentStore(dir, tooBig)
    const res = await store.addBuffers([{ name: 'huge.png', data: PNG }])
    expect(res.rejected).toEqual([{ name: 'huge.png', reason: 'too_large' }])
    expect(readdirSync(dir)).toEqual([])
  })

  it('clipboard: ảnh trước; không có ảnh thì lấy file copy từ Explorer (nhiều file)', async () => {
    const store = new AttachmentStore(dir, port)
    const withImage: ClipboardPort = { readImagePng: async () => PNG, readFilePaths: async () => [] }
    const r1 = await store.addFromClipboard(withImage)
    expect(r1.attachments[0]).toMatchObject({ mimeType: 'image/png', name: expect.stringMatching(/^anh-dan-\d{8}-\d{6}\.png$/) })

    const f1 = join(dir, 'a.png')
    const f2 = join(dir, 'b.md')
    writeFileSync(f1, PNG)
    writeFileSync(f2, 'hello')
    const withFiles: ClipboardPort = { readImagePng: async () => null, readFilePaths: async () => [f1, f2] }
    const r2 = await store.addFromClipboard(withFiles)
    expect(r2.attachments.map((a) => a.name)).toEqual(['a.png', 'b.md'])

    const empty: ClipboardPort = { readImagePng: async () => null, readFilePaths: async () => [] }
    expect(await store.addFromClipboard(empty)).toEqual({ attachments: [], rejected: [] })
  })

  it('preview: thumb / large (bản cho Claude nếu có); ID lạ → null', async () => {
    const store = new AttachmentStore(dir, port)
    const [small] = (await store.addBuffers([{ name: 's.png', data: PNG }])).attachments
    const [big] = (await store.addBuffers([{ name: 'b.png', data: bigPng }])).attachments
    expect(await store.preview(small.id, 'thumb')).toMatch(/^data:image\/jpeg;base64,/)
    expect(await store.preview(small.id, 'large')).toBe(`data:image/png;base64,${PNG.toString('base64')}`)
    expect(Buffer.from((await store.preview(big.id, 'large'))!.split(',')[1], 'base64').toString('latin1')).toContain('edge=2576')
    expect(await store.preview('../../etc/passwd', 'large')).toBeNull()
    expect(await store.preview('00000000-0000-4000-8000-000000000000', 'large')).toBeNull()
    expect(store.isPending(small.id)).toBe(true)
  })
})

describe('filePathsFromUriList', () => {
  it('đọc nhiều file, bỏ chú thích và URI không phải file', () => {
    const list = ['# comment', 'file:///C:/Users/An/Pictures/a%20b.png', 'https://example.com/x.png', 'file:///D:/game/shot.jpg', ''].join('\r\n')
    expect(filePathsFromUriList(list)).toEqual(['C:\\Users\\An\\Pictures\\a b.png', 'D:\\game\\shot.jpg'])
  })
})
