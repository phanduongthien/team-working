import type { ChatEvent } from '@shared/ai'
import type { AIProvider, ChatRequest } from './AIProvider'
import { FAKE_ARTIFACTS } from './fakeArtifacts'

/**
 * CHỈ cho test e2e ở bản chưa đóng gói (MMC_FAKE_CHAT=1): trả lời giả lập, không gọi Claude.
 * Chèn thẻ biểu cảm để test đường đi reaction / GIF / sticker; system prompt có phần "Biểu cảm" thì mới chèn.
 */
export class FakeChatProvider implements AIProvider {
  readonly id = 'fake'
  readonly stateful = false

  async isAvailable(): Promise<{ ok: boolean }> {
    return { ok: true }
  }

  async *chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    // Học phong cách: trả JSON giả để e2e kiểm tra được luồng đề xuất → duyệt.
    if (req.systemPrompt.includes('"type":"style_notes"')) {
      yield {
        type: 'text',
        delta: '{"type":"style_notes","notes":["Trả lời ngắn gọn, có gạch đầu dòng"]}'
      }
      yield { type: 'done' }
      return
    }
    const skills = [...req.systemPrompt.matchAll(/^### Skill: ([\w-]+)/gm)].map((m) => m[1])
    const first = req.prompt.split('\n').find((l) => l.trim() && !l.startsWith('(')) ?? ''
    const expressive = req.systemPrompt.includes('## Biểu cảm')
    const tags = !expressive
      ? ''
      : / sticker\b/i.test(` ${first}`)
        ? ' [[react:🥰]] [[sticker:local/vui]]'
        : ' [[react:❤️]] [[gif:happy cat]]'
    const artifact = FAKE_ARTIFACTS[/FAKE_ARTIFACT:([\w-]+)/.exec(req.prompt)?.[1] ?? ''] ?? ''
    const used = skills.length ? ` [skill: ${skills.join(', ')}]` : ''
    const reply = `Mizuki (giả lập) đã nhận: "${first.slice(0, 80)}"${used}${tags}${artifact}`
    for (const part of reply.match(/.{1,12}/gsu) ?? []) {
      if (signal.aborted) return
      yield { type: 'text', delta: part }
      await new Promise((r) => setTimeout(r, 10))
    }
    yield { type: 'done' }
  }
}
