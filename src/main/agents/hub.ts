import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { AgentClient, AgentExchange, AgentNotice, AgentServerStatus, NewAgentToken } from '@shared/agents'
import type { KillSwitch } from '../computer/killSwitch'
import { needsPerRequestApproval } from './prompt'
import { RateLimiter } from './rateLimiter'
import { QueueFullError, TaskQueue } from './taskQueue'
import { hashToken, newToken, tokenMatches } from './tokens'

export const agentSettingsSchema = z.object({
  enabled: z.boolean(),
  port: z.number().int().min(1024).max(65535),
  perHour: z.number().int().min(1).max(500),
  concurrency: z.number().int().min(1).max(4)
})
export type AgentSettings = z.infer<typeof agentSettingsSchema>
export const DEFAULT_AGENT_SETTINGS: AgentSettings = { enabled: false, port: 47831, perHour: 20, concurrency: 1 }

export const storedClientSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(60),
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.number(),
  approved: z.boolean(),
  lastSeenAt: z.number().nullable(),
  requestCount: z.number().int()
})
export type StoredClient = z.infer<typeof storedClientSchema>

export type ExchangeStore = {
  insert(e: AgentExchange): void
  update(id: string, patch: Partial<AgentExchange>): void
  get(id: string): AgentExchange | null
  list(limit: number, clientId?: string): AgentExchange[]
}

/** Server HTTP thật (agents/httpServer.ts) — tách ra để test hub không cần mở cổng. */
export type ServerPort = { start(port: number): Promise<string>; stop(): Promise<void> }

export type AgentHubDeps = {
  getSettings(): AgentSettings
  setSettings(s: AgentSettings): void
  getClients(): StoredClient[]
  setClients(list: StoredClient[]): void
  exchanges: ExchangeStore
  killSwitch: KillSwitch
  /** Tạo server HTTP (nhận chính hub để xử lý tool) — tách ra để test / thay thế. */
  serverFactory(hub: AgentHub): ServerPort
  /** Mizuki trả lời (không tool, không trí nhớ). */
  answer(input: { agentName: string; request: string; kind: 'ask' | 'task'; title?: string }, signal: AbortSignal): Promise<string>
  /** Tool Mizuki được cấp khi trả lời agent — hiện luôn rỗng; có tool thì từng yêu cầu phải duyệt. */
  grantedTools?(): string[]
  emitStatus(s: AgentServerStatus): void
  emitNotice(n: AgentNotice): void
  log: { info(msg: string): void; warn(msg: string): void }
  now?: () => number
  /** Thời gian chờ người dùng duyệt agent mới. */
  pairingTimeoutMs?: number
  /** ask_mizuki chờ tối đa bấy lâu rồi trả mã việc để agent hỏi lại sau. */
  askWaitMs?: number
}

export class AgentError extends Error {}

const HOLDER = 'agents'
const MAX_INPUT_CHARS = 20_000
const clip = (s: string, n = 4_000): string => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/**
 * Kết nối với agent khác qua MCP: token theo từng agent (chỉ lưu bản băm), duyệt lần đầu kết nối,
 * giới hạn tần suất, hàng đợi 1 việc, ghi lịch sử, dừng khẩn cấp dùng chung với điều khiển máy tính.
 */
export class AgentHub {
  private url: string | null = null
  private error: string | null = null
  private pending = new Map<string, { at: number; waiters: ((ok: boolean) => void)[] }>()
  private readonly limiter: RateLimiter
  private readonly queue: TaskQueue
  private readonly server: ServerPort

  constructor(private readonly deps: AgentHubDeps) {
    this.limiter = new RateLimiter(() => deps.getSettings().perHour, () => this.now())
    this.queue = new TaskQueue(() => deps.getSettings().concurrency)
    this.server = deps.serverFactory(this)
    deps.killSwitch.onStop(() => void this.emergencyStop())
  }

