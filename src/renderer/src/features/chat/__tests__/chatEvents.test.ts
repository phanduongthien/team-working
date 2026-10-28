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
    let next = applyChatEvent(list, 'a', { type: 'tool', name: 'Read', input: { file_path: 'a.ts' } })
    next = applyChatEvent(next, 'a', { type: 'done', usage: { outputTokens: 5 } })
    expect(next[1]).toMatchObject({ status: 'done', usage: { outputTokens: 5 }, toolEvents: [{ name: 'Read' }] })
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
