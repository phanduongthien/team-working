import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatEvent } from '@shared/ai'
import { DEFAULT_ASSISTANT } from '@shared/schemas'
import type { ChatStreamPayload } from '@shared/types'
import type { AIProvider, ChatRequest } from '../../ai/AIProvider'
import { openDatabase } from '../../db/client'
import { ConversationRepository, MessageRepository } from '../../db/repositories'
import { ChatBusyError, ChatService, promptWithHistory, runOptions, titleFromText, toHistory } from '../chatService'

type Script = (req: ChatRequest, signal: AbortSignal) => AsyncIterable<ChatEvent>

class FakeProvider implements AIProvider {
  readonly id = 'fake'
  calls: ChatRequest[] = []
  constructor(
    private script: Script,
    readonly stateful = true
  ) {}
  async isAvailable(): Promise<{ ok: boolean }> {
    return { ok: true }
  }
  chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    this.calls.push(req)
    return this.script(req, signal)
  }
}

async function* events(...list: ChatEvent[]): AsyncIterable<ChatEvent> {
  for (const e of list) yield e
}

const migrations = join(__dirname, '..', '..', 'db', 'migrations')

describe('ChatService', () => {
  let handle: ReturnType<typeof openDatabase>
  let convs: ConversationRepository
  let msgs: MessageRepository
  let emitted: ChatStreamPayload[]

  const makeService = (provider: AIProvider): ChatService =>
    new ChatService({
      conversations: convs,
      messages: msgs,
      getProvider: () => provider,
      getAssistant: () => ({ ...DEFAULT_ASSISTANT, name: 'Bông' }),
      getMemoryContext: (query) => ({
        user: { name: 'An' },
        memories: query.includes('React') ? ['Đang học React'] : []
      }),
      loadModeSkill: async (mode) => (mode === 'study' ? '# Gia sư' : undefined),
      workspaceDir: 'C:\\ws',
      emit: (p) => emitted.push(p),
      log: { info: vi.fn(), error: vi.fn() }
    })

  const waitForStatus = async (conversationId: string, status: string): Promise<void> => {
    await vi.waitFor(() => {
      expect(msgs.list(conversationId).at(-1)?.status).toBe(status)
    })
  }

  beforeEach(() => {
    handle = openDatabase(':memory:', migrations)
    convs = new ConversationRepository(handle.db)
    msgs = new MessageRepository(handle.db)
    emitted = []
  })
  afterEach(() => handle.close())

  it('lưu tin nhắn, stream text, lưu session và đặt tiêu đề', async () => {
    const provider = new FakeProvider(() =>
      events(
        { type: 'session', sessionId: 's-1' },
        { type: 'text', delta: 'Xin ' },
        { type: 'text', delta: 'chào' },
        { type: 'done', usage: { outputTokens: 3 } }
      )
    )
    const conv = convs.create('study')
    const res = makeService(provider).send(conv.id, 'Giải thích   closure trong JS')
    expect(res.userMessage.content).toBe('Giải thích   closure trong JS')
    await waitForStatus(conv.id, 'done')

    const [, assistant] = msgs.list(conv.id)
    expect(assistant).toMatchObject({ content: 'Xin chào', status: 'done', usage: { outputTokens: 3 } })
    expect(convs.get(conv.id)).toMatchObject({ cliSessionId: 's-1', title: 'Giải thích closure trong JS' })
    expect(emitted.map((e) => e.event.type)).toEqual(['text', 'text', 'done'])

    const req = provider.calls[0]
    expect(req.prompt).toBe('Giải thích   closure trong JS')
    expect(req.sessionId).toBeUndefined()
    expect(req.cwd).toBe('C:\\ws')
    expect(req.systemPrompt).toContain('Bạn là Bông.')
    expect(req.systemPrompt).toContain('# Gia sư')
  })

  it('dùng --resume với session đã lưu ở tin nhắn sau', async () => {
    const provider = new FakeProvider(() => events({ type: 'text', delta: 'ok' }, { type: 'done' }))
    const conv = convs.create('free')
    convs.setSession(conv.id, 's-old')
    makeService(provider).send(conv.id, 'tiếp nhé')
    await waitForStatus(conv.id, 'done')
    expect(provider.calls[0].sessionId).toBe('s-old')
  })

  it('session bị mất → xóa session, thử lại một lần kèm lịch sử, không báo lỗi ra UI', async () => {
    let n = 0
    const provider = new FakeProvider(() =>
      n++ === 0
        ? events({ type: 'error', message: 'No conversation found with session ID: s-old' })
        : events({ type: 'session', sessionId: 's-new' }, { type: 'text', delta: 'đã nhớ lại' }, { type: 'done' })
    )
    const conv = convs.create('free')
    msgs.insert({ conversationId: conv.id, role: 'user', content: 'Tôi tên An' })
    msgs.insert({ conversationId: conv.id, role: 'assistant', content: 'Chào An' })
    convs.setSession(conv.id, 's-old')

    makeService(provider).send(conv.id, 'Tôi tên gì?')
    await waitForStatus(conv.id, 'done')

    expect(provider.calls).toHaveLength(2)
    expect(provider.calls[1].sessionId).toBeUndefined()
    expect(provider.calls[1].prompt).toContain('Người dùng: Tôi tên An')
    expect(provider.calls[1].prompt.endsWith('Tôi tên gì?')).toBe(true)
    expect(convs.get(conv.id)?.cliSessionId).toBe('s-new')
    expect(emitted.some((e) => e.event.type === 'error')).toBe(false)
  })

  it('chỉ báo done sau khi tiến trình CLI thoát hẳn; lúc đó gửi tiếp được ngay', async () => {
    let exitProcess = (): void => {}
    const exited = new Promise<void>((r) => (exitProcess = r))
    const provider = new FakeProvider(async function* () {
      yield { type: 'text', delta: 'OK' }
      yield { type: 'done' }
      await exited // CLI còn chạy thêm một lúc sau `result`
    })
    const conv = convs.create('free')
    const service = makeService(provider)
    let sentAgain = false
    emitted = []
    const origEmit = emitted.push.bind(emitted)
    emitted.push = (...items: ChatStreamPayload[]): number => {
      for (const p of items) {
        if (p.event.type === 'done' && !sentAgain) {
          sentAgain = true
          expect(() => service.send(conv.id, 'tin tiếp theo')).not.toThrow()
        }
      }
      return origEmit(...items)
    }

    service.send(conv.id, 'nhớ số 7391')
    await vi.waitFor(() => expect(emitted.map((e) => e.event.type)).toEqual(['text']))
    await new Promise((r) => setTimeout(r, 20))
    expect(emitted.some((e) => e.event.type === 'done')).toBe(false)

    exitProcess()
    await vi.waitFor(() => expect(sentAgain).toBe(true))
  })

  it('chèn hồ sơ + memory liên quan vào system prompt', async () => {
    const provider = new FakeProvider(() => events({ type: 'done' }))
    const conv = convs.create('free')
    makeService(provider).send(conv.id, 'Ôn React giúp mình')
    await waitForStatus(conv.id, 'done')
    expect(provider.calls[0].systemPrompt).toContain('- Tên: An')
    expect(provider.calls[0].systemPrompt).toContain('- Đang học React')
  })

  it('provider không session (API): gửi lịch sử, không dùng --resume', async () => {
    const provider = new FakeProvider(() => events({ type: 'done' }), false)
    const conv = convs.create('free')
    convs.setSession(conv.id, 's-cli')
    msgs.insert({ conversationId: conv.id, role: 'user', content: 'Tôi tên An' })
    msgs.insert({ conversationId: conv.id, role: 'assistant', content: 'Chào An' })
    makeService(provider).send(conv.id, 'Tôi tên gì?')
    await waitForStatus(conv.id, 'done')
    expect(provider.calls[0].sessionId).toBeUndefined()
    expect(provider.calls[0].history).toEqual([
      { role: 'user', content: 'Tôi tên An' },
      { role: 'assistant', content: 'Chào An' }
    ])
  })

  it('lưu file đính kèm vào tin nhắn và chuyển cho provider; renderer không thấy đường dẫn', async () => {
    const provider = new FakeProvider(() => events({ type: 'done' }))
    const conv = convs.create('free')
    const file = { id: '6f1d1b9e-0000-4000-8000-000000000001', name: 'bai.pdf', mimeType: 'application/pdf', size: 10, path: 'C:\\ws\\a.pdf' }
    const res = makeService(provider).send(conv.id, 'Tóm tắt giúp', [file])
    await waitForStatus(conv.id, 'done')
    expect(provider.calls[0].attachments).toEqual([file])
    expect(res.userMessage.attachments).toEqual([{ id: file.id, name: 'bai.pdf', mimeType: 'application/pdf', size: 10 }])
    expect(JSON.stringify(msgs.list(conv.id))).not.toContain('a.pdf')
  })

  it('lỗi từ provider → tin nhắn status error', async () => {
    const provider = new FakeProvider(() => events({ type: 'error', message: 'rate_limit' }))
    const conv = convs.create('free')
    makeService(provider).send(conv.id, 'hi')
    await waitForStatus(conv.id, 'error')
    expect(msgs.list(conv.id).at(-1)?.error).toBe('rate_limit')
  })

  it('abort giữ phần đã nhận và đánh dấu aborted; chặn gửi trùng khi đang chạy', async () => {
    const provider = new FakeProvider(async function* (_req, signal) {
      yield { type: 'text', delta: 'đang viết' }
      await new Promise<void>((resolve) => signal.addEventListener('abort', () => resolve()))
    })
    const conv = convs.create('free')
    const service = makeService(provider)
    const { requestId } = service.send(conv.id, 'viết dài')
    await vi.waitFor(() => expect(emitted).toHaveLength(1))
    expect(() => service.send(conv.id, 'nữa')).toThrow(ChatBusyError)

    service.abort(requestId)
    await waitForStatus(conv.id, 'aborted')
    expect(msgs.list(conv.id).at(-1)?.content).toBe('đang viết')
  })
})

