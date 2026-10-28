import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, stat } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Attachment, PickAttachmentsResult, StoredAttachment } from '@shared/types'

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
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

/**
 * Giữ file người dùng vừa chọn (đã copy vào workspace) cho tới khi gửi tin nhắn.
 * Renderer chỉ cầm ID; đường dẫn thật chỉ nằm ở main.
 */
export class AttachmentStore {
  private pending = new Map<string, StoredAttachment & { addedAt: number }>()

  constructor(private readonly dir: string) {}

  async add(paths: string[]): Promise<PickAttachmentsResult> {
    await mkdir(this.dir, { recursive: true })
    this.prune()
    const attachments: Attachment[] = []
    const rejected: PickAttachmentsResult['rejected'] = []

    for (const source of paths) {
      const name = basename(source)
      const mimeType = mimeFromName(name)
      if (!mimeType) {
        rejected.push({ name, reason: 'unsupported_type' })
        continue
      }
      const info = await stat(source).catch(() => null)
      if (!info?.isFile()) {
        rejected.push({ name, reason: 'not_found' })
        continue
      }
      if (info.size > MAX_ATTACHMENT_BYTES) {
        rejected.push({ name, reason: 'too_large' })
        continue
      }
      const id = randomUUID()
      // Tên file trong workspace chỉ gồm UUID + đuôi → không có ký tự lạ trong prompt/đường dẫn.
      const path = join(this.dir, `${id}${extname(name).toLowerCase()}`)
      await copyFile(source, path)
      const item = { id, name, mimeType, size: info.size, path }
      this.pending.set(id, { ...item, addedAt: Date.now() })
      attachments.push({ id, name, mimeType, size: info.size })
    }
    return { attachments, rejected }
  }

  /** Lấy file đã chọn theo ID (một lần). ID lạ → lỗi. */
  take(ids: string[]): StoredAttachment[] {
    const result = ids.map((id) => {
      const item = this.pending.get(id)
      if (!item) throw new Error('attachment_not_found')
      return item
    })
    for (const id of ids) this.pending.delete(id)
    return result.map(({ addedAt: _addedAt, ...rest }) => rest)
  }

  private prune(): void {
    const cutoff = Date.now() - PENDING_TTL_MS
    for (const [id, item] of this.pending) if (item.addedAt < cutoff) this.pending.delete(id)
  }
}
