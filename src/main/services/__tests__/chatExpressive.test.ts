import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent } from '@shared/ai'
import type { ExpressiveSettings, MessageMedia } from '@shared/expressive'
import { DEFAULT_ASSISTANT } from '@shared/schemas'
import type { ChatStreamPayload } from '@shared/types'
import type { AIProvider, ChatRequest } from '../../ai/AIProvider'
import { openDatabase } from '../../db/client'
import { ConversationRepository, MessageRepository } from '../../db/repositories'
import type { AffinityStats } from '../../expressive/affinity'
import type { GiphyClient } from '../../expressive/giphy'
import { ExpressiveService } from '../../expressive/service'
import type { StickerLibrary } from '../../expressive/stickers'
import { ChatService } from '../chatService'

const migrations = join(__dirname, '..', '..', 'db', 'migrations')
const GIF: MessageMedia = {
  kind: 'gif',
  source: 'giphy',
  id: 'g1',
  title: 'happy cat',
  url: 'https://media.giphy.com/g1.gif',
  width: 200,
  height: 150
}

class ScriptProvider implements AIProvider {
  readonly id = 'fake'
  readonly stateful = true
  calls: ChatRequest[] = []
  constructor(private reply: string) {}
  async isAvailable(): Promise<{ ok: boolean }> {
    return { ok: true }
  }
  async *chat(req: ChatRequest): AsyncIterable<ChatEvent> {
    this.calls.push(req)
    for (const part of this.reply.match(/.{1,5}/gsu) ?? []) yield { type: 'text', delta: part }
    yield { type: 'done' }
  }
}

describe('ChatService + biểu cảm', () => {
  let convs: ConversationRepository
  let msgs: MessageRepository
  let emitted: ChatStreamPayload[]
  let settings: ExpressiveSettings

  beforeEach(() => {
    const handle = openDatabase(':memory:', migrations)
    convs = new ConversationRepository(handle.db)
    msgs = new MessageRepository(handle.db)
    emitted = []
    settings = { mode: 'high', max: 'high' }
  })

  const make = (provider: AIProvider): ChatService => {
    let stats: AffinityStats | null = null
    const expressive = new ExpressiveService({
      getSettings: () => settings,
      setSettings: vi.fn(),
      getStats: () => stats,
      setStats: (s) => (stats = s),
      getFavorites: () => [],
      setFavorites: vi.fn(),
      giphy: { hasKey: () => true, pick: async () => GIF } as unknown as GiphyClient,
      giphyKeySource: () => 'user',
      stickers: {
        list: () => [],
        findByName: () => null,
        userDir: 'x'
      } as unknown as StickerLibrary,
      loadSkill: async () => '## high\nNHIEU\n## tags\nTHE',
      log: { warn: vi.fn() }
    })
    return new ChatService({
      conversations: convs,
      messages: msgs,
      getProvider: () => provider,
      getAssistant: () => DEFAULT_ASSISTANT,
      getMemoryContext: () => ({ user: {}, memories: [] }),
      loadModeSkill: async () => undefined,
      workspaceDir: 'C:\\ws',
      emit: (p) => emitted.push(p),
      log: { info: vi.fn(), error: vi.fn() },
      expressive
    })
  }

  const done = async (conversationId: string): Promise<void> =>
    vi.waitFor(() =>
      expect(
        emitted.some((p) => p.conversationId === conversationId && p.event.type === 'done')
      ).toBe(true)
    )

  it('câu trả lời: bỏ thẻ khỏi nội dung lưu, gắn GIF, thả reaction vào tin người dùng; lời nhắc có phần Biểu cảm', async () => {
    const provider = new ScriptProvider('Hihi xong rồi nè ✨ [[react:🥰]] [[gif:happy cat]]')
    const chat = make(provider)
    const conv = convs.create('free')
    const { userMessage, assistantMessage } = chat.send(conv.id, 'cảm ơn nha 😆')
    await done(conv.id)
    const [user, reply] = msgs.list(conv.id)
    expect(reply.content).toBe('Hihi xong rồi nè ✨')
    expect(reply.media).toEqual(GIF)
    expect(user.reactions).toEqual([{ emoji: '🥰', by: 'assistant' }])
    expect(provider.calls[0].systemPrompt).toContain('## Biểu cảm')
    const kinds = emitted.map((p) => p.event.type)
    expect(kinds.indexOf('final')).toBeLessThan(kinds.indexOf('done'))
    expect(emitted.find((p) => p.event.type === 'reactions')?.event).toEqual({
      type: 'reactions',
      targetId: userMessage.id,
      reactions: user.reactions
    })
    expect(emitted.find((p) => p.event.type === 'final')?.messageId).toBe(assistantMessage.id)
  })

  it('mức Tắt: vẫn bỏ thẻ (kể cả thẻ sai), không GIF, không reaction', async () => {
    settings = { mode: 'off', max: 'high' }
    const chat = make(new ScriptProvider('Chào bạn [[react:👋]] [[GIF mèo]]'))
    const conv = convs.create('free')
    chat.send(conv.id, 'chào')
    await done(conv.id)
    const [user, reply] = msgs.list(conv.id)
    expect(reply.content).toBe('Chào bạn')
    expect(reply.media).toBeNull()
    expect(user.reactions).toEqual([])
  })

  it('người dùng gửi GIF: Claude chỉ thấy chữ mô tả; thả cảm xúc → lượt sau trợ lý được báo', async () => {
    const provider = new ScriptProvider('ok')
    const chat = make(provider)
    const conv = convs.create('free')
    chat.send(conv.id, '', [], GIF)
    await done(conv.id)
    expect(provider.calls[0].prompt).toBe('[Người dùng gửi GIF: "happy cat"]')
    expect(msgs.list(conv.id)[0].media).toEqual(GIF)
    expect(convs.get(conv.id)?.title).toBe('happy cat')

    const reply = msgs.list(conv.id)[1]
    expect(chat.react(reply.id, '❤️').reactions).toEqual([{ emoji: '❤️', by: 'user' }])
    expect(chat.react(reply.id, '😂').reactions).toEqual([{ emoji: '😂', by: 'user' }]) // mỗi người 1 cảm xúc
    expect(chat.react(reply.id, null).reactions).toEqual([])
    emitted = []
    chat.send(conv.id, 'tiếp nha')
    await done(conv.id)
    expect(provider.calls[1].prompt).toMatch(
      /^\(Người dùng vừa thả ❤️ vào một câu trả lời của bạn\. Người dùng vừa thả 😂/
    )
    expect(provider.calls[1].prompt).toContain('tiếp nha')
  })

  it('không thả cảm xúc được vào tin không tồn tại', () => {
    const chat = make(new ScriptProvider('ok'))
    expect(() => chat.react(crypto.randomUUID(), '❤️')).toThrow('conversation_not_found')
  })
})
