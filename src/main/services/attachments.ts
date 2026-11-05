import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Attachment, PickAttachmentsResult, StoredAttachment } from '@shared/types'
import { extFor, modelCopy, sniffImage, thumbnail, type ImagePort } from './images'

/** File thường (PDF, chữ, code). */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
/** Ảnh: giữ bản gốc tới 30 MB (ảnh chụp 4K), bản gửi Claude được thu nhỏ riêng. */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf'
}

/** File chữ gửi được (code, tài liệu, dữ liệu). */
const TEXT_EXTS = [
  '.txt', '.md', '.csv', '.json', '.yaml', '.yml', '.xml', '.log', '.html', '.css', '.sql',
  '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.h', '.cpp', '.cs', '.go', '.rs', '.php', '.rb', '.kt', '.swift', '.sh', '.ps1'
]

export const ATTACHMENT_EXTENSIONS = [...Object.keys(MIME_BY_EXT), ...TEXT_EXTS].map((e) => e.slice(1))

export function mimeFromName(name: string): string | null {
  const ext = extname(name).toLowerCase()
  if (MIME_BY_EXT[ext]) return MIME_BY_EXT[ext]
  return TEXT_EXTS.includes(ext) ? 'text/plain' : null
}

const PENDING_TTL_MS = 60 * 60 * 1000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Clipboard của Windows (Electron `clipboard`) — tách ra để test được. */
export type ClipboardPort = {
  /** Ảnh bitmap trong clipboard (Win+Shift+S, Print Screen, copy từ Photoshop/trình duyệt) dạng PNG; null nếu không có. */
  readImagePng(): Promise<Buffer | null>
  /** File copy từ File Explorer. */
  readFilePaths(): Promise<string[]>
}

