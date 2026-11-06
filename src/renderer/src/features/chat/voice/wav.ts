/** Hạ mẫu về 16 kHz (Whisper cần 16 kHz mono) bằng trung bình cộng — đủ cho giọng nói. */
export function downsample(input: Float32Array, fromRate: number, toRate = 16_000): Float32Array {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(input.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j++) sum += input[j]
    out[i] = end > start ? sum / (end - start) : 0
  }
  return out
}

/** PCM float → WAV 16-bit mono. */
export function encodeWav(samples: Float32Array, sampleRate = 16_000): Uint8Array {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o: number, s: string): void =>
    [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, sampleRate, true)
  v.setUint32(28, sampleRate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return new Uint8Array(buf)
}

export const rms = (frame: Float32Array): number => {
  let sum = 0
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
  return Math.sqrt(sum / (frame.length || 1))
}

/** Phát hiện giọng nói đơn giản theo năng lượng: có tiếng rồi im đủ lâu → dừng ghi. */
export class Vad {
  private speechMs = 0
  private silenceMs = 0
  constructor(
    private readonly threshold = 0.02,
    private readonly silenceToStopMs = 1_500,
    private readonly minSpeechMs = 200
  ) {}

  get heardSpeech(): boolean {
    return this.speechMs >= this.minSpeechMs
  }

  /** Trả về 'speech' khi vừa đủ tiếng nói, 'end' khi đã nói rồi im đủ lâu. */
  push(level: number, frameMs: number): 'speech' | 'end' | null {
    if (level >= this.threshold) {
      const before = this.heardSpeech
      this.speechMs += frameMs
      this.silenceMs = 0
      return !before && this.heardSpeech ? 'speech' : null
    }
    this.silenceMs += frameMs
    return this.heardSpeech && this.silenceMs >= this.silenceToStopMs ? 'end' : null
  }
}