describe('runOptions (chế độ Code)', () => {
  const base = { conversationId: 'c1', workspaceDir: 'C:\\ws' }

  it('không phải Code hoặc chưa chọn thư mục → workspace riêng, không tool', () => {
    expect(runOptions({ ...base, mode: 'free', cwd: 'D:\\proj', codeWrite: true })).toEqual({ cwd: 'C:\\ws' })
    expect(runOptions({ ...base, mode: 'code', cwd: null, codeWrite: true })).toEqual({ cwd: 'C:\\ws' })
  })

  it('chỉ đọc: Read/Grep/Glob tự duyệt, không Edit/Write, không duyệt quyền', () => {
    const o = runOptions({ ...base, mode: 'code', cwd: 'D:\\proj', codeWrite: false })
    expect(o).toMatchObject({ cwd: 'D:\\proj', tools: ['Read', 'Grep', 'Glob'], allowedTools: ['Read', 'Grep', 'Glob'] })
    expect(o.approval).toBeUndefined()
    expect(o.context).toContain('CHỈ ĐỌC')
  })

  it('được sửa: Edit/Write có nhưng KHÔNG tự duyệt; bật duyệt từng thay đổi; không bao giờ có Bash', () => {
    const o = runOptions({ ...base, mode: 'code', cwd: 'D:\\proj', codeWrite: true })
    expect(o.tools).toEqual(['Read', 'Grep', 'Glob', 'Edit', 'Write'])
    expect(o.allowedTools).toEqual(['Read', 'Grep', 'Glob'])
    expect(o.approval).toEqual({ conversationId: 'c1' })
    expect(JSON.stringify(o)).not.toMatch(/Bash|PowerShell/)
  })
})

