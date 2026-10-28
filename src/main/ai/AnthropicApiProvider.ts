import { readFile } from 'node:fs/promises'
import Anthropic from '@anthropic-ai/sdk'
import type { ChatEvent } from '@shared/ai'
import type { StoredAttachment } from '@shared/types'
import type { AIProvider, ChatRequest, HistoryMessage } from './AIProvider'

/** Model mặc định theo skill claude-api (không tự đoán ID). */
export const ANTHROPIC_MODEL = 'claude-opus-5-5'
const MAX_TOKENS = 64_000
const MAX_TEXT_ATTACHMENT_CHARS = 200_000

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

/** Lịch sử → messages hợp lệ: bỏ tin rỗng, bắt đầu bằng user. */
export function historyToMessages(history: HistoryMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const list = history.filter((m) => m.content.trim())
  const firstUser = list.findIndex((m) => m.role === 'user')
  return firstUser < 0 ? [] : list.slice(firstUser).map((m) => ({ role: m.role, content: m.content }))
}

/** File đính kèm → content block: ảnh/PDF gửi base64, file chữ chèn thẳng nội dung. */
export async function attachmentBlocks(
  attachments: StoredAttachment[],
  read: (path: string) => Promise<Buffer> = (p) => readFile(p)
): Promise<Anthropic.Beta.BetaContentBlockParam[]> {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = []
  for (const a of attachments) {
    const data = await read(a.path)
    if ((IMAGE_TYPES as readonly string[]).includes(a.mimeType)) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: a.mimeType as ImageType, data: data.toString('base64') }
      })
    } else if (a.mimeType === 'application/pdf') {
      blocks.push({
        type: 'document',
        title: a.name,
        source: { type: 'base64', media_type: 'application/pdf', data: data.toString('base64') }
      })
    } else {
      const text = data.toString('utf8')
      const clipped = text.length > MAX_TEXT_ATTACHMENT_CHARS ? `${text.slice(0, MAX_TEXT_ATTACHMENT_CHARS)}\n…(đã cắt bớt)` : text
      blocks.push({ type: 'text', text: `File đính kèm "${a.name}":\n\`\`\`\n${clipped}\n\`\`\`` })
    }
  }
  return blocks
}

function errorCode(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'invalid_api_key'
  if (err instanceof Anthropic.PermissionDeniedError) return 'api_permission_denied'
  if (err instanceof Anthropic.RateLimitError) return 'rate_limit'
  if (err instanceof Anthropic.APIConnectionError) return 'network_error'
  if (err instanceof Anthropic.APIError) return `api_error_${err.status ?? 'unknown'}`
  return (err as Error).message
}

/**
 * Dự phòng khi không dùng Claude Code CLI: gọi Messages API bằng key người dùng tự nhập.
 * API không giữ session → mỗi lượt gửi kèm lịch sử gần đây.
 */
export class AnthropicApiProvider implements AIProvider {
  readonly id = 'anthropic-api'
  readonly stateful = false

  constructor(private readonly getApiKey: () => string | null) {}

  async isAvailable(): Promise<{ ok: boolean; reason?: string }> {
    return this.getApiKey() ? { ok: true } : { ok: false, reason: 'missing_api_key' }
  }

  async *chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    const apiKey = this.getApiKey()
    if (!apiKey) {
      yield { type: 'error', message: 'missing_api_key' }
      return
    }
    const client = new Anthropic({ apiKey })

    try {
      const content: Anthropic.Beta.BetaContentBlockParam[] = [
        ...(await attachmentBlocks(req.attachments ?? [])),
        { type: 'text', text: req.prompt }
      ]
      const stream = client.beta.messages.stream(
        {
          model: ANTHROPIC_MODEL,
          max_tokens: MAX_TOKENS,
          system: req.systemPrompt,
          messages: [...historyToMessages(req.history ?? []), { role: 'user', content }],
          output_config: { effort: 'medium' },
          // Bị từ chối vì an toàn → server tự chạy lại trên model dự phòng phù hợp.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default'
        },
        { signal }
      )

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield { type: 'text', delta: event.delta.text }
        }
      }

      const final = await stream.finalMessage()
      if (final.stop_reason === 'refusal') {
        yield { type: 'error', message: 'refusal' }
        return
      }
      yield {
        type: 'done',
        usage: { inputTokens: final.usage.input_tokens, outputTokens: final.usage.output_tokens }
      }
    } catch (err) {
      if (signal.aborted) return
      yield { type: 'error', message: errorCode(err) }
    }
  }
}
