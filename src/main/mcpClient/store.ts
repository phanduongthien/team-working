import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { McpServerInfo } from '@shared/agents'
import { mcpServerInputSchema, type McpServerInput } from '@shared/schemas'
import type { Encryptor } from '../services/secrets'

/** Tên bị app dùng riêng — server của người dùng không được trùng. */
export const RESERVED_NAMES = ['mmc', 'twperm', 'mizuki']

const storedSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string(),
    type: z.enum(['stdio', 'http']),
    command: z.string().nullable(),
    args: z.array(z.string()),
    url: z.string().nullable(),
    enabled: z.boolean(),
    secretKeys: z.array(z.string()),
    alwaysAllow: z.array(z.string())
  })
)

type Secrets = Record<string, { env: Record<string, string>; headers: Record<string, string> }>

export type SettingsPort = { get(): McpServerInfo[]; set(list: McpServerInfo[]): void }

/** Cấu hình server cho Claude CLI (--mcp-config). */
export type CliServerEntry =
  | { command: string; args: string[]; env: Record<string, string> }
  | { type: 'http'; url: string; headers: Record<string, string> }

/**
 * MCP server do người dùng thêm. Cấu hình thường nằm trong bảng settings; giá trị bí mật (biến môi
 * trường, header — vd token) mã hoá bằng Windows DPAPI trong `secrets/mcp-servers.bin`, không bao giờ
 * trả về renderer (renderer chỉ thấy tên khoá).
 */
export class McpServerStore {
  private readonly file: string

  constructor(
    private readonly settings: SettingsPort,
    secretsDir: string,
    private readonly crypto: Encryptor
  ) {
    this.file = join(secretsDir, 'mcp-servers.bin')
  }

  list(): McpServerInfo[] {
    const parsed = storedSchema.safeParse(this.settings.get())
    return parsed.success ? parsed.data : []
  }

  /** Thêm / sửa. Giá trị bí mật để trống = giữ giá trị cũ của khoá đó. */
  save(input: McpServerInput): McpServerInfo {
    const data = mcpServerInputSchema.parse(input)
    if (RESERVED_NAMES.includes(data.name)) throw new Error('reserved_name')
    const list = this.list()
    if (list.some((s) => s.name === data.name && s.id !== data.id)) throw new Error('duplicate_name')
    if (!this.crypto.isEncryptionAvailable() && (Object.keys(data.env).length || Object.keys(data.headers).length)) {
      throw new Error('secure_storage_unavailable')
    }
    const id = data.id ?? randomUUID()
    const old = list.find((s) => s.id === id)
    const secrets = this.readSecrets()
    const prev = secrets[id] ?? { env: {}, headers: {} }
    const merge = (next: Record<string, string>, before: Record<string, string>): Record<string, string> =>
      Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v === '' ? (before[k] ?? '') : v]).filter(([, v]) => v !== ''))
    secrets[id] = { env: merge(data.env, prev.env), headers: merge(data.headers, prev.headers) }
    this.writeSecrets(secrets)

    const info: McpServerInfo = {
      id,
      name: data.name,
      type: data.type,
      command: data.type === 'stdio' ? data.command : null,
      args: data.type === 'stdio' ? data.args : [],
      url: data.type === 'http' ? data.url : null,
      enabled: data.enabled,
      secretKeys: [...Object.keys(secrets[id].env), ...Object.keys(secrets[id].headers)],
      // Đổi tên server thì quyền "luôn cho phép" cũ không còn đúng tên tool → bỏ.
      alwaysAllow: old && old.name === data.name ? old.alwaysAllow : []
    }
    this.settings.set(old ? list.map((s) => (s.id === id ? info : s)) : [...list, info])
    return info
  }

  remove(id: string): void {
    this.settings.set(this.list().filter((s) => s.id !== id))
    const secrets = this.readSecrets()
    delete secrets[id]
    this.writeSecrets(secrets)
  }

  setEnabled(id: string, enabled: boolean): void {
    this.settings.set(this.list().map((s) => (s.id === id ? { ...s, enabled } : s)))
  }

  allowAlways(server: string, tool: string): void {
    this.settings.set(this.list().map((s) => (s.name === server && !s.alwaysAllow.includes(tool) ? { ...s, alwaysAllow: [...s.alwaysAllow, tool] } : s)))
  }

  revokeAlways(id: string, tool: string): void {
    this.settings.set(this.list().map((s) => (s.id === id ? { ...s, alwaysAllow: s.alwaysAllow.filter((t) => t !== tool) } : s)))
  }

  isUserServer(name: string): boolean {
    return this.list().some((s) => s.name === name)
  }

  /** Server đang bật → cấu hình cho CLI + danh sách tool được tự duyệt ("luôn cho phép"). */
  forCli(): { servers: Record<string, CliServerEntry>; allowedTools: string[] } | null {
    const enabled = this.list().filter((s) => s.enabled)
    if (enabled.length === 0) return null
    const secrets = this.readSecrets()
    const servers: Record<string, CliServerEntry> = {}
    for (const s of enabled) {
      const sec = secrets[s.id] ?? { env: {}, headers: {} }
      servers[s.name] = s.type === 'stdio' ? { command: s.command ?? '', args: s.args, env: sec.env } : { type: 'http', url: s.url ?? '', headers: sec.headers }
    }
    const allowedTools = enabled.flatMap((s) => s.alwaysAllow.map((t) => `mcp__${s.name}__${t}`))
    return { servers, allowedTools }
  }

  private readSecrets(): Secrets {
    if (!existsSync(this.file) || !this.crypto.isEncryptionAvailable()) return {}
    try {
      return JSON.parse(this.crypto.decryptString(readFileSync(this.file))) as Secrets
    } catch {
      return {}
    }
  }

  private writeSecrets(secrets: Secrets): void {
    if (!this.crypto.isEncryptionAvailable()) return
    writeFileSync(this.file, this.crypto.encryptString(JSON.stringify(secrets)))
  }
}
