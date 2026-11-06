import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stripExpressTags, type ExpressiveSettings } from '@shared/expressive'
import { chatReactSchema, giphyKeySchema } from '@shared/schemas'
import {
  STEP_UP_MS,
  afterReply,
  contextAdjust,
  emojiCount,
  expressivePrompt,
  initialStats,
  planTurn,
  recordUserMessage,
  stepAuto,
  targetLevel,
  trendOf,
  type AffinityStats
} from '../affinity'
import { GiphyClient, isGiphyMediaUrl, readEnvKey, toItem } from '../giphy'
import { ExpressiveService } from '../service'
import { StickerLibrary } from '../stickers'
import { parseExpressTags } from '../tags'

const SKILL = `---
name: expressive
---
## off
KHONG_EMOJI
## low
MUC_IT
## medium
MUC_VUA
## high
MUC_NHIEU
## serious
NGHIEM_TUC
## sad
BUON
## mimic-more
NHIEU_HON
## mimic-less
IT_HON
## tags
THE_HUONG_DAN`

describe('thẻ biểu cảm', () => {
  it('lấy tối đa 1 reaction + 1 GIF, bỏ hết thẻ khỏi chữ', () => {
    const r = parseExpressTags(
      'Xong rồi nè 🎉 [[react:😂]] [[react:❤️]] [[gif:happy dance]] [[sticker:cat]]'
    )
    expect(r).toEqual({
      text: 'Xong rồi nè 🎉',
      reaction: '😂',
      media: { kind: 'gif', query: 'happy dance' }
    })
  })

  it('KHÔNG BAO GIỜ nhận URL / đường dẫn / tên miền trong thẻ', () => {
    for (const bad of [
      'https://evil.example/x.gif',
      'evil.com cat',
      'C:\\a.png',
      '//x',
      'cat.gif',
      'www.x'
    ]) {
      expect(parseExpressTags(`hi [[gif:${bad}]]`).media).toBeUndefined()
      expect(parseExpressTags(`hi [[sticker:${bad}]]`).media).toBeUndefined()
    }
    expect(parseExpressTags('[[sticker:local/../../secret]]').media).toBeUndefined()
    expect(parseExpressTags('[[sticker:local/vui]]').media).toEqual({
      kind: 'sticker',
      local: 'vui'
    })
  })

  it('thẻ viết sai bị ẩn, không hiện chữ [[...]] thô; reaction phải là 1 emoji', () => {
    const r = parseExpressTags('Chào [[GIF mèo]] bạn [[Emoji:abc]] [[react:abc]] [[sticker: ]]')
    expect(r.text).toBe('Chào  bạn')
    expect(r.reaction).toBeUndefined()
    expect(r.media).toBeUndefined()
    expect(parseExpressTags('[[react:👍🏽]]').reaction).toBe('👍🏽')
  })

  it('đang stream: ẩn cả thẻ gõ dở ở cuối; không đụng [link](x) markdown thường', () => {
    expect(stripExpressTags('Hay quá [[gi', true)).toBe('Hay quá')
    expect(stripExpressTags('Hay quá [', true)).toBe('Hay quá')
    expect(stripExpressTags('xem [docs](https://a.b) nhé')).toBe('xem [docs](https://a.b) nhé')
  })
})

const DAY = 24 * 60 * 60 * 1000
const auto: ExpressiveSettings = { mode: 'auto', max: 'high' }
const chatty = (n: number, days: number, start: number, text = 'haha 😂'): AffinityStats => {
  let s = initialStats(start)
  for (let d = 0; d < days; d++)
    for (let i = 0; i < n; i++)
      s = recordUserMessage(s, { text, media: false, reacted: false }, start + d * DAY)
  return s
}