  /** Lúc mở app: đã bật từ trước thì giữ phím dừng và mở server (lỗi → ghi lại, không chặn app). */
  async restore(): Promise<void> {
    if (!this.deps.getSettings().enabled) {
      this.changed()
      return
    }
    if (!this.deps.killSwitch.arm(HOLDER)) {
      this.error = 'hotkey_unavailable'
      this.deps.log.warn('Kết nối agent: không đăng ký được phím dừng khẩn cấp — không mở server')
      this.changed()
      return
    }
    await this.startServer()
  }

  status(): AgentServerStatus {
    const s = this.deps.getSettings()
    return {
      enabled: s.enabled,
      running: this.url !== null,
      url: this.url,
      port: s.port,
      error: this.error,
      armed: this.deps.killSwitch.isHeldBy(HOLDER),
      limits: { perHour: s.perHour, concurrency: s.concurrency },
      clients: this.deps.getClients().map(publicClient),
      pending: [...this.pending.entries()].map(([clientId, p]) => ({
        clientId,
        name: this.deps.getClients().find((c) => c.id === clientId)?.name ?? '?',
        at: p.at
      }))
    }
  }

  async setEnabled(enabled: boolean): Promise<AgentServerStatus> {
    const s = this.deps.getSettings()
    if (!enabled) {
      await this.stopServer()
      this.deps.killSwitch.disarm(HOLDER)
      this.deps.setSettings({ ...s, enabled: false })
      return this.changed()
    }
    // Phanh phải có trước: không đăng ký được Ctrl+Alt+Q thì không mở cổng.
    if (!this.deps.killSwitch.arm(HOLDER)) throw new AgentError('hotkey_unavailable')
    this.deps.setSettings({ ...s, enabled: true })
    await this.startServer()
    return this.changed()
  }

  setLimits(limits: { perHour: number; concurrency: number }): AgentServerStatus {
    this.deps.setSettings(agentSettingsSchema.parse({ ...this.deps.getSettings(), ...limits }))
    return this.changed()
  }

  /** Tạo token cho một agent — token chỉ trả về lần này. */
  createClient(name: string, bridgeCommand: { exe: string; script: string }): NewAgentToken {
    const token = newToken()
    const client: StoredClient = {
      id: randomUUID(),
      name: name.trim().slice(0, 60),
      tokenHash: hashToken(token),
      createdAt: this.now(),
      approved: false,
      lastSeenAt: null,
      requestCount: 0
    }
    this.deps.setClients([...this.deps.getClients(), client])
    this.deps.log.info(`Kết nối agent: tạo token cho "${client.name}"`)
    this.changed()
    const url = this.endpoint()
    return { client: publicClient(client), token, ...setupSnippets(url, token, bridgeCommand) }
  }

  /** Thu hồi quyền: xoá token — agent đó không gọi được nữa. */
  revoke(clientId: string): AgentServerStatus {
    this.deps.setClients(this.deps.getClients().filter((c) => c.id !== clientId))
    this.settlePending(clientId, false)
    this.limiter.reset(clientId)
    this.deps.log.info(`Kết nối agent: thu hồi ${clientId}`)
    return this.changed()
  }

  /** Người dùng bấm Cho phép / Từ chối agent mới. Từ chối = thu hồi luôn token. */
  respondPairing(clientId: string, allow: boolean): AgentServerStatus {
    if (allow) this.updateClient(clientId, { approved: true })
    else this.deps.setClients(this.deps.getClients().filter((c) => c.id !== clientId))
    this.settlePending(clientId, allow)
    return this.changed()
  }

  authenticate(token: string | null): StoredClient | null {
    if (!token) return null
    return this.deps.getClients().find((c) => tokenMatches(token, c.tokenHash)) ?? null
  }

  /** Lần đầu kết nối phải được người dùng duyệt; chờ tối đa pairingTimeoutMs. */
  ensureApproved(client: StoredClient): Promise<boolean> {
    if (client.approved) return Promise.resolve(true)
    return new Promise<boolean>((resolve) => {
      const entry = this.pending.get(client.id) ?? { at: this.now(), waiters: [] }
      entry.waiters.push(resolve)
      const isNew = !this.pending.has(client.id)
      this.pending.set(client.id, entry)
      if (isNew) {
        this.deps.log.info(`Kết nối agent: "${client.name}" chờ duyệt lần đầu`)
        this.changed()
      }
      setTimeout(() => {
        const i = entry.waiters.indexOf(resolve)
        if (i >= 0) {
          entry.waiters.splice(i, 1)
          resolve(false)
        }
      }, this.deps.pairingTimeoutMs ?? 60_000)
    })
  }

