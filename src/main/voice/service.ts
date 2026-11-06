import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  SttModel,
  TranscribeResult,
  VoiceComponent,
  VoiceSettings,
  VoiceStatus
} from '@shared/voice'
import { SIZES_MB } from './catalog'
import type { VoiceInstaller } from './installer'

/** Câu mẫu lẫn Việt / Anh / Nhật + từ vựng hay dùng: giúp Whisper không ép mọi thứ thành tiếng Việt. */
export const BASE_VOCABULARY = [
  'Unity',
  'Blender',
  'After Effects',
  'DaVinci Resolve',
  'build',
  'bug',
  'script',
  'prefab',
  'shader',
  'Mizuki',
  'arigatou',
  'kawaii',
  'sugoi'
]
export function initialPrompt(name: string, custom: string[]): string {
  const words = [...new Set([...BASE_VOCABULARY, name, ...custom].filter(Boolean))].slice(0, 80)
  return `${name} ơi, mình vừa build lại project Unity mà shader bị bug, arigatou nha. Từ vựng: ${words.join(', ')}.`
}

export const RECORDING_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_RECORDING_BYTES = 25 * 1024 * 1024

export type SidecarCall = <T>(
  method: string,
  params?: Record<string, unknown>,
  timeoutMs?: number
) => Promise<T>