describe('độ thân thiết (tự động, tăng dần)', () => {
  it('bắt đầu ở "Ít"; tăng TỪNG bậc và phải chờ vài ngày, không nhảy vọt', () => {
    const t0 = Date.UTC(2026, 0, 1)
    let s = chatty(20, 12, t0) // rất thân, hay dùng emoji
    expect(s.level).toBe('low')
    expect(targetLevel(s)).toBe('high')
    expect(trendOf(s)).toBe('up')
    s = stepAuto(s, t0 + 1 * DAY) // chưa đủ 3 ngày kể từ lúc bắt đầu
    expect(s.level).toBe('low')
    s = stepAuto(s, t0 + STEP_UP_MS)
    expect(s.level).toBe('medium')
    s = stepAuto(s, t0 + STEP_UP_MS + DAY)
    expect(s.level).toBe('medium')
    s = stepAuto(s, t0 + 2 * STEP_UP_MS)
    expect(s.level).toBe('high')
  })

  it('người dùng nhắn khô khan → mục tiêu về "Ít"', () => {
    const s = chatty(30, 5, 0, 'ok, gửi file báo cáo')
    expect(targetLevel(s)).toBe('low')
  })

  it('trần do người dùng đặt: tự động không bao giờ vượt "Vừa"', () => {
    const s = { ...chatty(20, 12, 0), level: 'high' as const }
    expect(planTurn({ mode: 'auto', max: 'medium' }, s, { mode: 'free', text: 'hi' }).level).toBe(
      'medium'
    )
    expect(planTurn(auto, s, { mode: 'free', text: 'hi' }).level).toBe('high')
  })

  it('ngữ cảnh ưu tiên: sửa lỗi / chế độ Code → tối đa Ít, không GIF; đang buồn → không GIF', () => {
    expect(
      contextAdjust('high', { mode: 'free', text: 'App bị lỗi khi build, xem giúp' })
    ).toMatchObject({ level: 'low', allowMedia: false, mood: 'serious' })
    expect(contextAdjust('high', { mode: 'code', text: 'hi' })).toMatchObject({ mood: 'serious' })
    expect(contextAdjust('high', { mode: 'free', text: 'hôm nay mình mệt quá' })).toMatchObject({
      allowMedia: false,
      mood: 'sad'
    })
    expect(contextAdjust('high', { mode: 'free', text: 'áp lực ghê' }).mood).toBe('sad')
    expect(contextAdjust('high', { mode: 'free', text: 'đi ăn không' })).toMatchObject({
      level: 'high',
      allowMedia: true
    })
  })

  it('chặn spam: khoảng cách giữa hai lần GIF theo mức', () => {
    let s: AffinityStats = { ...initialStats(0), level: 'medium' }
    const ctx = { mode: 'free', text: 'kể chuyện vui đi' }
    expect(planTurn(auto, s, ctx).media).toBe(true)
    s = afterReply(s, { reaction: true, media: true })
    const plans = [1, 2, 3, 4].map(() => {
      const p = planTurn(auto, s, ctx)
      s = afterReply(s, { reaction: false, media: false })
      return p.media
    })
    expect(plans).toEqual([false, false, false, true]) // "Vừa": 1 GIF mỗi 4 câu
  })

  it('emoji trong chữ: bắt chước người dùng trong trần; tắt thì không emoji', () => {
    const s = { ...initialStats(0), level: 'medium' as const, style: 0.5 }
    expect(emojiCount('haha 😂😂 :)) ^^')).toBe(5)
    expect(planTurn(auto, s, { mode: 'free', text: 'trời ơi 😂😂😂' })).toMatchObject({
      emojiLevel: 'high',
      mimic: 'more'
    })
    expect(
      planTurn({ mode: 'auto', max: 'medium' }, s, { mode: 'free', text: 'trời ơi 😂😂😂' })
        .emojiLevel
    ).toBe('medium')
    const dry = { ...s, style: 0.02 }
    expect(planTurn(auto, dry, { mode: 'free', text: 'gửi lịch họp' })).toMatchObject({
      emojiLevel: 'low',
      mimic: 'less'
    })
    expect(
      planTurn({ mode: 'off', max: 'high' }, s, { mode: 'free', text: '😂😂😂' })
    ).toMatchObject({ emojiLevel: 'off', reaction: false, media: false })
  })

  it('lời nhắc chỉ chứa phần của mức hiện tại + thẻ khi được phép', () => {
    const base = {
      level: 'high' as const,
      emojiLevel: 'high' as const,
      mimic: null,
      mood: 'normal' as const
    }
    const p = expressivePrompt(SKILL, { ...base, reaction: true, media: true }, ['vui'])
    expect(p).toContain('MUC_NHIEU')
    expect(p).toContain('THE_HUONG_DAN')
    expect(p).toContain('local/tên]]): vui')
    expect(p).not.toContain('MUC_IT')
    const quiet = expressivePrompt(
      SKILL,
      { ...base, emojiLevel: 'low', mood: 'serious', reaction: false, media: false },
      []
    )
    expect(quiet).toContain('NGHIEM_TUC')
    expect(quiet).not.toContain('THE_HUONG_DAN')
    expect(
      expressivePrompt(
        SKILL,
        { ...base, level: 'off', emojiLevel: 'off', reaction: false, media: false },
        []
      )
    ).toContain('KHONG_EMOJI')
  })
})

