import { readFileSync } from 'node:fs'
import type { MediaItem, MediaKind } from '@shared/expressive'

export type FetchLike = (
  url: string
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

export type GiphyDeps = {
  getKey(): string | null
  fetch: FetchLike
  /** Chỉ test mới đổi (server GIPHY giả). */
  baseUrl?: string
}

type GiphyImage = { url?: string; webp?: string; width?: string; height?: string }
type GiphyGif = { id?: string; title?: string; images?: { fixed_height?: GiphyImage } }

/** Chỉ nhận ảnh https từ máy chủ của GIPHY — không bao giờ hiển thị ảnh từ trang lạ. */
export function isGiphyMediaUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return (
      u.protocol === 'https:' && (u.hostname === 'giphy.com' || u.hostname.endsWith('.giphy.com'))
    )
  } catch {
    return false
  }
}

export function toItem(kind: MediaKind, g: GiphyGif): MediaItem | null {
  const img = g.images?.fixed_height
  const url = img?.webp || img?.url
  if (!g.id || !url || !isGiphyMediaUrl(url)) return null
  return {
    kind,
    source: 'giphy',
    id: g.id,
    title: (g.title ?? '').slice(0, 120),
    url,
    width: Number(img?.width) || 200,
    height: Number(img?.height) || 200
  }
}

export class GiphyError extends Error {}

/** Đọc GIPHY_API_KEY từ file .env (chỉ bản dev). Không có / lỗi → null. */
export function readEnvKey(file: string): string | null {
  try {
    const line = readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .find((l) => /^\s*GIPHY_API_KEY\s*=/.test(l))
    const value = line
      ?.split('=')
      .slice(1)
      .join('=')
      .trim()
      .replace(/^['"]|['"]$/g, '')
    return value || null
  } catch {
    return null
  }
}

/** Gọi GIPHY từ main — key không bao giờ xuống renderer. */
export class GiphyClient {
  private readonly base: string

  constructor(private readonly deps: GiphyDeps) {
    this.base = deps.baseUrl ?? 'https://api.giphy.com/v1'
  }

  hasKey(): boolean {
    return !!this.deps.getKey()
  }

  private async get(
    path: string,
    params: Record<string, string>,
    kind: MediaKind
  ): Promise<MediaItem[]> {
    const key = this.deps.getKey()
    if (!key) throw new GiphyError('giphy_no_key')
    const qs = new URLSearchParams({ api_key: key, rating: 'pg', ...params })
    let res: Awaited<ReturnType<FetchLike>>
    try {
      res = await this.deps.fetch(`${this.base}${path}?${qs}`)
    } catch {
      throw new GiphyError('giphy_network')
    }
    if (res.status === 401 || res.status === 403) throw new GiphyError('giphy_bad_key')
    if (res.status === 429) throw new GiphyError('giphy_rate_limited')
    if (!res.ok) throw new GiphyError('giphy_network')
    const body = (await res.json()) as { data?: GiphyGif[] | GiphyGif }
    const list = Array.isArray(body.data) ? body.data : body.data ? [body.data] : []
    return list.map((g) => toItem(kind, g)).filter((x): x is MediaItem => !!x)
  }

  search(kind: MediaKind, q: string, offset = 0, limit = 24): Promise<MediaItem[]> {
    return this.get(
      `/${kind === 'gif' ? 'gifs' : 'stickers'}/search`,
      { q, offset: String(offset), limit: String(limit), lang: 'vi' },
      kind
    )
  }

  trending(kind: MediaKind, offset = 0, limit = 24): Promise<MediaItem[]> {
    return this.get(
      `/${kind === 'gif' ? 'gifs' : 'stickers'}/trending`,
      { offset: String(offset), limit: String(limit) },
      kind
    )
  }

  /** Lấy lại theo ID (yêu thích, tin nhắn người dùng gửi) — không nhận URL từ renderer. */
  async byIds(kind: MediaKind, ids: string[]): Promise<MediaItem[]> {
    if (ids.length === 0) return []
    return this.get('/gifs', { ids: ids.join(',') }, kind)
  }

  /** GIF/sticker cho thẻ của Mizuki: chọn ngẫu nhiên trong vài kết quả đầu để đỡ lặp. */
  async pick(kind: MediaKind, query: string, random = Math.random): Promise<MediaItem | null> {
    const items = await this.search(kind, query, 0, 5)
    return items.length ? items[Math.floor(random() * items.length)] : null
  }
}
