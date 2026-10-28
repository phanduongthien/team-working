import { describe, expect, it } from 'vitest'
import type { ChatEvent } from '@shared/ai'
import { AnthropicApiProvider, attachmentBlocks, historyToMessages } from '../AnthropicApiProvider'

describe('historyToMessages', () => {
  it('bỏ tin rỗng và bắt đầu bằng tin của người dùng', () => {
    expect(
      historyToMessages([
        { role: 'assistant', content: 'chào' },
        { role: 'user', content: '  ' },
        { role: 'user', content: 'hỏi' },
        { role: 'assistant', content: 'đáp' }
      ])
    ).toEqual([
      { role: 'user', content: 'hỏi' },
      { role: 'assistant', content: 'đáp' }
    ])
    expect(historyToMessages([{ role: 'assistant', content: 'x' }])).toEqual([])
  })
})

describe('attachmentBlocks', () => {
  const read = async (path: string): Promise<Buffer> => Buffer.from(`data:${path}`)
  const file = (name: string, mimeType: string) => ({ id: name, name, mimeType, size: 1, path: name })

  it('ảnh → image base64, PDF → document base64, còn lại → text', async () => {
    const blocks = await attachmentBlocks(
      [file('a.png', 'image/png'), file('b.pdf', 'application/pdf'), file('c.ts', 'text/plain')],
      read
    )
    expect(blocks[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: Buffer.from('data:a.png').toString('base64') }
    })
    expect(blocks[1]).toMatchObject({ type: 'document', title: 'b.pdf', source: { media_type: 'application/pdf' } })
    expect(blocks[2]).toEqual({ type: 'text', text: 'File đính kèm "c.ts":\n```\ndata:c.ts\n```' })
  })
})

describe('AnthropicApiProvider', () => {
  it('thiếu API key → báo lỗi missing_api_key, không gọi mạng', async () => {
    const provider = new AnthropicApiProvider(() => null)
    expect(await provider.isAvailable()).toEqual({ ok: false, reason: 'missing_api_key' })
    const events: ChatEvent[] = []
    for await (const e of provider.chat({ prompt: 'hi', systemPrompt: '', mode: 'free', cwd: '.' }, new AbortController().signal)) {
      events.push(e)
    }
    expect(events).toEqual([{ type: 'error', message: 'missing_api_key' }])
  })
})
