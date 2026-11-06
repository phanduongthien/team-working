import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { speakableText, speechChunks } from '@shared/speakable'
import { DEFAULT_VOICE_SETTINGS, type VoiceComponent, type VoiceSettings } from '@shared/voice'
import { limitEmoji } from '../../expressive/tags'
import type { VoiceInstaller } from '../installer'
import { RECORDING_TTL_MS, VoiceService, initialPrompt, voiceSkillPrompt } from '../service'

describe('đọc to: chỉ đọc lời nói chuyện', () => {
  it('bỏ code, đường dẫn, URL, log, emoji, kaomoji, thẻ GIF', () => {
    const md = [
      'Xong rồi nè 🎉✨ =)) [[gif:party]]',
      '```ts\nconst x = 1\n```',
      'Mở file `src/main/index.ts` hoặc C:\\Users\\An\\Project\\Assets\\a.cs nhé.',
      'Xem https://docs.unity3d.com/Manual/x.html',
      '    at Object.<anonymous> (C:\\a\\b.js:10:5)',
      '**Lưu ý:** build lại ^^'
    ].join('\n')
    const s = speakableText(md)
    expect(s).toContain('Xong rồi nè')
    expect(s).toContain('Lưu ý: build lại')
    for (const bad of [
      '🎉',
      '=))',
      '[[',
      'const x',
      'index.ts',
      'Assets',
      'https',
      'Object.<anonymous>',
      '**',
      '^^'
    ])
      expect(s).not.toContain(bad)
  })

  it('chia câu để đọc dần; câu ngắn gộp lại; chỉ có code thì không đọc gì', () => {
    const chunks = speechChunks(
      'Ừ. Mình hiểu rồi. Đầu tiên bạn mở Unity lên và vào Project Settings! Sau đó chọn Player rồi đổi Scripting Backend sang IL2CPP.'
    )
    expect(chunks[0].startsWith('Ừ. Mình hiểu rồi.')).toBe(true) // câu quá ngắn được gộp
    expect(chunks).toHaveLength(2)
    expect(speechChunks('```\nonly code\n```')).toEqual([])
  })
})

describe('GĐ 3: hỏi lỗi kỹ thuật → tối đa 2 emoji', () => {
  it('cắt emoji thứ 3 trở đi, giữ nguyên khối code', () => {
    expect(limitEmoji('Chào 👋 lỗi này 😅 do shader 🔥🔥 nè 💡.', 2)).toBe(
      'Chào 👋 lỗi này 😅 do shader nè.'
    )
    expect(limitEmoji('A 😀 B 😀\n```\n// 🚀🚀🚀\n```\nC 😀', 2)).toBe(
      'A 😀 B 😀\n```\n// 🚀🚀🚀\n```\nC'
    )
    expect(limitEmoji('👍🏽👨‍👩‍👧', 1)).toBe('👍🏽')
  })
})

describe('chép lời: lời nhắc + tin nhắn giọng nói', () => {
  it('initial_prompt lẫn ngôn ngữ, có từ vựng mặc định + riêng của người dùng', () => {
    const p = initialPrompt('Mizuki', ['Houdini', 'Unity'])
    for (const w of [
      'Unity',
      'Blender',
      'DaVinci Resolve',
      'prefab',
      'arigatou',
      'kawaii',
      'Houdini',
      'Mizuki'
    ])
      expect(p).toContain(w)
    expect(p.match(/Unity/g)!.length).toBe(2) // câu mẫu + 1 lần trong từ vựng (không lặp)
  })

  it('skill voice: luôn có phần an toàn; trêu chỉ khi được phép', () => {
    const skill = '## always\nAN_TOAN\n## tease\nTREU\n## no-tease\nKHONG_TREU'
    expect(voiceSkillPrompt(skill, true)).toBe('## Tin nhắn giọng nói\nAN_TOAN\n\nTREU')
    expect(voiceSkillPrompt(skill, false)).toContain('KHONG_TREU')
    expect(voiceSkillPrompt(skill, false)).not.toContain('TREU\n')
  })
})

