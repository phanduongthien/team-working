import { createHash } from 'node:crypto'
import { createWriteStream, existsSync } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import type { VoiceComponent, VoicePackState } from '@shared/voice'
import { isNetworkError, type RunResult, type SidecarPaths } from '../sidecar/installer'
import { MODELS, fileUrl, type ModelSpec } from './catalog'

export type VoiceInstallerDeps = {
  /** Thư mục chứa model (trong dữ liệu app). */
  modelsDir: string
  sidecar(): { installed: boolean; paths: SidecarPaths }
  requirements: { packages: string; cuda: string }
  fetch: (url: string, init: { signal: AbortSignal }) => Promise<Response>
  run(
    cmd: string,
    args: string[],
    opts: { env: Record<string, string>; signal: AbortSignal; timeoutMs: number }
  ): Promise<RunResult>
  emit(state: VoicePackState): void
  log: { info(msg: string): void; warn(msg: string): void }
}

class VoiceInstallError extends Error {
  constructor(
    readonly code: 'network' | 'checksum' | 'failed' | 'sidecar_missing' | 'cancelled',
    message: string
  ) {
    super(message)
  }
}

const MARKER = 'voice-installed.json'

/**
 * Gói giọng nói — chỉ tải khi người dùng bấm, từng phần: thư viện Python (vào venv của sidecar),
 * thư viện CUDA (chỉ máy có GPU NVIDIA), từng model. Model tải về file .part, kiểm SHA-256 rồi mới đổi tên.
 */
export class VoiceInstaller {
  private controller: AbortController | null = null
  private current: VoicePackState = { state: 'idle' }

  constructor(private readonly deps: VoiceInstallerDeps) {}

  get state(): VoicePackState {
    return this.current
  }

  modelDir(component: Exclude<VoiceComponent, 'packages' | 'cuda'>): string {
    return join(this.deps.modelsDir, MODELS[component].dir)
  }

  piperModelPath(): string {
    return join(this.modelDir('piper'), basename(MODELS.piper.files[0].name))
  }

  private async marker(): Promise<Partial<Record<VoiceComponent, boolean>>> {
    const { paths } = this.deps.sidecar()
    try {
      return JSON.parse(await readFile(join(paths.root, MARKER), 'utf8')) as Partial<
        Record<VoiceComponent, boolean>
      >
    } catch {
      return {}
    }
  }

  async installed(): Promise<Record<VoiceComponent, boolean>> {
    const side = this.deps.sidecar()
    const m = side.installed ? await this.marker() : {}
    const model = (c: Exclude<VoiceComponent, 'packages' | 'cuda'>): boolean =>
      MODELS[c].files.every((f) => existsSync(join(this.modelDir(c), basename(f.name))))
    return {
      packages: !!m.packages,
      cuda: !!m.cuda,
      piper: model('piper'),
      base: model('base'),
      small: model('small'),
      medium: model('medium'),
      'large-v3-turbo': model('large-v3-turbo')
    }
  }

  cancel(): void {
    this.controller?.abort()
  }

  async install(component: VoiceComponent): Promise<VoicePackState> {
    if (this.current.state === 'installing')
      return { state: 'error', component, code: 'busy', message: 'busy' }
    const controller = new AbortController()
    this.controller = controller
    try {
      const side = this.deps.sidecar()
      if (!side.installed)
        throw new VoiceInstallError('sidecar_missing', 'Cần cài Python sidecar trước.')
      this.set({ state: 'installing', component })
      if (component === 'packages' || component === 'cuda') {
        await this.pip(side.paths, this.deps.requirements[component], controller.signal)
        await writeFile(
          join(side.paths.root, MARKER),
          JSON.stringify({ ...(await this.marker()), [component]: true })
        )
      } else {
        await this.download(component, MODELS[component], controller.signal)
      }
      this.deps.log.info(`Giọng nói: đã cài ${component}`)
      this.set({ state: 'idle' })
    } catch (err) {
      const e =
        err instanceof VoiceInstallError
          ? err
          : new VoiceInstallError(
              controller.signal.aborted
                ? 'cancelled'
                : isNetworkError(String(err))
                  ? 'network'
                  : 'failed',
              (err as Error).message
            )
      if (e.code === 'cancelled' || controller.signal.aborted) this.set({ state: 'idle' })
      else {
        this.deps.log.warn(`Giọng nói: cài ${component} lỗi (${e.code}): ${e.message}`)
        this.set({ state: 'error', component, code: e.code, message: e.message })
      }
    } finally {
      this.controller = null
    }
    return this.current
  }

  /** Gỡ một model (giải phóng ổ đĩa). Thư viện gỡ cùng sidecar. */
  async remove(component: Exclude<VoiceComponent, 'packages' | 'cuda'>): Promise<void> {
    await rm(this.modelDir(component), { recursive: true, force: true })
  }

  private async pip(paths: SidecarPaths, requirements: string, signal: AbortSignal): Promise<void> {
    const env = {
      UV_NO_CONFIG: '1',
      UV_PYTHON_INSTALL_DIR: paths.pythonDir,
      UV_CACHE_DIR: paths.cacheDir,
      UV_PYTHON_PREFERENCE: 'only-managed',
      UV_NO_PROGRESS: '1'
    }
    const r = await this.deps.run(
      paths.uvExe,
      ['pip', 'install', '--python', paths.venvPython, '--require-hashes', '-r', requirements],
      { env, signal, timeoutMs: 60 * 60 * 1000 }
    )
    await rm(paths.cacheDir, { recursive: true, force: true }).catch(() => {})
    if (signal.aborted) throw new VoiceInstallError('cancelled', 'cancelled')
    if (r.code !== 0) {
      const tail = r.stderr.trim().split('\n').slice(-3).join(' ').slice(0, 300)
      throw new VoiceInstallError(
        isNetworkError(r.stderr) ? 'network' : 'failed',
        tail || `uv lỗi ${r.code}`
      )
    }
  }

  private async download(
    component: Exclude<VoiceComponent, 'packages' | 'cuda'>,
    spec: ModelSpec,
    signal: AbortSignal
  ): Promise<void> {
    const dir = this.modelDir(component)
    await mkdir(dir, { recursive: true })
    const total = spec.files.reduce((s, f) => s + (f.size ?? 0), 0)
    let done = 0
    for (const file of spec.files) {
      const target = join(dir, basename(file.name))
      if (existsSync(target)) {
        done += file.size ?? 0
        continue
      }
      const part = `${target}.part`
      let res: Response
      try {
        res = await this.deps.fetch(fileUrl(spec, file.name), { signal })
      } catch (err) {
        throw new VoiceInstallError(
          signal.aborted ? 'cancelled' : 'network',
          (err as Error).message
        )
      }
      if (!res.ok || !res.body) throw new VoiceInstallError('network', `HTTP ${res.status}`)
      const hash = createHash('sha256')
      await mkdir(dirname(part), { recursive: true })
      const out = createWriteStream(part)
      let last = 0
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          hash.update(chunk)
          if (!out.write(chunk)) await new Promise<void>((r) => out.once('drain', () => r()))
          done += chunk.length
          if (Date.now() - last > 300) {
            last = Date.now()
            this.set({ state: 'installing', component, received: done, total })
          }
        }
      } finally {
        await new Promise((r) => out.end(r))
      }
      if (file.sha256 && hash.digest('hex') !== file.sha256) {
        await rm(part, { force: true })
        throw new VoiceInstallError('checksum', `${file.name}: sai mã kiểm tra`)
      }
      await rename(part, target)
    }
  }

  private set(state: VoicePackState): void {
    this.current = state
    this.deps.emit(state)
  }
}