describe('GIPHY', () => {
  const gif = (id: string, url: string) => ({
    id,
    title: `t${id}`,
    images: { fixed_height: { url, width: '200', height: '150' } }
  })

  it('chỉ nhận ảnh https từ *.giphy.com', () => {
    expect(isGiphyMediaUrl('https://media2.giphy.com/media/x/200.gif')).toBe(true)
    for (const bad of [
      'http://media.giphy.com/a.gif',
      'https://giphy.com.evil.io/a.gif',
      'https://evil.io/giphy.com',
      'javascript:alert(1)'
    ])
      expect(isGiphyMediaUrl(bad)).toBe(false)
    expect(toItem('gif', gif('a', 'https://evil.io/a.gif'))).toBeNull()
  })

  it('key không có → lỗi rõ ràng, không gọi mạng; key sai / quá giới hạn → mã lỗi', async () => {
    const fetch = vi.fn()
    await expect(
      new GiphyClient({ getKey: () => null, fetch }).search('gif', 'cat')
    ).rejects.toThrow('giphy_no_key')
    expect(fetch).not.toHaveBeenCalled()
    const status = (s: number) =>
      new GiphyClient({
        getKey: () => 'k',
        fetch: async () => ({ ok: false, status: s, json: async () => ({}) })
      })
    await expect(status(403).search('gif', 'x')).rejects.toThrow('giphy_bad_key')
    await expect(status(429).trending('sticker')).rejects.toThrow('giphy_rate_limited')
  })

  it('gọi đúng endpoint, lọc kết quả lạ', async () => {
    const urls: string[] = []
    const client = new GiphyClient({
      getKey: () => 'KEY123',
      fetch: async (u) => {
        urls.push(u)
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [gif('1', 'https://media.giphy.com/1.gif'), gif('2', 'https://evil.io/2.gif')]
          })
        }
      }
    })
    expect((await client.search('sticker', 'mèo')).map((x) => x.id)).toEqual(['1'])
    expect(urls[0]).toContain('/stickers/search?api_key=KEY123')
    expect(urls[0]).toContain('rating=pg')
    await client.byIds('gif', ['1', '3'])
    expect(urls[1]).toContain('/gifs?api_key=KEY123')
    expect(urls[1]).toContain('ids=1%2C3')
  })

  it('đọc GIPHY_API_KEY từ .env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'env-'))
    writeFileSync(join(dir, '.env'), 'VITE_X=1\nGIPHY_API_KEY="abc123"\n')
    expect(readEnvKey(join(dir, '.env'))).toBe('abc123')
    expect(readEnvKey(join(dir, 'missing'))).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })

  it('schema key / reaction', () => {
    expect(giphyKeySchema.safeParse('abcDEF1234567890').success).toBe(true)
    expect(giphyKeySchema.safeParse('abc; rm').success).toBe(false)
    expect(chatReactSchema.safeParse({ messageId: crypto.randomUUID(), emoji: '❤️' }).success).toBe(
      true
    )
    expect(
      chatReactSchema.safeParse({ messageId: crypto.randomUUID(), emoji: 'hello' }).success
    ).toBe(false)
  })
})

