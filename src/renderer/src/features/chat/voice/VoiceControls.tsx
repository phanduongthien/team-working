import { Loader2, Mic, Pause, Play, Square, Volume2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Message } from '@shared/types'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { cn } from '@renderer/lib/utils'
import { useVoice } from './store'

/** Nút micro trong khung soạn tin — chỉ hiện khi đã bật giọng nói. */
export function MicButton({ disabled }: { disabled: boolean }) {
  const { t } = useTranslation('chat')
  const status = useVoice((s) => s.status)
  const mic = useVoice((s) => s.mic)
  const level = useVoice((s) => s.level)
  const toggle = useVoice((s) => s.toggleMic)
  if (!status?.settings.enabled) return null
  const label =
    mic === 'recording'
      ? t('voice.stopRecording')
      : mic === 'transcribing'
        ? t('voice.transcribing')
        : t('voice.record')
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      aria-pressed={mic === 'recording'}
      disabled={disabled || mic === 'transcribing'}
      className={cn(mic === 'recording' && 'bg-red-500/15 text-red-600')}
      style={
        mic === 'recording'
          ? { boxShadow: `0 0 0 ${Math.min(6, Math.round(level * 60))}px rgb(239 68 68 / 0.25)` }
          : undefined
      }
      onClick={() => void toggle()}
      data-testid="mic-button"
    >
      {mic === 'transcribing' ? (
        <Loader2 className="animate-spin" />
      ) : mic === 'recording' ? (
        <Square />
      ) : (
        <Mic />
      )}
    </Button>
  )
}

/** Lỗi giọng nói (micro bị chặn, chưa tải model…) hiện dưới khung soạn tin. */
export function VoiceError() {
  const { t } = useTranslation('chat')
  const error = useVoice((s) => s.error)
  const clear = useVoice((s) => s.clearError)
  if (!error) return null
  return (
    <p className="px-2 pt-1 text-xs text-destructive" role="alert" data-testid="voice-error">
      {t(`voice.errors.${error}`, { defaultValue: t('voice.errors.generic', { code: error }) })}{' '}
      <button type="button" className="underline" onClick={clear}>
        {t('voice.dismiss')}
      </button>
    </p>
  )
}

/** Tin bạn nói: nhãn "🎤 nói" + nghe lại ghi âm gốc (nếu chưa quá 7 ngày). */
export function VoiceBadge({ message }: { message: Message }) {
  const { t } = useTranslation('chat')
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  if (!message.voice) return null
  const play = async (): Promise<void> => {
    if (audio) {
      audio.pause()
      return setAudio(null)
    }
    const url = await api.voice.recording(message.voice!.recordingId)
    if (!url) return
    const a = new Audio(url)
    a.onended = () => setAudio(null)
    setAudio(a)
    void a.play()
  }
  return (
    <span
      className="flex items-center gap-1 text-[11px] text-muted-foreground"
      data-testid="voice-badge"
    >
      {t('voice.badge')}
      <button
        type="button"
        aria-label={audio ? t('voice.stopOriginal') : t('voice.playOriginal')}
        title={t('voice.playOriginalHint')}
        className="rounded p-0.5 hover:bg-muted"
        onClick={() => void play()}
      >
        {audio ? <Pause className="size-3" /> : <Play className="size-3" />}
      </button>
    </span>
  )
}

/** Nút loa cho câu trả lời của Mizuki. */
export function SpeakButton({ message }: { message: Message }) {
  const { t } = useTranslation('chat')
  const enabled = useVoice((s) => !!s.status?.settings.enabled)
  const speaking = useVoice((s) => s.speakingId === message.id)
  const speak = useVoice((s) => s.speak)
  const stop = useVoice((s) => s.stopSpeaking)
  if (!enabled || message.status !== 'done' || !message.content.trim()) return null
  return (
    <button
      type="button"
      aria-label={speaking ? t('voice.stopSpeaking') : t('voice.speak')}
      title={speaking ? t('voice.stopSpeakingHint') : t('voice.speak')}
      aria-pressed={speaking}
      className={cn(
        'rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground',
        speaking && 'text-primary'
      )}
      onClick={() => (speaking ? stop() : void speak(message.id, message.content))}
      data-testid="speak-button"
    >
      {speaking ? <Square className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  )
}
