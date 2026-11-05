import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { cleanEnv, killTree } from './process'

type Pending = { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }

export type SidecarClientOptions = {
  /** Lệnh chạy sidecar; null = chưa cài. Xem `pythonCommand`. */
  command(): { cmd: string; args: string[] } | null
  log: { warn(msg: string): void }
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 20_000

/**
 * Gọi Python sidecar qua stdin/stdout (mỗi dòng một JSON). Khởi động khi cần; một yêu cầu quá giờ
 * (UIA có thể treo khi app đích không phản hồi) → kill tiến trình, lần gọi sau tự khởi động lại.
 */
export class SidecarClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private pending = new Map<number, Pending>()
  private nextId = 1

  constructor(private readonly opts: SidecarClientOptions) {}

  get running(): boolean {
    return this.child !== null
  }

  async call<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS): Promise<T> {
    const child = this.ensure()
    const id = this.nextId++
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        this.opts.log.warn(`Sidecar không trả lời "${method}" sau ${timeoutMs} ms — khởi động lại`)
        this.stop()
        reject(new Error('Sidecar không phản hồi (có thể ứng dụng đích đang treo). Thử lại sau.'))
      }, timeoutMs)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      child.stdin.write(JSON.stringify({ id, method, params }) + '\n')
    })
  }

  /** Dừng tiến trình (dừng khẩn cấp, gỡ cài đặt, thoát app). Yêu cầu đang chờ bị huỷ. */
  stop(): void {
    const child = this.child
    this.child = null
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer)
      p.reject(new Error('Sidecar đã dừng.'))
      this.pending.delete(id)
    }
    if (child && child.exitCode === null) killTree(child)
  }

  private ensure(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child
    const command = this.opts.command()
    if (!command) throw new Error('Chưa cài Python sidecar.')
    const child = spawn(command.cmd, command.args, {
      env: cleanEnv(process.env, { PYTHONIOENCODING: 'utf-8' }),
      windowsHide: true
    })
    this.child = child
    let stderr = ''
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr = (stderr + d).slice(-2_000)))
    createInterface({ input: child.stdout }).on('line', (line) => {
      let msg: { id?: number; result?: unknown; error?: string }
      try {
        msg = JSON.parse(line)
      } catch {
        return
      }
      const p = msg.id !== undefined ? this.pending.get(msg.id) : undefined
      if (!p) return
      clearTimeout(p.timer)
      this.pending.delete(msg.id!)
      if (msg.error) p.reject(new Error(msg.error))
      else p.resolve(msg.result)
    })
    const onExit = (code: number | null): void => {
      if (this.child !== child) return
      this.child = null
      if (this.pending.size) this.opts.log.warn(`Sidecar thoát (mã ${code}): ${stderr.trim().slice(-300)}`)
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer)
        p.reject(new Error(`Sidecar dừng bất thường (mã ${code}).`))
        this.pending.delete(id)
      }
    }
    child.on('exit', onExit)
    child.on('error', (err) => {
      stderr += err.message
      onExit(null)
    })
    child.stdin.on('error', () => {})
    return child
  }
}

/** -I: cô lập (không đọc thư mục hiện tại / site-packages của người dùng); -W ignore: bỏ cảnh báo thư viện. */
export function pythonCommand(python: string, script: string): { cmd: string; args: string[] } {
  return { cmd: python, args: ['-I', '-W', 'ignore', script] }
}
