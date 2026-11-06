import { create } from 'zustand'
import { isEmoji, type ExpressiveRecent, type RecentKind } from '@shared/expressive'
import { api } from '@renderer/lib/api'
import { coalesce, onSync, optimistic } from '@renderer/lib/sync'

/**
 * Emoji / GIF / sticker dùng gần đây (lưu ở main, chỉ trên máy). Nạp sẵn lúc mở app để bộ chọn mở ra
 * đúng tab ngay; main báo `expressiveRecent` sau mỗi lần dùng (gửi tin, thả cảm xúc, chọn emoji, xoá).
 */
type RecentState = {
  data: ExpressiveRecent | null
  refresh(): Promise<void>
  /** Emoji vừa chọn trong bộ chọn / gõ trong tin — hiện ngay, lưu sau. */
  recordEmoji(emoji: string[]): void
  clear(kind: RecentKind): void
}

const EMPTY: ExpressiveRecent = { emoji: [], gif: [], sticker: [] }

export const useRecent = create<RecentState>((set, get) => {
  const refresh = coalesce(async () => set({ data: await api.expressive.recent() }))
  return {
    data: null,
    refresh,
    recordEmoji: (emoji) => {
      if (emoji.length === 0) return
      const prev = get().data ?? EMPTY
      void optimistic({
        topic: 'expressiveRecent',
        apply: () => {
          const used = [...new Set([...emoji].reverse())]
          set({ data: { ...prev, emoji: [...used, ...prev.emoji.filter((e) => !used.includes(e))].slice(0, 40) } })
        },
        rollback: () => set({ data: prev }),
        save: () => api.expressive.recordEmoji(emoji)
      })
    },
    clear: (kind) => {
      const prev = get().data ?? EMPTY
      void optimistic({
        topic: 'expressiveRecent',
        apply: () => set({ data: { ...prev, [kind]: [] } }),
        rollback: () => set({ data: prev }),
        save: () => api.expressive.clearRecent(kind)
      })
    }
  }
})

/** Bản ≤ 0.4.0-beta.1 lưu emoji gần đây trong localStorage — chuyển sang main một lần rồi xoá. */
const LEGACY_KEY = 'mmc.recentEmojis'
function migrateLegacy(): void {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw === null) return
    localStorage.removeItem(LEGACY_KEY)
    const list = JSON.parse(raw) as unknown
    if (!Array.isArray(list)) return
    const emoji = list.filter((x): x is string => typeof x === 'string' && isEmoji(x)).slice(0, 40)
    // Cũ: mới nhất ở đầu → ghi theo thứ tự ngược để mới nhất vẫn ở đầu.
    if (emoji.length) useRecent.getState().recordEmoji(emoji.reverse())
  } catch {
    // Dữ liệu cũ hỏng → bỏ qua.
  }
}

export function setupRecent(): () => void {
  migrateLegacy()
  void useRecent.getState().refresh()
  return onSync('expressiveRecent', () => useRecent.getState().refresh())
}
