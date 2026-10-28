import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import type { ChatEvent } from '@shared/ai'
import type { AIProvider, ChatRequest } from './AIProvider'
import {
  buildCliArgs,
  buildCmdLine,
  checkClaudeCli,
  findClaudeExecutable,
  isCmdShim,
  PERMISSION_TOOL,
  permissionMcpConfig,
  promptWithAttachments
} from './claudeCli'

export type ApprovalBridge = { electronPath: string; script: string; url: string; token: string }

const isInside = (root: string, dir: string): boolean => {
  const rel = relative(resolve(root), resolve(dir))
  return !rel.startsWith('..') && !/^[a-zA-Z]:/.test(rel)
}
import { StreamJsonParser } from './streamJsonParser'
import { AsyncQueue } from './asyncQueue'

type Logger = { warn(msg: string): void; error(msg: string): void }

const STDERR_TAIL = 2_000

/** Trên Windows, kill() chỉ dừng tiến trình cha (cmd.exe với shim .cmd) — dừng cả cây. */
function killTree(child: ChildProcessWithoutNullStreams): void {
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () =>
      child.kill()
    )
  } else {
    child.kill()
  }
}

export class ClaudeCliProvider implements AIProvider {
  readonly id = 'claude-cli'
  readonly stateful = true
  private executable: string | null = null

  constructor(
    private readonly log: Logger,
    /** Cầu nối duyệt quyền (chế độ Code có sửa file); null nếu chưa sẵn sàng. */
    private readonly getApprovalBridge: () => ApprovalBridge | null = () => null
  ) {}

  async isAvailable(): Promise<{ ok: boolean; reason?: string }> {
    const status = await checkClaudeCli()
    if (status.state === 'ok') this.executable = status.executablePath ?? null
    return status.state === 'ok' ? { ok: true } : { ok: false, reason: status.state }
  }

  async *chat(req: ChatRequest, signal: AbortSignal): AsyncIterable<ChatEvent> {
    const executable = this.executable ?? (await findClaudeExecutable())
    if (!executable) {
      yield { type: 'error', message: 'not_installed' }
      return
    }
    this.executable = executable

    const dir = join(tmpdir(), 'team-working')
    await mkdir(dir, { recursive: true })
    const systemPromptFile = join(dir, `system-${randomUUID()}.md`)
    await writeFile(systemPromptFile, req.systemPrompt, 'utf8')

    const attachmentPaths = (req.attachments ?? []).map((a) => a.path)
    const withRead = (list: string[]): string[] => [...new Set([...list, ...(attachmentPaths.length ? ['Read'] : [])])]
    const tools = withRead(req.tools ?? [])

    // Duyệt từng lần sửa file qua app: MCP server chạy bằng chính Electron.
    let mcpConfigFile: string | undefined
    const bridge = req.approval ? this.getApprovalBridge() : null
    if (req.approval && !bridge) {
      await rm(systemPromptFile, { force: true })
      yield { type: 'error', message: 'approval_unavailable' }
      return
    }
    if (bridge && req.approval) {
      mcpConfigFile = join(dir, `mcp-${randomUUID()}.json`)
      await writeFile(mcpConfigFile, permissionMcpConfig({ ...bridge, conversationId: req.approval.conversationId }), 'utf8')
    }

    const args = buildCliArgs({
      mode: req.mode,
      systemPromptFile,
      sessionId: req.sessionId,
      tools,
      allowedTools: req.allowedTools ? withRead(req.allowedTools) : undefined,
      mcpConfigFile,
      permissionTool: mcpConfigFile ? PERMISSION_TOOL : undefined,
      // File đính kèm nằm ở workspace; ở chế độ Code (cwd = dự án) phải cho phép đọc thêm thư mục đó.
      addDirs: [...new Set(attachmentPaths.map((p) => dirname(p)))].filter((d) => !isInside(req.cwd, d)),
      ephemeral: req.ephemeral
    })
    const prompt = promptWithAttachments(req.prompt, attachmentPaths)
    const cleanup = async (): Promise<void> => {
      await rm(systemPromptFile, { force: true })
      if (mcpConfigFile) await rm(mcpConfigFile, { force: true })
    }

    const queue = new AsyncQueue<ChatEvent>()
    let child: ChildProcessWithoutNullStreams
    try {
      child = this.spawnCli(executable, args, req.cwd)
    } catch (err) {
      await cleanup()
      yield { type: 'error', message: (err as Error).message }
      return
    }

    const parser = new StreamJsonParser((line) => this.log.warn(`claude: bỏ qua dòng ${line.slice(0, 200)}`))
    let stderr = ''
    const onAbort = (): void => killTree(child)
    signal.addEventListener('abort', onAbort, { once: true })

    createInterface({ input: child.stdout }).on('line', (line) => {
      for (const event of parser.push(line)) queue.push(event)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(-STDERR_TAIL)
    })
    child.on('error', (err) => {
      queue.push({ type: 'error', message: err.message })
      queue.close()
    })
    child.on('close', (code) => {
      if (!parser.hasResult && !signal.aborted) {
        const message = stderr.trim() || `claude exited with code ${code ?? 'null'}`
        this.log.error(`claude thoát bất thường: ${message}`)
        queue.push({ type: 'error', message })
      }
      queue.close()
    })

    child.stdin.on('error', () => {})
    child.stdin.end(prompt, 'utf8')

    try {
      for await (const event of queue) {
        if (signal.aborted) break
        yield event
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      if (child.exitCode === null) killTree(child)
      await cleanup()
    }
  }

  private spawnCli(executable: string, args: string[], cwd: string): ChildProcessWithoutNullStreams {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const options = { cwd, env, windowsHide: true }
    if (isCmdShim(executable)) {
      return spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', buildCmdLine(executable, args)], {
        ...options,
        windowsVerbatimArguments: true
      })
    }
    return spawn(executable, args, options)
  }
}
