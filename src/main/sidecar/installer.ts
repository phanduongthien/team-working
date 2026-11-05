import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SidecarErrorCode, SidecarState, SidecarStep } from '@shared/sidecar'

/** uv chính thức của Astral — khoá phiên bản + SHA-256 (lấy từ GitHub Release, kiểm tra 2026-11-05). */
export const UV_VERSION = '0.13.7'
export const UV_URL = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`
export const UV_SHA256 = '0cdc5b38fe5a8168ed6a25814f5ba43c21d313dd3187314fccb37b7cec46e021'
export const PYTHON_VERSION = '3.12'
/** Đo thực tế: tải ~50 MB (uv 15 MB + Python ~25 MB + thư viện ~10 MB), chiếm ~120 MB ổ đĩa. */
export const DOWNLOAD_MB = 50
export const DISK_MB = 120

const STEPS: SidecarStep[] = ['uv', 'python', 'packages']
/** Không nhận thêm byte nào trong khoảng này → coi như mất mạng. */
const STALL_MS = 30_000
const STEP_TIMEOUT_MS = 10 * 60 * 1000

export type SidecarPaths = {
  root: string
  uvExe: string
  pythonDir: string
  venvDir: string
  venvPython: string
  cacheDir: string
  marker: string
}

export function sidecarPaths(root: string): SidecarPaths {
  return {
    root,
    uvExe: join(root, 'uv', 'uv.exe'),
    pythonDir: join(root, 'python'),
    venvDir: join(root, 'venv'),
    venvPython: join(root, 'venv', 'Scripts', 'python.exe'),
    cacheDir: join(root, 'cache'),
    marker: join(root, 'installed.json')
  }
}

export type RunResult = { code: number | null; stdout: string; stderr: string }

export type InstallerDeps = {
  root: string
  requirementsFile: string
  uvUrl?: string
  uvSha256?: string
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>
  /** Chạy tiến trình (kill cả cây khi signal abort). */
  run(cmd: string, args: string[], opts: { env: Record<string, string>; signal: AbortSignal; timeoutMs: number }): Promise<RunResult>
  extractZip(zip: string, dest: string): Promise<void>
  emit(state: SidecarState): void
  log: { info(msg: string): void; warn(msg: string): void }
  stallMs?: number
}

export class SidecarError extends Error {
  constructor(
    readonly code: SidecarErrorCode | 'cancelled',
    message: string
  ) {
    super(message)
  }
}

/** Lỗi mạng điển hình (fetch của Node/Electron, thông báo của uv). */
export function isNetworkError(text: string): boolean {
  return /fetch failed|ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|network|dns|timed out|error sending request|failed to download|connect/i.test(
    text
  )
}

/**
 * Cài/gỡ Python sidecar trong thư mục dữ liệu app (không đụng Python của hệ thống):
 *   1. tải uv (có tiến trình + kiểm tra SHA-256)  2. uv python install  3. venv + thư viện (khoá hash)
 * Huỷ hoặc lỗi giữa chừng → xoá sạch thư mục. Mọi biến môi trường của uv trỏ vào thư mục này.
 */
export class SidecarInstaller {
  readonly paths: SidecarPaths
  private controller: AbortController | null = null
  private current: SidecarState

  constructor(private readonly deps: InstallerDeps) {
    this.paths = sidecarPaths(deps.root)
    this.current = { state: 'not_installed', downloadMb: DOWNLOAD_MB, diskMb: DISK_MB }
  }

  get state(): SidecarState {
    return this.current
  }

  /** `controller` được gán đồng bộ ngay đầu install() → hai lần bấm liên tiếp không chạy song song. */
  get busy(): boolean {
    return this.controller !== null || this.current.state === 'uninstalling'
  }

  /** Đọc trạng thái từ đĩa lúc mở app. */
  async refresh(): Promise<SidecarState> {
    if (this.busy) return this.current
    const info = await this.readMarker()
    this.set(info ? await this.installedState(info) : this.notInstalled())
    return this.current
  }

  async install(): Promise<SidecarState> {
    if (this.busy) throw new SidecarError('busy', 'Đang cài hoặc gỡ — vui lòng đợi.')
    const controller = new AbortController()
    this.controller = controller
    const { signal } = controller
    try {
      await rm(this.paths.root, { recursive: true, force: true })
      await mkdir(this.paths.root, { recursive: true })

      this.progress('uv')
      await this.downloadUv(signal)

      this.progress('python')
      await this.uv(['python', 'install', PYTHON_VERSION], signal)

      this.progress('packages')
      await this.uv(['venv', this.paths.venvDir, '--python', PYTHON_VERSION], signal)
      await this.uv(
        ['pip', 'install', '--python', this.paths.venvPython, '--require-hashes', '-r', this.deps.requirementsFile],
        signal
      )
      // Cache chỉ cần lúc cài; xoá để tiết kiệm ổ đĩa.
      await rm(this.paths.cacheDir, { recursive: true, force: true })

      const version = await this.deps.run(this.paths.venvPython, ['--version'], { env: {}, signal, timeoutMs: 30_000 })
      if (version.code !== 0) throw new SidecarError('failed', 'Python sau khi cài không chạy được.')
      const python = `${version.stdout}${version.stderr}`.trim().replace(/^Python\s+/i, '') || PYTHON_VERSION
      const info = { uv: UV_VERSION, python, installedAt: Date.now() }
      await writeFile(this.paths.marker, JSON.stringify(info))
      this.deps.log.info(`Đã cài Python sidecar (${info.python}, uv ${info.uv})`)
      this.set(await this.installedState(info))
    } catch (err) {
      const e = this.normalize(err, signal)
      await rm(this.paths.root, { recursive: true, force: true }).catch(() => {})
      if (e.code === 'cancelled') {
        this.deps.log.info('Đã huỷ cài Python sidecar')
        this.set(this.notInstalled())
      } else {
        this.deps.log.warn(`Cài Python sidecar lỗi (${e.code}): ${e.message}`)
        this.set({ state: 'error', code: e.code, message: e.message, downloadMb: DOWNLOAD_MB, diskMb: DISK_MB })
      }
    } finally {
      this.controller = null
    }
    return this.current
  }

  cancel(): void {
    this.controller?.abort()
  }

  /** Gỡ sạch: uv, Python, thư viện, cache. Gọi `beforeRemove` để dừng tiến trình sidecar trước. */
  async uninstall(beforeRemove: () => Promise<void> | void): Promise<SidecarState> {
    if (this.busy) throw new SidecarError('busy', 'Đang cài hoặc gỡ — vui lòng đợi.')
    this.set({ state: 'uninstalling' })
    try {
      await beforeRemove()
      // Windows có thể giữ file thêm một chút sau khi tiến trình thoát → thử lại vài lần.
      for (let i = 0; ; i++) {
        try {
          await rm(this.paths.root, { recursive: true, force: true })
          break
        } catch (err) {
          if (i >= 4) throw err
          await new Promise((r) => setTimeout(r, 300 * (i + 1)))
        }
      }
      this.deps.log.info('Đã gỡ Python sidecar')
      this.set(this.notInstalled())
    } catch (err) {
      this.set({ state: 'error', code: 'failed', message: `Không xoá được thư mục sidecar: ${(err as Error).message}`, downloadMb: DOWNLOAD_MB, diskMb: DISK_MB })
    }
    return this.current
  }

  private async downloadUv(signal: AbortSignal): Promise<void> {
    const zip = join(this.paths.root, 'uv.zip')
    let res: Response
    try {
      res = await this.deps.fetch(this.deps.uvUrl ?? UV_URL, { signal })
    } catch (err) {
      if (signal.aborted) throw new SidecarError('cancelled', 'cancelled')
      throw new SidecarError('network', `Không tải được uv: ${(err as Error).message}`)
    }
    if (!res.ok || !res.body) throw new SidecarError('network', `Không tải được uv (HTTP ${res.status}).`)
    const total = Number(res.headers.get('content-length')) || undefined
    const hash = createHash('sha256')
    const file = createWriteStream(zip)
    const reader = res.body.getReader()
    let received = 0
    let lastEmit = 0
    let stalled = false
    let timer = setTimeout(() => ((stalled = true), void reader.cancel()), this.deps.stallMs ?? STALL_MS)
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (stalled) throw new SidecarError('network', 'Tải bị treo quá lâu — kiểm tra kết nối mạng.')
        if (done) break
        clearTimeout(timer)
        timer = setTimeout(() => ((stalled = true), void reader.cancel()), this.deps.stallMs ?? STALL_MS)
        hash.update(value)
        received += value.length
        if (!file.write(value)) await new Promise<void>((r) => file.once('drain', () => r()))
        if (Date.now() - lastEmit > 200) {
          lastEmit = Date.now()
          this.progress('uv', received, total)
        }
      }
    } catch (err) {
      if (signal.aborted) throw new SidecarError('cancelled', 'cancelled')
      if (err instanceof SidecarError) throw err
      throw new SidecarError('network', `Mất kết nối khi tải uv: ${(err as Error).message}`)
    } finally {
      clearTimeout(timer)
      await new Promise<void>((r) => file.end(r))
    }
    this.progress('uv', received, total ?? received)
    if (hash.digest('hex') !== (this.deps.uvSha256 ?? UV_SHA256)) {
      throw new SidecarError('checksum', 'File uv tải về không khớp mã kiểm tra (SHA-256) — đã huỷ để an toàn.')
    }
    await this.deps.extractZip(zip, join(this.paths.root, 'uv'))
    await rm(zip, { force: true })
    if (!existsSync(this.paths.uvExe)) throw new SidecarError('failed', 'Giải nén uv không thành công.')
  }

  /** Chạy uv với môi trường cô lập (không đọc cấu hình uv/Python của người dùng). */
  private async uv(args: string[], signal: AbortSignal): Promise<void> {
    if (signal.aborted) throw new SidecarError('cancelled', 'cancelled')
    const env = {
      UV_NO_CONFIG: '1',
      UV_PYTHON_INSTALL_DIR: this.paths.pythonDir,
      UV_CACHE_DIR: this.paths.cacheDir,
      UV_PYTHON_PREFERENCE: 'only-managed',
      UV_NO_PROGRESS: '1',
      UV_PYTHON_DOWNLOADS: 'automatic'
    }
    const { code, stderr } = await this.deps.run(this.paths.uvExe, args, { env, signal, timeoutMs: STEP_TIMEOUT_MS })
    if (signal.aborted) throw new SidecarError('cancelled', 'cancelled')
    if (code !== 0) {
      const tail = stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300)
      throw new SidecarError(isNetworkError(stderr) ? 'network' : 'failed', `uv ${args[0]} lỗi: ${tail || `mã thoát ${code}`}`)
    }
  }

  private normalize(err: unknown, signal: AbortSignal): SidecarError {
    if (signal.aborted) return new SidecarError('cancelled', 'cancelled')
    if (err instanceof SidecarError) return err
    const message = (err as Error).message ?? String(err)
    return new SidecarError(isNetworkError(message) ? 'network' : 'failed', message)
  }

  private progress(step: SidecarStep, received?: number, total?: number): void {
    this.set({ state: 'installing', step, stepIndex: STEPS.indexOf(step) + 1, stepCount: STEPS.length, received, total })
  }

  private notInstalled(): SidecarState {
    return { state: 'not_installed', downloadMb: DOWNLOAD_MB, diskMb: DISK_MB }
  }

  private async readMarker(): Promise<{ uv: string; python: string } | null> {
    if (!existsSync(this.paths.venvPython)) return null
    try {
      const data = JSON.parse(await readFile(this.paths.marker, 'utf8')) as { uv?: unknown; python?: unknown }
      return typeof data.uv === 'string' && typeof data.python === 'string' ? { uv: data.uv, python: data.python } : null
    } catch {
      return null
    }
  }

  private async installedState(info: { uv: string; python: string }): Promise<SidecarState> {
    return { state: 'installed', uv: info.uv, python: info.python, sizeBytes: await dirSize(this.paths.root) }
  }

  private set(state: SidecarState): void {
    this.current = state
    this.deps.emit(state)
  }
}

export async function dirSize(dir: string): Promise<number> {
  let total = 0
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory()) total += await dirSize(p)
    else if (e.isFile()) total += (await stat(p).catch(() => ({ size: 0 }))).size
  }
  return total
}