describe('sticker local', () => {
  let root: string
  let lib: StickerLibrary
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'stk-'))
    mkdirSync(join(root, 'builtin'))
    mkdirSync(join(root, 'user', 'meo'), { recursive: true })
    writeFileSync(join(root, 'builtin', 'vui.svg'), '<svg/>')
    writeFileSync(join(root, 'user', 'meo', 'chao.png'), 'png')
    writeFileSync(join(root, 'user', 'ghi-chu.txt'), 'x')
    writeFileSync(join(root, 'secret.png'), 'x')
    lib = new StickerLibrary(join(root, 'builtin'), join(root, 'user'))
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('liệt kê bộ mặc định + thư mục người dùng (bỏ file không phải ảnh)', () => {
    expect(lib.list().map((s) => s.id)).toEqual(['mizuki/vui.svg', 'meo/chao.png'])
    expect(lib.findByName('chao')?.id).toBe('meo/chao.png')
    expect(lib.dataUrl('mizuki/vui.svg')).toMatch(/^data:image\/svg\+xml;base64,/)
  })

  it('không đọc file ngoài thư mục sticker', () => {
    for (const id of [
      '../secret.png',
      'meo/../../secret.png',
      'mizuki/../../secret.png',
      join(root, 'secret.png'),
      'ghi-chu.txt'
    ])
      expect(lib.dataUrl(id)).toBeNull()
  })
})

describe('ExpressiveService.finalize', () => {
  const make = (
    settings: ExpressiveSettings,
    pick = vi.fn(async () => ({
      kind: 'gif' as const,
      source: 'giphy' as const,
      id: 'g1',
      title: 'cat',
      url: 'https://media.giphy.com/g1.gif',
      width: 1,
      height: 1
    }))
  ) => {
    let stats: AffinityStats | null = null
    const giphy = { hasKey: () => true, pick } as unknown as GiphyClient
    const stickers = {
      list: () => [],
      findByName: () => null,
      userDir: 'x'
    } as unknown as StickerLibrary
    const service = new ExpressiveService({
      getSettings: () => settings,
      setSettings: vi.fn(),
      getStats: () => stats,
      setStats: (s) => (stats = s),
      getFavorites: () => [],
      setFavorites: vi.fn(),
      getRecent: () => ({ emoji: [], gif: [], sticker: [] }),
      setRecent: vi.fn(),
      giphy,
      giphyKeySource: () => 'user',
      stickers,
      loadSkill: async () => SKILL,
      log: { warn: vi.fn() }
    })
    return { service, pick }
  }

  it('mức Nhiều: giữ reaction + GIF tìm theo từ khoá', async () => {
    const { service, pick } = make({ mode: 'high', max: 'high' })
    const plan = service.onUserMessage({ text: 'kể chuyện cười đi', media: false, mode: 'free' })
    const r = await service.finalize('Đây nè =)) [[react:😂]] [[gif:funny cat]]', plan)
    expect(r).toMatchObject({ text: 'Đây nè =))', reaction: '😂', media: { id: 'g1' } })
    expect(pick).toHaveBeenCalledWith('gif', 'funny cat')
  })

  it('Tắt: bỏ thẻ, không reaction, không tìm GIF', async () => {
    const { service, pick } = make({ mode: 'off', max: 'high' })
    const plan = service.onUserMessage({ text: 'hi', media: false, mode: 'free' })
    expect(await service.finalize('Chào [[react:👋]] [[gif:hello]]', plan)).toEqual({
      text: 'Chào',
      reaction: null,
      media: null
    })
    expect(pick).not.toHaveBeenCalled()
  })

  it('không tìm được GIF → ẩn đi, vẫn trả chữ', async () => {
    const { service } = make(
      { mode: 'high', max: 'high' },
      vi.fn(async () => {
        throw new Error('giphy_network')
      })
    )
    const plan = service.onUserMessage({ text: 'vui ghê', media: false, mode: 'free' })
    expect(await service.finalize('Ừa [[gif:party]]', plan)).toMatchObject({
      text: 'Ừa',
      media: null
    })
  })
})