const stamp = (d = new Date()): string =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-` +
  `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}${String(d.getSeconds()).padStart(2, '0')}`

/**
 * Giữ file người dùng vừa chọn / dán / kéo thả (đã copy vào workspace) cho tới khi gửi tin nhắn.
 * Renderer chỉ cầm ID; đường dẫn thật chỉ nằm ở main. Ảnh được nhận dạng theo nội dung; ảnh vượt
 * giới hạn của Claude có thêm bản thu nhỏ `<id>.model.<ext>` — bản gốc vẫn giữ nguyên trong lịch sử.
 */
export class AttachmentStore {
  private pending = new Map<string, StoredAttachment & { addedAt: number }>()

  constructor(
    private readonly dir: string,
    private readonly images?: ImagePort
  ) {}

  /** File chọn qua hộp thoại của main (hoặc copy từ Explorer). */
  async add(paths: string[]): Promise<PickAttachmentsResult> {
    const result: PickAttachmentsResult = { attachments: [], rejected: [] }
    for (const source of paths) {
      const name = basename(source)
      const info = await stat(source).catch(() => null)
      if (!info?.isFile()) {
        result.rejected.push({ name, reason: 'not_found' })
        continue
      }
      if (info.size > MAX_IMAGE_BYTES) {
        result.rejected.push({ name, reason: 'too_large' })
        continue
      }
      await this.ingest({ name, data: await readFile(source) }, result)
    }
    return result
  }

  /** Nội dung file từ renderer (kéo thả, dán). Kích thước đã được zod giới hạn ở IPC. */
  async addBuffers(files: { name: string; data: Buffer }[]): Promise<PickAttachmentsResult> {
    const result: PickAttachmentsResult = { attachments: [], rejected: [] }
    for (const file of files) await this.ingest(file, result)
    return result
  }

  /** Ctrl+V khi trình duyệt không đưa ra File: đọc thẳng clipboard của Windows. */
  async addFromClipboard(clipboard: ClipboardPort): Promise<PickAttachmentsResult> {
    const png = await clipboard.readImagePng()
    if (png) return this.addBuffers([{ name: `anh-dan-${stamp()}.png`, data: png }])
    const paths = await clipboard.readFilePaths()
    return paths.length ? this.add(paths) : { attachments: [], rejected: [] }
  }

  /** Lấy file đã chọn theo ID (một lần). ID lạ → lỗi. */
  take(ids: string[]): StoredAttachment[] {
    const result = ids.map((id) => {
      const item = this.pending.get(id)
      if (!item) throw new Error('attachment_not_found')
      return item
    })
    for (const id of ids) this.pending.delete(id)
    // Thumbnail (data URL) chỉ dùng ở khung soạn tin — không lưu vào DB.
    return result.map(({ addedAt: _addedAt, thumbnail: _thumbnail, ...rest }) => rest)
  }

  isPending(id: string): boolean {
    return this.pending.has(id)
  }

  /**
   * Ảnh xem trước dạng data URL. `thumb`: thumbnail nhỏ; `large`: bản gửi Claude nếu có (≤ 2.576 px),
   * không thì bản gốc. Người gọi phải kiểm tra quyền xem ID này (đang chờ gửi hoặc thuộc hội thoại của mình).
   */
  async preview(id: string, size: 'thumb' | 'large'): Promise<string | null> {
    if (!UUID.test(id)) return null
    const files = (await readdir(this.dir).catch(() => [] as string[])).filter((f) => f.startsWith(`${id}.`))
    const pick =
      size === 'thumb'
        ? files.find((f) => f === `${id}.thumb.jpg`)
        : (files.find((f) => f.startsWith(`${id}.model.`)) ?? files.find((f) => !f.includes('.thumb.') && !f.includes('.model.')))
    if (!pick) return null
    const data = await readFile(join(this.dir, pick))
    const mime = sniffImage(data)
    return mime ? `data:${mime};base64,${data.toString('base64')}` : null
  }

  private async ingest(file: { name: string; data: Buffer }, result: PickAttachmentsResult): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    this.prune()
    const { data } = file
    const name = basename(file.name).slice(0, 200) || 'file'
    const image = sniffImage(data)
    const reject = (reason: string): void => void result.rejected.push({ name, reason })

    let mimeType: string
    let ext: string
    if (image) {
      if (data.length > MAX_IMAGE_BYTES) return reject('too_large')
      mimeType = image
      ext = extFor(image)
    } else {
      const byName = mimeFromName(name)
      // Đuôi ảnh nhưng nội dung không phải ảnh → từ chối (không tin đuôi file).
      if (!byName || byName.startsWith('image/')) return reject('unsupported_type')
      if (byName === 'application/pdf' && data.subarray(0, 5).toString('latin1') !== '%PDF-') return reject('unsupported_type')
      if (data.length > MAX_ATTACHMENT_BYTES) return reject('too_large')
      mimeType = byName
      ext = extname(name).toLowerCase()
    }

    const id = randomUUID()
    // Tên file trong workspace chỉ gồm UUID + đuôi → không có ký tự lạ trong prompt/đường dẫn.
    const path = join(this.dir, `${id}${ext}`)
    await writeFile(path, data)
    const stored: StoredAttachment = { id, name, mimeType, size: data.length, path }

    if (image && this.images) {
      try {
        const copy = modelCopy(this.images, data, image)
        if (copy) {
          stored.modelPath = join(this.dir, `${id}.model${extFor(copy.mime)}`)
          stored.modelMimeType = copy.mime
          await writeFile(stored.modelPath, copy.data)
        }
        const thumb = thumbnail(this.images, data)
        if (thumb) {
          await writeFile(join(this.dir, `${id}.thumb.jpg`), thumb)
          stored.thumbnail = `data:image/jpeg;base64,${thumb.toString('base64')}`
        }
      } catch (err) {
        await Promise.all((await readdir(this.dir)).filter((f) => f.startsWith(`${id}.`)).map((f) => rm(join(this.dir, f), { force: true })))
        return reject((err as Error).message === 'image_too_large' ? 'too_large' : 'unsupported_type')
      }
    }

    this.pending.set(id, { ...stored, addedAt: Date.now() })
    const { path: _p, modelPath: _m, modelMimeType: _mm, ...visible } = stored
    result.attachments.push(visible as Attachment)
  }

  private prune(): void {
    const cutoff = Date.now() - PENDING_TTL_MS
    for (const [id, item] of this.pending) if (item.addedAt < cutoff) this.pending.delete(id)
  }
}

