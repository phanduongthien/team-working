import { spawn, type ChildProcess } from 'node:child_process'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { RunResult } from './installer'

const OUTPUT_TAIL = 8_000

/** Dừng cả cây tiến trình (uv tải Python bằng tiến trình con). */
export function killTree(child: ChildProcess): void {
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }).on('error', () => child.kill())
  } else {
    child.kill()
  }
}

/**
 * Môi trường sạch cho uv/Python: giữ biến hệ thống (PATH, SystemRoot, TEMP, proxy…) nhưng bỏ mọi biến
 * Python/uv của người dùng để sidecar không bị cấu hình bên ngoài làm lệch.
 */
export function cleanEnv(base: NodeJS.ProcessEnv, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) continue
    if (/^(PYTHON|UV_|VIRTUAL_ENV$|CONDA|PIP_)/i.test(k)) continue
    if (k === 'ELECTRON_RUN_AS_NODE') continue
    env[k] = v
  }
  return { ...env, PYTHONUTF8: '1', ...extra }
}

/** Chạy một lệnh tới khi xong; huỷ (signal) hoặc quá giờ → kill cả cây, trả code null. */
export function runProcess(
  cmd: string,
  args: string[],
  opts: { env: Record<string, string>; signal: AbortSignal; timeoutMs: number }
): Promise<RunResult> {
  return new Promise((resolve) => {
    if (opts.signal.aborted) return resolve({ code: null, stdout: '', stderr: 'aborted' })
    let stdout = ''
    let stderr = ''
    const child = spawn(cmd, args, { env: cleanEnv(process.env, opts.env), windowsHide: true })
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout = (stdout + d).slice(-OUTPUT_TAIL)))
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr = (stderr + d).slice(-OUTPUT_TAIL)))
    const stop = (): void => killTree(child)
    const timer = setTimeout(() => {
      stderr += '\nquá thời gian chờ (timed out)'
      stop()
    }, opts.timeoutMs)
    opts.signal.addEventListener('abort', stop, { once: true })
    const done = (code: number | null): void => {
      clearTimeout(timer)
      opts.signal.removeEventListener('abort', stop)
      resolve({ code, stdout, stderr })
    }
    child.on('error', (err) => {
      stderr += err.message
      done(null)
    })
    child.on('close', (code) => done(code))
  })
}

/** Giải nén .zip bằng tar.exe có sẵn trong Windows 10/11 (bsdtar đọc được zip). */
export async function extractZip(zip: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true })
  const tar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
  const result = await runProcess(tar, ['-xf', zip, '-C', dest], {
    env: {},
    signal: new AbortController().signal,
    timeoutMs: 120_000
  })
  if (result.code !== 0) throw new Error(`Giải nén thất bại: ${result.stderr.trim().slice(0, 200)}`)
}
