import { create } from 'zustand'
import { speechChunks } from '@shared/speakable'
import type { MessageVoice, VoiceStatus } from '@shared/voice'
import { api } from '@renderer/lib/api'
import { useChat } from '../store'
import { MicSession } from './recorder'

type Transcript = { text: string; voice: MessageVoice }

type VoiceState = {
  status: VoiceStatus | null
  mic: 'idle' | 'recording' | 'transcribing'
  level: number
  error: string | null
  speakingId: string | null
  /** Chữ vừa chép lời, chờ người dùng sửa trong ô nhập (chế độ "điền vào ô nhập"). */
  draft: Transcript | null
  refresh(): Promise<void>
  toggleMic(): Promise<void>
  takeDraft(): Transcript | null
  speak(messageId: string, text: string, opts?: { auto?: boolean }): Promise<void>
  stopSpeaking(): void
  clearError(): void
}

let session: MicSession | null = null
let listener: MicSession | null = null
let playback: { token: number; audio: HTMLAudioElement | null } = { token: 0, audio: null }

const stopListening = (): void => {
  void listener?.stop()
  listener = null
}

export const useVoice = create<VoiceState>((set, get) => {
  const finishRecording = async (): Promise<void> => {
    const s = session
    session = null
    if (!s) return
    set({ mic: 'transcribing', level: 0 })
    const rec = await s.stop()
    if (!rec || rec.durationMs < 300) return set({ mic: 'idle' })
    const r = await api.voice.transcribe(rec.wav, rec.durationMs)
    if ('error' in r) return set({ mic: 'idle', error: r.error })
    const text = r.text.trim()
    if (!text) return set({ mic: 'idle', error: 'nothing_heard' })
    const transcript: Transcript = {
      text,
      voice: { recordingId: r.recordingId, durationMs: r.durationMs }
    }
    set({ mic: 'idle' })
    if (get().status?.settings.afterSpeech === 'send') {
      const chat = useChat.getState()
      const mode = chat.conversations.find((c) => c.id === chat.activeId)?.mode ?? 'free'
      await chat.send(text, mode, [], undefined, transcript.voice)
    } else set({ draft: transcript })
  }

  return {
    status: null,
    mic: 'idle',
    level: 0,
    error: null,
    speakingId: null,
    draft: null,

    async refresh() {
      set({ status: await api.voice.status() })
    },

    async toggleMic() {
      if (get().mic === 'recording') return finishRecording()
      if (get().mic !== 'idle') return
      get().stopSpeaking() // bắt đầu nói → Mizuki dừng đọc
      const s = new MicSession('record', {
        autoStop: () => void finishRecording(),
        level: (v) => set({ level: v })
      })
      session = s
      set({ mic: 'recording', error: null })
      try {
        await s.start()
      } catch {
        session = null
        set({ mic: 'idle', error: 'mic_denied' })
      }
    },

    takeDraft() {
      const d = get().draft
      set({ draft: null })
      return d
    },

    /** Đọc dần từng câu: tổng hợp câu kế tiếp trong lúc câu hiện tại đang phát. */
    async speak(messageId, text, opts) {
      get().stopSpeaking()
      const chunks = speechChunks(text)
      if (chunks.length === 0) return
      const token = ++playback.token
      set({ speakingId: messageId })
      void api.voice.setSpeaking(true)
      const settings = get().status?.settings
      // Đọc tự động câu trả lời cho câu hỏi bằng giọng: bạn bắt đầu nói là Mizuki dừng và nghe bạn.
      if (opts?.auto && settings?.bargeIn) {
        listener = new MicSession('listen', {
          speech: () => {
            if (playback.token !== token) return
            get().stopSpeaking()
            void get().toggleMic()
          }
        })
        void listener.start().catch(() => (listener = null))
      }
      let next = api.voice.speak(chunks[0])
      for (let i = 0; i < chunks.length; i++) {
        const r = await next
        if (playback.token !== token) return
        if (i + 1 < chunks.length) next = api.voice.speak(chunks[i + 1])
        if ('error' in r) {
          set({ error: r.error })
          break
        }
        const audio = new Audio(r.audio)
        playback.audio = audio
        await new Promise<void>((resolve) => {
          audio.onended = () => resolve()
          audio.onerror = () => resolve()
          audio.onpause = () => resolve()
          void audio.play().catch(() => resolve())
        })
        if (playback.token !== token) return
      }
      if (playback.token === token) get().stopSpeaking()
    },

    stopSpeaking() {
      playback.token++
      playback.audio?.pause()
      playback = { token: playback.token, audio: null }
      stopListening()
      if (get().speakingId) {
        set({ speakingId: null })
        void api.voice.setSpeaking(false)
      }
    },

    clearError: () => set({ error: null })
  }
})

/** Nghe trạng thái + tự đọc câu trả lời cho câu hỏi bằng giọng; Esc / Ctrl+Alt+Q dừng đọc. */
export function setupVoice(): () => void {
  void useVoice.getState().refresh()
  const offPack = api.voice.onPack(() => void useVoice.getState().refresh())
  const offStop = api.voice.onStop(() => useVoice.getState().stopSpeaking())
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && useVoice.getState().speakingId) useVoice.getState().stopSpeaking()
  }
  window.addEventListener('keydown', onKey)
  const offChat = useChat.subscribe((s, prev) => {
    const settings = useVoice.getState().status?.settings
    if (!settings?.enabled || !settings.autoRead) return
    for (const id of Object.keys(prev.streaming)) {
      if (s.streaming[id]) continue
      const list = s.messages[id] ?? []
      const reply = list.at(-1)
      const asked = list.at(-2)
      if (
        reply?.role === 'assistant' &&
        reply.status === 'done' &&
        asked?.role === 'user' &&
        asked.voice
      )
        void useVoice.getState().speak(reply.id, reply.content, { auto: true })
    }
  })
  return () => {
    offPack()
    offStop()
    offChat()
    window.removeEventListener('keydown', onKey)
  }
}
