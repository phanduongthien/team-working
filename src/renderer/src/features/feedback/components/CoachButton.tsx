import { LoaderCircle, WandSparkles } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FeedbackCoachRequest } from '@shared/schemas'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'
import { usePreferences } from '@renderer/stores/preferences'

type Props = {
  request: Omit<FeedbackCoachRequest, 'language'>
  onResult(text: string): void
}

/** Nhờ skill feedback-coach viết lại bản nháp; kết quả thay vào ô soạn để người dùng sửa — không tự gửi. */
export function CoachButton({ request, onResult }: Props) {
  const { t } = useTranslation('feedback')
  const language = usePreferences((s) => s.assistant.language)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const res = await api.feedback.coach({ ...request, language })
      if ('error' in res) setError(res.error)
      else onResult(res.text)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={busy || !request.draft.trim()} onClick={() => void run()}>
        {busy ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}
        {busy ? t('form.coaching') : t('form.coach')}
      </Button>
      {error ? (
        <span className="text-xs text-destructive">{t(`work:errors.${error}`, { defaultValue: error })}</span>
      ) : (
        <span className="text-xs text-muted-foreground">{t('form.coachNote')}</span>
      )}
    </div>
  )
}
