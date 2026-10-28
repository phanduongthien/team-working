import type { ChatEvent } from '@shared/ai'
import type { Message } from '@shared/types'

/** Áp một sự kiện stream vào danh sách tin nhắn (hàm thuần). */
export function applyChatEvent(messages: Message[], messageId: string, event: ChatEvent): Message[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m
    switch (event.type) {
      case 'text':
        return { ...m, content: m.content + event.delta }
      case 'tool':
        return { ...m, toolEvents: [...m.toolEvents, { name: event.name, input: event.input }] }
      case 'done':
        return { ...m, status: 'done', usage: event.usage ?? null }
      case 'error':
        return event.message === 'aborted'
          ? { ...m, status: 'aborted' }
          : { ...m, status: 'error', error: event.message }
      default:
        return m
    }
  })
}

export const isTerminalEvent = (event: ChatEvent): boolean => event.type === 'done' || event.type === 'error'
