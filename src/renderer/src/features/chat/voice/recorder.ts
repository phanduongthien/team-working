import { Vad, downsample, encodeWav, rms } from './wav'

const MAX_MS = 60_000

/**
 * Thu âm từ micro (chỉ âm thanh, có khử vọng để nghe được cả khi loa đang đọc).
 * mode 'record': ghi lại, tự dừng khi nói xong rồi im 1,5 giây (hoặc tối đa 60 giây).
 * mode 'listen': chỉ chờ bạn bắt đầu nói (để ngắt lời Mizuki), không ghi.
 */
export class MicSession {
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private chunks: Float32Array[] = []
  private startedAt = 0
  private stopped = false

  constructor(
    private readonly mode: 'record' | 'listen',
    private readonly on: { speech?(): void; autoStop?(): void; level?(v: number): void }
  ) {}

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      },
      video: false
    })
    if (this.stopped) return this.release()
    this.ctx = new AudioContext()
    const source = this.ctx.createMediaStreamSource(this.stream)
    const node = this.ctx.createScriptProcessor(4096, 1, 1)
    const frameMs = (4096 / this.ctx.sampleRate) * 1000
    // Ngắt lời cần chắc chắn hơn (loa có thể lọt vào micro) → ngưỡng cao hơn.
    const vad = this.mode === 'listen' ? new Vad(0.06, 1_500, 300) : new Vad()
    this.startedAt = performance.now()
    node.onaudioprocess = (e) => {
      if (this.stopped) return
      const frame = new Float32Array(e.inputBuffer.getChannelData(0))
      const level = rms(frame)
      this.on.level?.(level)
      if (this.mode === 'record') this.chunks.push(frame)
      const r = vad.push(level, frameMs)
      if (r === 'speech') this.on.speech?.()
      if ((this.mode === 'record' && r === 'end') || performance.now() - this.startedAt > MAX_MS)
        this.on.autoStop?.()
    }
    source.connect(node)
    node.connect(this.ctx.destination)
  }

  /** Dừng; mode 'record' trả về WAV 16 kHz. */
  async stop(): Promise<{ wav: Uint8Array; durationMs: number } | null> {
    if (this.stopped) return null
    this.stopped = true
    const rate = this.ctx?.sampleRate ?? 48_000
    this.release()
    if (this.mode !== 'record' || this.chunks.length === 0) return null
    const total = this.chunks.reduce((n, c) => n + c.length, 0)
    const all = new Float32Array(total)
    let o = 0
    for (const c of this.chunks) {
      all.set(c, o)
      o += c.length
    }
    return { wav: encodeWav(downsample(all, rate)), durationMs: Math.round((total / rate) * 1000) }
  }

  private release(): void {
    this.stream?.getTracks().forEach((t) => t.stop())
    void this.ctx?.close().catch(() => {})
    this.ctx = null
    this.stream = null
  }
}
