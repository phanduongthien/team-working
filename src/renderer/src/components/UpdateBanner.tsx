import { Download } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { api } from '@renderer/lib/api'

/** "Có bản mới — khởi động lại để cập nhật" (bản cập nhật đã tải nền xong). */
export function UpdateBanner() {
  const { t } = useTranslation()
  const [version, setVersion] = useState<string | null>(null)
  useEffect(() => api.app.onUpdateReady((info) => setVersion(info.version)), [])
  if (!version) return null
  return (
    <div className="fixed right-4 bottom-4 z-50 flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg" role="status">
      <Download className="size-4 text-primary" />
      {t('update.ready', { version })}
      <Button size="sm" onClick={() => void api.app.installUpdate()}>
        {t('update.restart')}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setVersion(null)}>
        {t('update.later')}
      </Button>
    </div>
  )
}