  /** ask_mizuki: hỏi và chờ câu trả lời (lâu quá thì trả mã việc). */
  async ask(client: StoredClient, request: string): Promise<{ text: string } | { error: string }> {
    const started = this.begin(client, 'ask_mizuki', request)
    if ('error' in started) return started
    const wait = this.deps.askWaitMs ?? 100_000
    const done = started.promise.then((text) => ({ text }), (e: Error) => ({ error: e.message }))
    const timeout = new Promise<{ pending: true }>((r) => setTimeout(() => r({ pending: true }), wait))
    const r = await Promise.race([done, timeout])
    if ('pending' in r) return { text: `Việc còn đang chạy (mã ${started.id}). Gọi get_task với id này để lấy kết quả sau.` }
    return r
  }

  /** submit_task: giao việc, trả mã ngay. */
  submit(client: StoredClient, title: string, instructions: string): { id: string } | { error: string } {
    const started = this.begin(client, 'submit_task', instructions, title)
    if ('error' in started) return started
    started.promise.catch(() => {}) // kết quả/lỗi đã ghi vào lịch sử
    return { id: started.id }
  }

  /** get_task / list_tasks chỉ thấy việc của chính agent đó. */
  getTask(client: StoredClient, id: string): AgentExchange | null {
    const e = this.deps.exchanges.get(id)
    return e && e.clientId === client.id ? e : null
  }

  listTasks(client: StoredClient): AgentExchange[] {
    return this.deps.exchanges.list(20, client.id)
  }

  exchanges(limit = 100): AgentExchange[] {
    return this.deps.exchanges.list(limit)
  }

  /** Thoát app: đóng server nhưng giữ cài đặt (mở lại app thì tự bật lại). */
  async shutdown(): Promise<void> {
    this.queue.abortAll('app_quit')
    await this.stopServer()
  }

  /** "Ngắt tất cả" hoặc Ctrl+Alt+Q: huỷ mọi việc, đóng server, tắt tính năng (phải bật lại tay). */
  async emergencyStop(): Promise<void> {
    if (!this.deps.getSettings().enabled && !this.url) return
    this.queue.abortAll('stopped')
    for (const id of [...this.pending.keys()]) this.settlePending(id, false)
    await this.stopServer()
    this.deps.killSwitch.disarm(HOLDER)
    this.deps.setSettings({ ...this.deps.getSettings(), enabled: false })
    this.deps.log.warn('Kết nối agent: DỪNG — đã ngắt mọi kết nối')
    this.deps.emitNotice({ kind: 'stopped', at: this.now() })
    this.changed()
  }