describe('helpers', () => {
  it('toHistory bỏ tin trợ lý lỗi/dừng và ghi chú file đính kèm cũ', () => {
    const base = { conversationId: 'c', error: null, toolEvents: [], usage: null, createdAt: 0 }
    const history = toHistory([
      { ...base, id: '1', role: 'user', content: 'xem file', status: 'done', attachments: [{ id: 'a', name: 'x.png', mimeType: 'image/png', size: 1 }] },
      { ...base, id: '2', role: 'assistant', content: 'lỗi giữa chừng', status: 'error', attachments: [] },
      { ...base, id: '3', role: 'assistant', content: 'ok', status: 'done', attachments: [] }
    ])
    expect(history).toEqual([
      { role: 'user', content: 'xem file\n[Đã đính kèm: x.png]' },
      { role: 'assistant', content: 'ok' }
    ])
  })

  it('titleFromText gộp khoảng trắng và cắt 60 ký tự', () => {
    expect(titleFromText('  a\n\nb  ')).toBe('a b')
    expect(titleFromText('x'.repeat(100))).toHaveLength(60)
  })
  it('promptWithHistory trả nguyên câu hỏi khi không có lịch sử', () => {
    expect(promptWithHistory([], 'hỏi')).toBe('hỏi')
  })
})