describe('VoiceService', () => {
  let dir: string
  let settings: VoiceSettings
  let installed: Record<VoiceComponent, boolean>
  const calls: { method: string; params: Record<string, unknown> }[] = []
  let fail: (method: string, params: Record<string, unknown>) => boolean

  const make = (gpu: { name: string; vramMb: number } | null = null): VoiceService =>
    new VoiceService({
      getSettings: () => settings,
      setSettings: (v) => (settings = v),
      installer: {
        installed: async () => installed,
        state: { state: 'idle' },
        modelDir: (c: string) => `M/${c}`,
        piperModelPath: () => 'M/piper/v.onnx'
      } as unknown as VoiceInstaller,
      sidecarInstalled: () => true,
      call: (async (method: string, params: Record<string, unknown> = {}) => {
        calls.push({ method, params })
        if (fail(method, params)) throw new Error('boom')
        return method === 'stt' ? { text: 'bin bị e rơ' } : { audio: 'QUJD', mime: 'audio/mpeg' }
      }) as never,
      stop: vi.fn(),
      recordingsDir: dir,
      detectGpu: async () => gpu,
      assistantName: () => 'Mizuki',
      log: { info: vi.fn(), warn: vi.fn() }
    })

  const wav = new Uint8Array(100)

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'voice-'))
    settings = { ...DEFAULT_VOICE_SETTINGS, enabled: true }
    installed = {
      packages: true,
      cuda: false,
      piper: true,
      base: false,
      small: true,
      medium: false,
      'large-v3-turbo': false
    }
    calls.length = 0
    fail = () => false
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('mặc định tắt: không chép lời / không đọc', async () => {
    settings = DEFAULT_VOICE_SETTINGS
    expect(await make().transcribe(wav, 1000)).toEqual({ error: 'voice_disabled' })
    expect(await make().speak('chào')).toEqual({ error: 'voice_disabled' })
  })

  it('auto: có GPU + CUDA → large-v3-turbo trên GPU; không GPU → small trên CPU', async () => {
    const noGpu = await make().status()
    expect([noGpu.effectiveModel, noGpu.device]).toEqual(['small', 'cpu'])
    installed = { ...installed, cuda: true, 'large-v3-turbo': true }
    const gpu = await make({ name: 'RTX 4060', vramMb: 8188 }).status()
    expect([gpu.effectiveModel, gpu.device]).toEqual(['large-v3-turbo', 'cuda'])
    installed.cuda = false
    expect((await make({ name: 'RTX', vramMb: 8 }).status()).device).toBe('cpu') // chưa tải CUDA
  })

  it('chép lời: lưu ghi âm gốc, KHÔNG khoá ngôn ngữ, có initial_prompt', async () => {
    const r = await make().transcribe(wav, 1500)
    expect(r).toMatchObject({ text: 'bin bị e rơ', durationMs: 1500 })
    expect(readdirSync(dir)).toHaveLength(1)
    const p = calls[0].params
    expect(p.language).toBeUndefined()
    expect(p).toMatchObject({ model_dir: 'M/small', device: 'cpu', compute_type: 'int8' })
    expect(String(p.initial_prompt)).toContain('arigatou')
  })

  it('GPU lỗi → tự lùi về small trên CPU (và nhớ trong phiên)', async () => {
    installed = { ...installed, cuda: true, 'large-v3-turbo': true }
    fail = (m, p) => m === 'stt' && p.device === 'cuda'
    const voice = make({ name: 'RTX', vramMb: 8000 })
    expect(await voice.transcribe(wav, 900)).toMatchObject({ text: 'bin bị e rơ' })
    expect(calls.map((c) => c.params.device)).toEqual(['cuda', 'cpu'])
    expect((await voice.status()).device).toBe('cpu')
  })

  it('đọc: Edge lỗi → Piper; chưa có Piper → báo lỗi rõ', async () => {
    fail = (m, p) => m === 'tts' && p.engine === 'edge'
    expect(await make().speak('chào')).toEqual({ audio: 'data:audio/mpeg;base64,QUJD' })
    expect(calls.map((c) => c.params.engine)).toEqual(['edge', 'piper'])
    installed.piper = false
    expect(await make().speak('chào')).toEqual({ error: 'edge_failed' })
  })

  it('ghi âm: chỉ đọc id hợp lệ; xoá file cũ hơn 7 ngày', async () => {
    const voice = make()
    const r = await voice.transcribe(wav, 500)
    if ('error' in r) throw new Error(r.error)
    expect(await voice.recording(r.recordingId)).toMatch(/^data:audio\/wav;base64,/)
    expect(await voice.recording('../secret')).toBeNull()
    writeFileSync(join(dir, 'old.wav'), 'x')
    const old = (Date.now() - RECORDING_TTL_MS - 60_000) / 1000
    utimesSync(join(dir, 'old.wav'), old, old)
    expect(await voice.prune()).toBe(1)
    expect(voice.hasRecording(r.recordingId)).toBe(true)
  })
})