  private begin(
    client: StoredClient,
    tool: string,
    request: string,
    title?: string
  ): { id: string; promise: Promise<string> } | { error: string } {
    if (needsPerRequestApproval(this.deps.grantedTools?.() ?? [])) {
      return { error: 'Yêu cầu có dùng tool phải được người dùng duyệt từng lần — chưa hỗ trợ, đã từ chối.' }
    }
    if (request.length > MAX_INPUT_CHARS) return { error: `Yêu cầu quá dài (tối đa ${MAX_INPUT_CHARS} ký tự).` }

    const id = randomUUID()
    const base: AgentExchange = {
      id,
      clientId: client.id,
      clientName: client.name,
      tool,
      input: clip(title ? `${title}\n\n${request}` : request),
      output: null,
      status: 'queued',
      error: null,
      createdAt: this.now(),
      finishedAt: null
    }
    const limited = this.limiter.take(client.id)
    if (!limited.ok) {
      const at = new Date(this.now() + limited.retryAfterSec * 1000)
      const hhmm = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
      this.deps.exchanges.insert({ ...base, status: 'rejected', error: 'rate_limited', finishedAt: this.now() })
      this.changed()
      this.deps.emitNotice({ kind: 'rate_limited', clientName: client.name, at: this.now(), retryAfterSec: limited.retryAfterSec })
      this.deps.log.warn(`Kết nối agent: "${client.name}" chạm giới hạn ${this.deps.getSettings().perHour}/giờ`)
      return {
        error: `Đã chạm giới hạn ${this.deps.getSettings().perHour} yêu cầu/giờ. Thử lại sau ${Math.ceil(limited.retryAfterSec / 60)} phút (lúc ${hhmm}).`
      }
    }

    this.updateClient(client.id, { lastSeenAt: this.now(), requestCount: client.requestCount + 1 })
    this.deps.exchanges.insert(base)
    this.changed()
    let promise: Promise<string>
    try {
      promise = this.queue.push(
        (signal) => this.deps.answer({ agentName: client.name, request, kind: tool === 'submit_task' ? 'task' : 'ask', title }, signal),
        () => {
          this.deps.exchanges.update(id, { status: 'running' })
          this.changed()
        }
      )
    } catch (err) {
      return { error: (err as Error).message }
    }
    promise = promise.then(
      (text) => {
        this.deps.exchanges.update(id, { status: 'done', output: clip(text, 20_000), finishedAt: this.now() })
        this.changed()
        return text
      },
      (err: Error) => {
        const queueFull = err instanceof QueueFullError
        this.deps.exchanges.update(id, { status: queueFull ? 'rejected' : 'error', error: err.message, finishedAt: this.now() })
        this.changed()
        if (queueFull) this.deps.emitNotice({ kind: 'queue_full', clientName: client.name, at: this.now() })
        throw queueFull ? new Error('Mizuki đang bận với nhiều việc — thử lại sau ít phút.') : err
      }
    )
    return { id, promise }
  }

  private async startServer(): Promise<void> {
    try {
      this.url = await this.server.start(this.deps.getSettings().port)
      this.error = null
      this.deps.log.info(`Kết nối agent: MCP server ở ${this.url}`)
    } catch (err) {
      this.url = null
      this.error = (err as NodeJS.ErrnoException).code === 'EADDRINUSE' ? 'port_in_use' : (err as Error).message
      this.deps.log.warn(`Kết nối agent: không mở được server: ${(err as Error).message}`)
    }
    this.changed()
  }

  private async stopServer(): Promise<void> {
    await this.server.stop().catch(() => {})
    this.url = null
  }

  private endpoint(): string {
    return this.url ?? `http://127.0.0.1:${this.deps.getSettings().port}/mcp`
  }

  private updateClient(id: string, patch: Partial<StoredClient>): void {
    this.deps.setClients(this.deps.getClients().map((c) => (c.id === id ? { ...c, ...patch } : c)))
  }

  private settlePending(clientId: string, ok: boolean): void {
    const entry = this.pending.get(clientId)
    if (!entry) return
    this.pending.delete(clientId)
    for (const w of entry.waiters) w(ok)
  }

  private changed(): AgentServerStatus {
    const s = this.status()
    this.deps.emitStatus(s)
    return s
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}

function publicClient(c: StoredClient): AgentClient {
  const { tokenHash: _hash, ...rest } = c
  return rest
}

/** Lệnh cấu hình sẵn cho Claude Code (HTTP) và Claude Desktop (cầu nối stdio). */
export function setupSnippets(url: string, token: string, bridge: { exe: string; script: string }): { claudeCode: string; claudeDesktop: string } {
  const claudeCode = JSON.stringify({ type: 'http', url, headers: { Authorization: `Bearer ${token}` } })
  return {
    claudeCode: `claude mcp add-json mizuki '${claudeCode}'`,
    claudeDesktop: JSON.stringify(
      {
        mcpServers: {
          mizuki: {
            command: bridge.exe,
            args: [bridge.script],
            env: { ELECTRON_RUN_AS_NODE: '1', MIZUKI_URL: url, MIZUKI_TOKEN: token }
          }
        }
      },
      null,
      2
    )
  }
}
