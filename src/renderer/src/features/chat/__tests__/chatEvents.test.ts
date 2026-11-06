import { describe, expect, it } from 'vitest'
import type { Message } from '@shared/types'
import { applyChatEvent, isTerminalEvent } from '../chatEvents'

const msg = (id: string, patch: Partial<Message> = {}): Message => ({
  id,
  conversationId: 'c1',
  role: 'assistant',
  content: '',
  status: 'streaming',
  error: null,
  toolEvents: [],
  attachments: [],
  usage: null,
  reactions: [],
  media: null,
  voice: null,
  artifacts: [],
  createdAt: 0,
  ...patch
})

describe('applyChatEvent', () => {
  const list = [msg('u', { role: 'user', content: 'hỏi', status: 'done' }), msg('a')]

  it('nối text vào đúng tin nhắn, không đụng tin khác', () => {
    let next = applyChatEvent(list, 'a', { type: 'text', delta: 'Xin ' })
    next = applyChatEvent(next, 'a', { type: 'text', delta: 'chào' })
    expect(next[1].content).toBe('Xin chào')
    expect(next[0]).toBe(list[0])
  })

  it('ghi nhận tool và kết thúc done kèm usage', () => {
    let next = applyChatEvent(list, 'a', {
      type: 'tool',
      name: 'Read',
      input: { file_path: 'a.ts' }
    })
    next = applyChatEvent(next, 'a', { type: 'done', usage: { outputTokens: 5 } })
    expect(next[1]).toMatchObject({
      status: 'done',
      usage: { outputTokens: 5 },
      toolEvents: [{ name: 'Read' }]
    })
  })

  it('phân biệt dừng (aborted) và lỗi thật', () => {
    expect(applyChatEvent(list, 'a', { type: 'error', message: 'aborted' })[1]).toMatchObject({
      status: 'aborted',
      error: null
    })
    expect(applyChatEvent(list, 'a', { type: 'error', message: 'rate_limit' })[1]).toMatchObject({
      status: 'error',
      error: 'rate_limit'
    })
  })

  it('isTerminalEvent chỉ đúng với done/error', () => {
    expect(isTerminalEvent({ type: 'done' })).toBe(true)
    expect(isTerminalEvent({ type: 'error', message: 'x' })).toBe(true)
    expect(isTerminalEvent({ type: 'text', delta: 'x' })).toBe(false)
  })
})

describe('sự kiện biểu cảm', () => {
  it('final thay nội dung đã bỏ thẻ + gắn GIF; reactions áp vào đúng tin đích', () => {
    const media = {
      kind: 'gif' as const,
      source: 'giphy' as const,
      id: 'g',
      title: 't',
      url: 'https://media.giphy.com/g.gif',
      width: 1,
      height: 1
    }
    const list = [msg('u', { role: 'user' }), msg('a', { content: 'Hi [[gif:cat]]' })]
    const after = applyChatEvent(list, 'a', { type: 'final', content: 'Hi', media })
    expect(after[1]).toMatchObject({ content: 'Hi', media })
    const reacted = applyChatEvent(after, 'a', {
      type: 'reactions',
      targetId: 'u',
      reactions: [{ emoji: '🥰', by: 'assistant' }]
    })
    expect(reacted[0].reactions).toEqual([{ emoji: '🥰', by: 'assistant' }])
    expect(reacted[1].reactions).toEqual([])
  })
})

describe('tìm emoji', () => {
  it('không dấu vẫn khớp tiếng Việt; nhiều từ phải khớp hết', async () => {
    const { searchEmojis } = await import('../expressive/emojiData')
    const list = [
      { unicode: '😂', group: 0, label: 'cười', search: 'cuoi nuoc mat face with tears of joy' },
      { unicode: '🐱', group: 3, label: 'mèo', search: 'meo cat' }
    ]
    expect(searchEmojis(list, 'Cười').map((e) => e.unicode)).toEqual(['😂'])
    expect(searchEmojis(list, 'cat')).toHaveLength(1)
    expect(searchEmojis(list, 'cuoi cat')).toHaveLength(0)
    expect(searchEmojis(list, '  ')).toHaveLength(2)
  })
})
