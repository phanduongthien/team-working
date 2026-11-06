import { z } from 'zod'

export const STT_MODELS = ['base', 'small', 'medium', 'large-v3-turbo'] as const
export type SttModel = (typeof STT_MODELS)[number]
export const EDGE_VOICES = ['vi-VN-HoaiMyNeural', 'vi-VN-NamMinhNeural'] as const

export const voiceSettingsSchema = z.object({
  enabled: z.boolean(),
  /** auto = large-v3-turbo nếu có GPU NVIDIA dùng được, không thì small (CPU). */
  sttModel: z.enum(['auto', ...STT_MODELS]),
  /** Nói xong: điền vào ô nhập để sửa, hay gửi luôn. */
  afterSpeech: z.enum(['fill', 'send']),
  /** Từ vựng riêng giúp nhận đúng (tên riêng, thuật ngữ). */
  vocabulary: z.array(z.string().trim().min(1).max(40)).max(200),
  engine: z.enum(['edge', 'piper']),
  edgeVoice: z.enum(EDGE_VOICES),
  /** Tốc độ đọc, phần trăm so với bình thường. */
  rate: z.number().int().min(-50).max(100),
  /** Tự đọc câu trả lời khi bạn hỏi bằng giọng nói. */
  autoRead: z.boolean(),
  /** Đang đọc mà bạn bắt đầu nói → dừng đọc và nghe bạn. */
  bargeIn: z.boolean()
})
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>
export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: false,
  sttModel: 'auto',
  afterSpeech: 'fill',
  vocabulary: [],
  engine: 'edge',
  edgeVoice: 'vi-VN-HoaiMyNeural',
  rate: 0,
  autoRead: true,
  bargeIn: true
}

/** Phần tải về: gói thư viện, thư viện CUDA (chỉ GPU NVIDIA), từng model. */
export type VoiceComponent = 'packages' | 'cuda' | 'piper' | SttModel

export type VoicePackState =
  | { state: 'idle' }
  | { state: 'installing'; component: VoiceComponent; received?: number; total?: number }
  | {
      state: 'error'
      component: VoiceComponent
      code: 'network' | 'checksum' | 'failed' | 'busy' | 'sidecar_missing'
      message: string
    }

export type VoiceStatus = {
  settings: VoiceSettings
  sidecarInstalled: boolean
  pack: VoicePackState
  installed: Record<VoiceComponent, boolean>
  /** Dung lượng tải (MB) từng phần — báo trước khi tải. */
  sizesMb: Record<VoiceComponent, number>
  gpu: { name: string; vramMb: number } | null
  /** Model sẽ dùng thật (sau khi xét auto / GPU / thứ đã cài). */
  effectiveModel: SttModel
  device: 'cuda' | 'cpu'
}

export type TranscribeResult =
  { recordingId: string; text: string; durationMs: number } | { error: string }
export type SpeakChunk = { audio: string } | { error: string }

/** Tin nhắn gửi bằng giọng nói: id file ghi âm gốc (giữ 7 ngày, chỉ trên máy). */
export type MessageVoice = { recordingId: string; durationMs: number }
export const messageVoiceSchema = z.object({
  recordingId: z.uuid(),
  durationMs: z.number().int().min(0).max(600_000)
})
