import { z } from 'zod'
import { IPC } from '@shared/ipc'
import { STT_MODELS, voiceSettingsSchema } from '@shared/voice'
import type { VoiceInstaller } from '../voice/installer'
import type { VoiceService } from '../voice/service'
import type { HandleFn } from './register'

export type VoiceIpcDeps = {
  handle: HandleFn
  voice: VoiceService
  installer: Pick<VoiceInstaller, 'install' | 'cancel' | 'remove'>
  /** Đang đọc → giữ / thả phím dừng khẩn cấp. */
  setSpeaking(on: boolean): void
}

const none = z.undefined()
const componentSchema = z.enum(['packages', 'cuda', 'piper', ...STT_MODELS])
const modelSchema = z.enum(['piper', ...STT_MODELS])

export function registerVoiceIpc({ handle, voice, installer, setSpeaking }: VoiceIpcDeps): void {
  handle(IPC.voiceStatus, none, () => voice.status())
  handle(IPC.voiceSetSettings, voiceSettingsSchema, (value) => voice.setSettings(value))
  handle(IPC.voiceInstall, componentSchema, async (component) => {
    await installer.install(component)
    return voice.status()
  })
  handle(IPC.voiceCancel, none, () => installer.cancel())
  handle(IPC.voiceRemoveModel, modelSchema, async (component) => {
    await installer.remove(component)
    return voice.status()
  })
  handle(
    IPC.voiceTranscribe,
    z.object({ wav: z.instanceof(Uint8Array), durationMs: z.number().int().min(0).max(600_000) }),
    ({ wav, durationMs }) => voice.transcribe(wav, durationMs)
  )
  handle(IPC.voiceSpeak, z.string().min(1).max(2_000), (text) => voice.speak(text))
  handle(IPC.voiceSpeaking, z.boolean(), (on) => setSpeaking(on))
  handle(IPC.voiceRecording, z.string().max(64), (id) => voice.recording(id))
}
