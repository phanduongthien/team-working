import { describe, expect, it, vi } from 'vitest'
import { EMPTY_RECENT, extractEmojis, isEmoji, type MediaItem, type RecentStore } from '@shared/expressive'
import { recordUse, retentionScore } from '../recent'
import { ExpressiveService } from '../service'
import type { GiphyClient } from '../giphy'
import type { StickerLibrary } from '../stickers'

const DAY = 24 * 60 * 60 * 1000

describe('emoji trong chữ', () => {
  it('tách emoji, giữ chuỗi ZWJ / màu da / cờ nguyên vẹn, bỏ chữ và số', () => {
    expect(extractEmojis('chào 😀 nha 👍🏽 và 👨‍👩‍👧 🇻🇳 !! 1 2')).toEqual(['😀', '👍🏽', '👨‍👩‍👧', '🇻🇳'])
    expect(extractEmojis('không có emoji')).toEqual([])
    expect(extractEmojis('❤️❤️')).toEqual(['❤️', '❤️'])
  })
  it('isEmoji từ chối chữ thường', () => {
    expect(isEmoji('a')).toBe(false)
    expect(isEmoji('😀a')).toBe(false)
    expect(isEmoji('🔥')).toBe(true)
  })
})

describe('recordUse', () => {
  it('mới dùng xếp đầu, dùng lại thì đưa lên đầu và tăng số lần', () => {
    let list = recordUse([], ['😀', '🔥'], 1000, 40)
    expect(list.map((e) => e.key)).toEqual(['🔥', '😀'])
    list = recordUse(list, ['😀'], 2000, 40)
    expect(list.map((e) => e.key)).toEqual(['😀', '🔥'])
    expect(list[0].count).toBe(2)
  })

  it('đầy: loại mục ít dùng; mục hay dùng được giữ lâu hơn dù cũ hơn', () => {
    const now = 100 * DAY
    // 🔥 dùng 10 lần, cách đây 10 ngày (cũ nhất); 3 mục khác mỗi cái 1 lần, mới hơn.
    const list = [
      { key: '🔥', count: 10, last: now - 10 * DAY },
      { key: '😀', count: 1, last: now - 2 * DAY },
      { key: '😢', count: 1, last: now - 1 * DAY },
      { key: '🙏', count: 1, last: now - 3 * DAY }
    ]
    const next = recordUse(list, ['🎉'], now, 4)
    expect(next.map((e) => e.key)).toEqual(['🎉', '😢', '😀', '🔥'])
    expect(retentionScore(list[0], now)).toBeGreaterThan(retentionScore(list[1], now))
  })

  it('không bao giờ loại mục vừa dùng, không vượt giới hạn', () => {
    const next = recordUse([], ['1️⃣', '😀', '🔥', '🎉'], 0, 2)
    expect(next).toHaveLength(2)
  })
})

describe('ExpressiveService — gần đây', () => {
  const make = (initial: RecentStore = EMPTY_RECENT) => {
    let store: RecentStore = initial
    const byIds = vi.fn(async (_kind: string, ids: string[]) =>
      ids.map(
        (id): MediaItem => ({ kind: 'gif', source: 'giphy', id, title: id, url: `https://media.giphy.com/${id}.gif`, width: 1, height: 1 })
      )
    )
    const service = new ExpressiveService({
      getSettings: () => ({ mode: 'off', max: 'high' }),
      setSettings: vi.fn(),
      getStats: () => null,
      setStats: vi.fn(),
      getFavorites: () => [],
      setFavorites: vi.fn(),
      getRecent: () => store,
      setRecent: (v) => (store = v),
      giphy: { hasKey: () => true, byIds } as unknown as GiphyClient,
      giphyKeySource: () => 'user',
      stickers: { get: () => null, list: () => [], userDir: 'x' } as unknown as StickerLibrary,
      loadSkill: async () => undefined,
      log: { warn: vi.fn() },
      now: () => 5000
    })
    return { service, byIds, get: () => store }
  }

  it('emoji: bỏ chuỗi không phải emoji; xoá theo loại', async () => {
    const { service, get } = make()
    service.recordEmoji(['😀', 'abc', '🔥'])
    expect((await service.recent()).emoji).toEqual(['🔥', '😀'])
    service.clearRecent('emoji')
    expect(get().emoji).toEqual([])
  })

  it('GIF đã gửi: lấy từ bộ nhớ, không gọi lại GIPHY; mục mất cache thì hỏi theo id', async () => {
    const { service, byIds, get } = make()
    service.recordMedia({ kind: 'gif', source: 'giphy', id: 'a', title: 'a', url: 'https://media.giphy.com/a.gif', width: 1, height: 1 })
    expect((await service.recent()).gif.map((m) => m.id)).toEqual(['a'])
    expect(byIds).not.toHaveBeenCalled()
    expect(get().sticker).toEqual([])

    // Lần mở app sau: store có sẵn mục nhưng cache trống → hỏi GIPHY theo id.
    const fresh = make({ ...EMPTY_RECENT, gif: [{ key: 'giphy:b', count: 1, last: 1 }] })
    expect((await fresh.service.recent()).gif.map((m) => m.id)).toEqual(['b'])
    expect(fresh.byIds).toHaveBeenCalledWith('gif', ['b'])
  })
})
