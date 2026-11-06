import {
  minLevel,
  type ExpressiveSettings,
  type ExpressiveStatus,
  type MediaItem,
  type MediaKind,
  type MediaRef,
  type MediaSearchResult,
  type MessageMedia
} from '@shared/expressive'
import {
  afterReply,
  expressivePrompt,
  initialStats,
  planTurn,
  recordReaction,
  recordUserMessage,
  stepAuto,
  trendOf,
  type AffinityStats,
  type TurnPlan
} from './affinity'
import { GiphyError, type GiphyClient } from './giphy'
import type { StickerLibrary } from './stickers'
import { limitEmoji, parseExpressTags } from './tags'

export type ExpressiveDeps = {
  getSettings(): ExpressiveSettings
  setSettings(value: ExpressiveSettings): void
  getStats(): AffinityStats | null
  setStats(value: AffinityStats): void
  getFavorites(): MediaRef[]
  setFavorites(list: MediaRef[]): void
  giphy: GiphyClient
  /** Nguồn key GIPHY đang dùng: .env (chỉ bản dev) hay key người dùng dán (DPAPI). */
  giphyKeySource(): 'env' | 'user' | null
  stickers: StickerLibrary
  loadSkill(): Promise<string | undefined>
  log: { warn(msg: string): void }
  now?: () => number
}

export type FinalizedReply = { text: string; reaction: string | null; media: MessageMedia | null }

const MAX_FAVORITES = 200

export class ExpressiveService {
  constructor(private readonly deps: ExpressiveDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private stats(): AffinityStats {
    return this.deps.getStats() ?? initialStats(this.now())
  }

  status(): ExpressiveStatus {
    const settings = this.deps.getSettings()
    const stats = this.stats()
    return {
      settings,
      autoLevel: minLevel(stats.level, settings.max) as ExpressiveStatus['autoLevel'],
      trend: trendOf(stats),
      giphyKey: this.deps.giphyKeySource(),
      stickersDir: this.deps.stickers.userDir
    }
  }

  setSettings(value: ExpressiveSettings): ExpressiveStatus {
    this.deps.setSettings(value)
    return this.status()
  }

  /** Nút "Đặt lại về Ít" của chế độ tự động — giữ thống kê, chỉ hạ mức và tính lại thời gian chờ. */
  resetAuto(): ExpressiveStatus {
    this.deps.setStats({ ...this.stats(), level: 'low', levelSince: this.now() })
    return this.status()
  }

  /** Người dùng gửi tin: cập nhật độ thân thiết (trên máy), trả về kế hoạch biểu cảm cho câu trả lời. */
  onUserMessage(input: { text: string; media: boolean; mode: string }): TurnPlan {
    const reacted = this.reactedSinceLast
    this.reactedSinceLast = false
    const stats = stepAuto(
      recordUserMessage(
        this.stats(),
        { text: input.text, media: input.media, reacted },
        this.now()
      ),
      this.now()
    )
    this.deps.setStats(stats)
    return planTurn(this.deps.getSettings(), stats, { mode: input.mode, text: input.text })
  }

  private reactedSinceLast = false
  onUserReaction(): void {
    this.reactedSinceLast = true
    this.deps.setStats(recordReaction(this.stats()))
  }

  async promptFor(plan: TurnPlan): Promise<string> {
    const skill = await this.deps.loadSkill()
    if (!skill) return ''
    const local = plan.media ? this.deps.stickers.list().map((s) => s.title) : []
    return expressivePrompt(skill, plan, local)
  }

  /** Câu trả lời xong: bỏ thẻ, chỉ giữ thứ kế hoạch cho phép, tìm GIF/sticker theo TỪ KHOÁ. Lỗi tìm → ẩn đi, không báo. */
  async finalize(raw: string, plan: TurnPlan): Promise<FinalizedReply> {
    const parsed = parseExpressTags(raw)
    const reaction = plan.reaction && parsed.reaction ? parsed.reaction : null
    let media: MessageMedia | null = null
    if (plan.media && parsed.media) {
      try {
        if ('local' in parsed.media) media = this.deps.stickers.findByName(parsed.media.local)
        else if (this.deps.giphy.hasKey())
          media = await this.deps.giphy.pick(parsed.media.kind, parsed.media.query)
      } catch (err) {
        this.deps.log.warn(
          `Không tìm được ${parsed.media.kind} cho Mizuki: ${(err as Error).message}`
        )
      }
    }
    this.deps.setStats(afterReply(this.stats(), { reaction: !!reaction, media: !!media }))
    // Hỏi lỗi kỹ thuật / làm việc nghiêm túc: tối đa 2 emoji — code bảo đảm, không chỉ dựa vào lời nhắc.
    const text = plan.mood === 'serious' ? limitEmoji(parsed.text, 2) : parsed.text
    return { text, reaction, media }
  }

  /** GIF/sticker người dùng chọn: renderer chỉ gửi id, main tự lấy lại thông tin (không nhận URL). */
  async resolve(ref: MediaRef): Promise<MessageMedia | null> {
    if (ref.source === 'local') return this.deps.stickers.get(ref.id)
    const [item] = await this.deps.giphy.byIds(ref.kind, [ref.id])
    return item ?? null
  }

  async search(kind: MediaKind, query: string, offset: number): Promise<MediaSearchResult> {
    try {
      const q = query.trim()
      return {
        items: q
          ? await this.deps.giphy.search(kind, q, offset)
          : await this.deps.giphy.trending(kind, offset)
      }
    } catch (err) {
      return { error: err instanceof GiphyError ? err.message : 'giphy_network' }
    }
  }

  ensureStickersDir(): void {
    this.deps.stickers.ensureUserDir()
  }

  stickers(): MediaItem[] {
    return this.deps.stickers.list()
  }

  stickerData(id: string): string | null {
    return this.deps.stickers.dataUrl(id)
  }

  favoriteRefs(): MediaRef[] {
    return this.deps.getFavorites()
  }

  /** Danh sách yêu thích đầy đủ để hiển thị: GIPHY lấy lại theo ID (không lưu file), local đọc từ thư mục. */
  async favorites(): Promise<MediaItem[]> {
    const refs = this.deps.getFavorites()
    const local = refs
      .filter((r) => r.source === 'local')
      .map((r) => this.deps.stickers.get(r.id))
      .filter((x): x is MediaItem => !!x)
    const giphy: MediaItem[] = []
    for (const kind of ['gif', 'sticker'] as const) {
      const ids = refs.filter((r) => r.source === 'giphy' && r.kind === kind).map((r) => r.id)
      if (ids.length && this.deps.giphy.hasKey()) {
        try {
          giphy.push(...(await this.deps.giphy.byIds(kind, ids)))
        } catch (err) {
          this.deps.log.warn(`Không tải được yêu thích GIPHY: ${(err as Error).message}`)
        }
      }
    }
    const order = (m: MediaItem): number =>
      refs.findIndex((r) => r.source === m.source && r.id === m.id)
    return [...local, ...giphy].sort((a, b) => order(a) - order(b))
  }

  toggleFavorite(ref: MediaRef): MediaRef[] {
    const list = this.deps.getFavorites()
    const exists = list.some((r) => r.source === ref.source && r.id === ref.id)
    const next = exists
      ? list.filter((r) => !(r.source === ref.source && r.id === ref.id))
      : [ref, ...list].slice(0, MAX_FAVORITES)
    this.deps.setFavorites(next)
    return next
  }
}
