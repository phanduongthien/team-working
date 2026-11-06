import { describe, expect, it } from 'vitest'
import { Vad, downsample, encodeWav } from '../voice/wav'

describe('ghi âm → WAV 16 kHz', () => {
  it('header WAV đúng chuẩn PCM 16-bit mono', () => {
    const wav = encodeWav(new Float32Array([0, 1, -1]), 16_000)
    const v = new DataView(wav.buffer)
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe('RIFF')
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe('WAVE')
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(16_000)
    expect(v.getUint32(40, true)).toBe(6)
    expect(v.getInt16(46, true)).toBe(0x7fff)
    expect(v.getInt16(48, true)).toBe(-0x8000)
  })

  it('hạ mẫu 48 kHz → 16 kHz', () => {
    expect(downsample(new Float32Array(48_000).fill(0.5), 48_000)).toHaveLength(16_000)
  })

  it('VAD: nói rồi im 1,5 giây mới dừng; tiếng ồn nhỏ không tính', () => {
    const vad = new Vad(0.02, 1_500, 200)
    expect(vad.push(0.01, 100)).toBeNull()
    expect(vad.push(0.1, 100)).toBeNull()
    expect(vad.push(0.1, 100)).toBe('speech')
    for (let i = 0; i < 14; i++) expect(vad.push(0.005, 100)).toBeNull()
    expect(vad.push(0.005, 100)).toBe('end')
  })
})
