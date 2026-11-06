import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import type { MediaItem } from '@shared/expressive'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml'
}
const MAX_BYTES = 5 * 1024 * 1024

/**
 * Sticker local: bộ mặc định đóng gói kèm app (chỉ đọc, id `mizuki/<file>`) + thư mục người dùng tự chép vào
 * (id `<thư mục con>/<file>` hoặc `<file>`). Id luôn được kiểm tra nằm trong thư mục gốc — không đọc file ngoài.
 */
export class StickerLibrary {
  constructor(
    private readonly builtinDir: string,
    readonly userDir: string
  ) {}

  ensureUserDir(): void {
    mkdirSync(this.userDir, { recursive: true })
  }

  private scan(root: string, prefix: string): MediaItem[] {
    if (!existsSync(root)) return []
    const out: MediaItem[] = []
    const walk = (dir: string, depth: number): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory() && depth === 0) walk(full, 1)
        else if (entry.isFile() && MIME[extname(entry.name).toLowerCase()]) {
          const rel = relative(root, full).split(sep).join('/')
          out.push({
            kind: 'sticker',
            source: 'local',
            id: prefix + rel,
            title: rel.replace(/\.[^.]+$/, ''),
            url: '',
            width: 160,
            height: 160
          })
        }
      }
    }
    walk(root, 0)
    return out.sort((a, b) => a.id.localeCompare(b.id))
  }

  list(): MediaItem[] {
    return [...this.scan(this.builtinDir, 'mizuki/'), ...this.scan(this.userDir, '')]
  }

  /** Đường dẫn thật của id, hoặc null nếu id thoát khỏi thư mục / không tồn tại. */
  resolve(id: string): string | null {
    if (id.includes('\0') || id.includes('..')) return null
    const [root, rel] = id.startsWith('mizuki/')
      ? [this.builtinDir, id.slice(7)]
      : [this.userDir, id]
    const full = resolve(root, rel)
    if (!full.startsWith(resolve(root) + sep) || !MIME[extname(full).toLowerCase()]) return null
    return existsSync(full) && statSync(full).isFile() ? full : null
  }

  get(id: string): MediaItem | null {
    return this.resolve(id) ? (this.list().find((s) => s.id === id) ?? null) : null
  }

  /** Thẻ [[sticker:local/tên]] của Mizuki: khớp theo tên file (không phân biệt hoa thường, bỏ đuôi). */
  findByName(name: string): MediaItem | null {
    const n = name.toLowerCase().replace(/\.[^.]+$/, '')
    return (
      this.list().find(
        (s) => s.title.toLowerCase() === n || s.title.toLowerCase().split('/').pop() === n
      ) ?? null
    )
  }

  /** Data URL để renderer hiển thị (renderer không đọc file trực tiếp). */
  dataUrl(id: string): string | null {
    const full = this.resolve(id)
    if (!full || statSync(full).size > MAX_BYTES) return null
    return `data:${MIME[extname(full).toLowerCase()]};base64,${readFileSync(full).toString('base64')}`
  }
}
