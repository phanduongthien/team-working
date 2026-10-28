import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { ChatMode, CliStatus } from '@shared/ai'

const execFileAsync = promisify(execFile)

/** Chọn executable từ output `where claude`: ưu tiên .exe, sau đó .cmd/.bat. */
export function pickClaudeExecutable(whereOutput: string): string | null {
  const candidates = whereOutput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  return (
    candidates.find((c) => /\.exe$/i.test(c)) ??
    candidates.find((c) => /\.(cmd|bat)$/i.test(c)) ??
    null
  )
}

export function parseVersion(stdout: string): string | null {
  const match = stdout.match(/\d+\.\d+\.\d+/)
  return match ? match[0] : null
}

export type AuthStatus = { loggedIn: boolean; subscriptionType?: string }

/** Chỉ giữ trường cần thiết từ `claude auth status` — không giữ email/orgId. */
export function parseAuthStatus(stdout: string): AuthStatus | null {
  try {
    const data = JSON.parse(stdout) as { loggedIn?: unknown; subscriptionType?: unknown }
    if (typeof data.loggedIn !== 'boolean') return null
    return {
      loggedIn: data.loggedIn,
      subscriptionType: typeof data.subscriptionType === 'string' ? data.subscriptionType : undefined
    }
  } catch {
    return null
  }
}

export type CliRunOptions = {
  mode: ChatMode
  systemPromptFile: string
  sessionId?: string
  /** Tool được phép; rỗng = không tool nào. */
  tools: string[]
  /** Không lưu session (lượt gọi một lần). */
  ephemeral?: boolean
}

/**
 * Dựng args cho `claude -p`. Prompt KHÔNG nằm trong args (đi qua stdin), system prompt
 * đi qua file — nhờ vậy args chỉ gồm cờ cố định, UUID, tên tool và đường dẫn file tạm.
 *
 * `--restricted`: bỏ qua settings/hook của người dùng & project, tắt auto-memory của CLI
 * (app tự quản lý trí nhớ qua bước duyệt). `--strict-mcp-config`: không nạp MCP server.
 * Chế độ Code giữ system prompt mặc định của Claude Code (append), các chế độ khác thay thế.
 */
export function buildCliArgs(opts: CliRunOptions): string[] {
  const args = [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--restricted',
    '--strict-mcp-config',
    '--tools',
    opts.tools.join(','),
    opts.mode === 'code' ? '--append-system-prompt-file' : '--system-prompt-file',
    opts.systemPromptFile
  ]
  if (opts.tools.length > 0) args.push('--allowedTools', opts.tools.join(','))
  if (opts.sessionId) args.push('--resume', opts.sessionId)
  if (opts.ephemeral) args.push('--no-session-persistence')
  return args
}

/**
 * CLI đọc file đính kèm bằng tool Read (ảnh, PDF, text đều được). File đã nằm trong
 * workspace (cwd) nên --restricted vẫn cho đọc; prompt chỉ liệt kê đường dẫn.
 */
export function promptWithAttachments(prompt: string, paths: string[]): string {
  if (paths.length === 0) return prompt
  const list = paths.map((p) => `- ${p}`).join('\n')
  return `${prompt}\n\n[Người dùng đính kèm ${paths.length} file — hãy đọc bằng công cụ Read trước khi trả lời]\n${list}`
}

const SAFE_ARG = /^[\w\-.:\\/ ,]*$/

/**
 * Ghép dòng lệnh cho cmd.exe khi claude là shim .cmd (Node không spawn .cmd trực tiếp
 * nếu không có shell). Từ chối mọi ký tự có thể bị cmd.exe diễn giải.
 */
export function buildCmdLine(executable: string, args: string[]): string {
  for (const part of [executable, ...args]) {
    if (!SAFE_ARG.test(part)) throw new Error(`Unsafe CLI argument: ${part}`)
  }
  const quote = (s: string): string => (s === '' || /\s/.test(s) ? `"${s}"` : s)
  return `"${[executable, ...args].map(quote).join(' ')}"`
}

export function isCmdShim(executable: string): boolean {
  return /\.(cmd|bat)$/i.test(executable)
}

async function run(executable: string, args: string[], timeout = 15_000): Promise<string> {
  if (isCmdShim(executable)) {
    const { stdout } = await execFileAsync(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', buildCmdLine(executable, args)],
      { timeout, windowsHide: true, windowsVerbatimArguments: true }
    )
    return stdout
  }
  const { stdout } = await execFileAsync(executable, args, { timeout, windowsHide: true })
  return stdout
}

export async function findClaudeExecutable(): Promise<string | null> {
  try {
    const finder = process.platform === 'win32' ? 'where.exe' : 'which'
    const { stdout } = await execFileAsync(finder, ['claude'], { windowsHide: true })
    return process.platform === 'win32' ? pickClaudeExecutable(stdout) : stdout.trim() || null
  } catch {
    return null
  }
}

/** Kiểm tra CLI đã cài & đã đăng nhập. Không đọc file credential của Claude Code. */
export async function checkClaudeCli(): Promise<CliStatus> {
  const executablePath = await findClaudeExecutable()
  if (!executablePath) return { state: 'not_installed' }

  let version: string | null
  try {
    version = parseVersion(await run(executablePath, ['--version']))
  } catch (err) {
    return { state: 'error', executablePath, message: (err as Error).message }
  }
  if (!version) return { state: 'error', executablePath, message: 'unknown_version' }

  let auth: AuthStatus | null = null
  try {
    auth = parseAuthStatus(await run(executablePath, ['auth', 'status']))
  } catch (err) {
    // `auth status` thoát mã khác 0 khi chưa đăng nhập nhưng vẫn in JSON ra stdout.
    const stdout = (err as { stdout?: string }).stdout
    auth = stdout ? parseAuthStatus(stdout) : null
  }
  if (!auth?.loggedIn) return { state: 'not_logged_in', version, executablePath }
  return { state: 'ok', version, executablePath, subscriptionType: auth.subscriptionType }
}