export type VoiceServiceDeps = {
  getSettings(): VoiceSettings
  setSettings(value: VoiceSettings): void
  installer: VoiceInstaller
  sidecarInstalled(): boolean
  call: SidecarCall
  stop(): void
  /** Thư mục ghi âm gốc (giữ 7 ngày). */
  recordingsDir: string
  /** GPU NVIDIA (nvidia-smi), null nếu không có. */
  detectGpu(): Promise<{ name: string; vramMb: number } | null>
  assistantName(): string
  log: { info(msg: string): void; warn(msg: string): void }
  now?: () => number
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export class VoiceService {
  private gpu: { name: string; vramMb: number } | null | undefined
  /** CUDA từng lỗi trong phiên này → dùng CPU tới khi khởi động lại. */
  private cudaBroken = false

  constructor(private readonly deps: VoiceServiceDeps) {}

  private async gpuInfo(): Promise<{ name: string; vramMb: number } | null> {
    if (this.gpu === undefined) this.gpu = await this.deps.detectGpu().catch(() => null)
    return this.gpu
  }

  /** Chọn model + thiết bị: auto = turbo trên GPU (đã cài CUDA), không thì small trên CPU. */
  plan(
    settings: VoiceSettings,
    installed: Record<VoiceComponent, boolean>,
    gpu: boolean
  ): { model: SttModel; device: 'cuda' | 'cpu' } {
    const cuda = gpu && installed.cuda && !this.cudaBroken
    const model: SttModel =
      settings.sttModel === 'auto' ? (cuda ? 'large-v3-turbo' : 'small') : settings.sttModel
    return { model, device: cuda ? 'cuda' : 'cpu' }
  }

  async status(): Promise<VoiceStatus> {
    const settings = this.deps.getSettings()
    const installed = await this.deps.installer.installed()
    const gpu = await this.gpuInfo()
    const { model, device } = this.plan(settings, installed, !!gpu)
    return {
      settings,
      sidecarInstalled: this.deps.sidecarInstalled(),
      pack: this.deps.installer.state,
      installed,
      sizesMb: SIZES_MB,
      gpu,
      effectiveModel: model,
      device
    }
  }

  async setSettings(value: VoiceSettings): Promise<VoiceStatus> {
    this.deps.setSettings(value)
    if (!value.enabled) this.deps.stop() // tắt → giải phóng RAM/VRAM
    return this.status()
  }

  /** Lưu ghi âm (WAV 16 kHz từ renderer) rồi chép lời. GPU lỗi → tự lùi về small trên CPU. */
  async transcribe(wav: Uint8Array, durationMs: number): Promise<TranscribeResult> {
    const settings = this.deps.getSettings()
    if (!settings.enabled) return { error: 'voice_disabled' }
    if (wav.byteLength > MAX_RECORDING_BYTES || wav.byteLength < 44) return { error: 'bad_audio' }
    const installed = await this.deps.installer.installed()
    if (!installed.packages) return { error: 'pack_missing' }
    await mkdir(this.deps.recordingsDir, { recursive: true })
    const recordingId = randomUUID()
    const path = join(this.deps.recordingsDir, `${recordingId}.wav`)
    await writeFile(path, wav)
    const prompt = initialPrompt(this.deps.assistantName(), settings.vocabulary)
    const attempt = async (model: SttModel, device: 'cuda' | 'cpu'): Promise<string> => {
      if (!installed[model]) throw new Error(`model_missing:${model}`)
      const r = await this.deps.call<{ text: string }>(
        'stt',
        {
          path,
          model_dir: this.deps.installer.modelDir(model),
          device,
          compute_type: device === 'cuda' ? 'float16' : 'int8',
          initial_prompt: prompt
        },
        5 * 60_000
      )
      return r.text
    }
    const { model, device } = this.plan(settings, installed, !!(await this.gpuInfo()))
    try {
      return { recordingId, text: await attempt(model, device), durationMs }
    } catch (err) {
      const message = (err as Error).message
      if (device === 'cuda' && !message.startsWith('model_missing')) {
        this.cudaBroken = true
        this.deps.log.warn(`Giọng nói: GPU lỗi, lùi về small trên CPU: ${message}`)
        try {
          return { recordingId, text: await attempt('small', 'cpu'), durationMs }
        } catch (err2) {
          return {
            error: (err2 as Error).message.startsWith('model_missing')
              ? 'cuda_failed_small_missing'
              : 'stt_failed'
          }
        }
      }
      this.deps.log.warn(`Giọng nói: chép lời lỗi: ${message}`)
      return { error: message.startsWith('model_missing') ? 'model_missing' : 'stt_failed' }
    }
  }

  /** Đọc một câu. Edge lỗi (mất mạng…) → Piper nếu đã tải giọng offline. */
  async speak(text: string): Promise<{ audio: string } | { error: string }> {
    const settings = this.deps.getSettings()
    if (!settings.enabled) return { error: 'voice_disabled' }
    const installed = await this.deps.installer.installed()
    if (!installed.packages) return { error: 'pack_missing' }
    const rate = `${settings.rate >= 0 ? '+' : ''}${settings.rate}%`
    const piper = async (): Promise<{ audio: string } | { error: string }> => {
      if (!installed.piper) return { error: 'piper_missing' }
      const r = await this.deps.call<{ audio: string; mime: string }>(
        'tts',
        { engine: 'piper', text, rate, piper_model: this.deps.installer.piperModelPath() },
        60_000
      )
      return { audio: `data:${r.mime};base64,${r.audio}` }
    }
    try {
      if (settings.engine === 'edge') {
        try {
          const r = await this.deps.call<{ audio: string; mime: string }>(
            'tts',
            { engine: 'edge', text, voice: settings.edgeVoice, rate },
            30_000
          )
          return { audio: `data:${r.mime};base64,${r.audio}` }
        } catch (err) {
          this.deps.log.warn(`Giọng nói: Edge lỗi, thử Piper: ${(err as Error).message}`)
          const r = await piper()
          return 'error' in r ? { error: 'edge_failed' } : r
        }
      }
      return await piper()
    } catch (err) {
      this.deps.log.warn(`Giọng nói: đọc lỗi: ${(err as Error).message}`)
      return { error: 'tts_failed' }
    }
  }

  /** Ghi âm gốc để nghe lại — chỉ id hợp lệ trong thư mục ghi âm. */
  async recording(id: string): Promise<string | null> {
    if (!UUID.test(id)) return null
    const path = join(this.deps.recordingsDir, `${id}.wav`)
    if (!existsSync(path)) return null
    return `data:audio/wav;base64,${(await readFile(path)).toString('base64')}`
  }

  hasRecording(id: string): boolean {
    return UUID.test(id) && existsSync(join(this.deps.recordingsDir, `${id}.wav`))
  }

  /** Xoá ghi âm cũ hơn 7 ngày. */
  async prune(): Promise<number> {
    const now = this.deps.now?.() ?? Date.now()
    let removed = 0
    const files = await readdir(this.deps.recordingsDir).catch(() => [] as string[])
    for (const f of files) {
      const p = join(this.deps.recordingsDir, f)
      const s = await stat(p).catch(() => null)
      if (s && now - s.mtimeMs > RECORDING_TTL_MS) {
        await rm(p, { force: true })
        removed++
      }
    }
    return removed
  }
}

/** Ghép hướng dẫn tin nhắn giọng nói từ skill `voice`: luôn có phần "always", thêm "tease" hoặc "no-tease". */
export function voiceSkillPrompt(skill: string, tease: boolean): string {
  const sections = new Map<string, string>()
  for (const part of skill.split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n')
    sections.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim())
  }
  const body = [sections.get('always'), sections.get(tease ? 'tease' : 'no-tease')]
    .filter(Boolean)
    .join('\n\n')
  return body ? `## Tin nhắn giọng nói\n${body}` : ''
}
