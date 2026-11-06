import type { ChatEvent } from '@shared/ai'
import type { AIProvider, ChatRequest } from './AIProvider'
import type { ToolResult } from '../tools/registry'
import { FAKE_ARTIFACTS } from './fakeArtifacts'
import { ORGANIZE_MARKER } from '../chat/organize'

export type FakeToolCaller = (name: string, input: unknown, conversationId: string) => Promise<ToolResult>

/**
 * CHỈ cho test e2e ở bản chưa đóng gói (MMC_FAKE_CHAT=1): trả lời giả lập, không gọi Claude.
 * Chèn thẻ biểu cảm để test đường đi reaction / GIF / sticker; system prompt có phần "Biểu cảm" thì mới chèn.
 */
export class FakeChatProvider implements AIProvider {
  readonly id = 'fake'
  readonly stateful = false

  /** Gọi tool của app như CLI thật (qua registry) — để e2e đi được luồng duyệt nháp Gmail / Telegram. */
  constructor(private readonly callTool?: FakeToolCaller) {}

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
    // Trích ghi nhớ: tin có FAKE_MEMORIES:<n> → n đề xuất (xoay vòng loại, đề xuất thứ 2 rất dài) để e2e kiểm tra danh sách gọn.
    if (req.systemPrompt.includes('memory_suggestions')) {
      const n = Math.min(20, Number(/FAKE_MEMORIES:(\d+)/.exec(req.prompt)?.[1] ?? 0))
      const cats = ['skill', 'project', 'preference', 'goal']
      const items = Array.from({ length: n }, (_, i) => ({
        action: 'add',
        category: cats[i % cats.length],
        content:
          i === 1
            ? `Ghi nhớ dài số ${i + 1}: ` + 'đang làm đồ án game Unity nhiều màn chơi, cần nhắc deadline và cách tối ưu hiệu năng. '.repeat(5)
            : `Ghi nhớ số ${i + 1}`
      }))
      yield { type: 'text', delta: '```json\n' + JSON.stringify({ type: 'memory_suggestions', items }) + '\n```' }
      yield { type: 'done' }
      return
    }
    // Đặt tiêu đề / gợi ý nhóm (model rẻ): tiêu đề "Chủ đề: <3 từ đầu>"; FAKE_GROUP:<n> trong tin → nhóm thứ n
    // trong danh sách được gửi (dùng số để tên nhóm không lọt vào so khớp từ khoá).
    if (req.systemPrompt.startsWith(ORGANIZE_MARKER)) {
      const user = /^Người dùng: (.*)$/m.exec(req.prompt)?.[1] ?? ''
      const names = [...(/^Các nhóm hiện có: (.*)$/m.exec(req.prompt)?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1])
      const index = Number(/FAKE_GROUP:(\d+)/.exec(user)?.[1] ?? NaN)
      const group = names[index - 1] ?? null
      const words = user.replace(/FAKE_\w+:\S+/g, '').trim().split(/\s+/).slice(0, 3).join(' ')
      yield { type: 'text', delta: JSON.stringify({ title: `Chủ đề: ${words}`, group }) }
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
    // FAKE_TOOL:<tên> <json>: gọi tool của app nếu lượt chat này được cấp tool đó, rồi in kết quả.
    const toolCall = /FAKE_TOOL:([a-z_]+)\s+(\{.*\})/.exec(req.prompt)
    if (toolCall && this.callTool && req.appTools?.names.includes(toolCall[1])) {
      const input: unknown = JSON.parse(toolCall[2])
      yield { type: 'tool', name: `mcp__mmc__${toolCall[1]}`, input }
      const result = await this.callTool(toolCall[1], input, req.appTools.conversationId)
      const text = result.content.map((c) => (c.type === 'text' ? c.text : '[ảnh]')).join('\n')
      yield { type: 'text', delta: `${result.isError ? 'LỖI TOOL: ' : 'KẾT QUẢ TOOL: '}${text}` }
      yield { type: 'done' }
      return
    }
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
