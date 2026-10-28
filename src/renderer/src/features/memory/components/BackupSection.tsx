import { CloudDownload, CloudUpload } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@renderer/components/ui/button'
import { useAuth } from '@renderer/stores/auth'
import { isBackupEnabled, pushBackup, restoreBackup, setBackupEnabled } from '../backup'
import { useMemory } from '../store'

/** Sao lưu trí nhớ lên Supabase (tùy chọn, mặc định tắt; chỉ chính chủ đọc được). */
export function BackupSection() {
  const { t } = useTranslation('memory')
  const status = useAuth((s) => s.status)
  const loadMemories = useMemory((s) => s.loadMemories)
  const [enabled, setEnabled] = useState(isBackupEnabled)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (status === 'disabled') return null
  if (status !== 'signed_in') return <p className="text-sm text-muted-foreground">{t('backup.signInFirst')}</p>

  const run = async (fn: () => Promise<string>): Promise<void> => {
    setBusy(true)
    try {
      setMessage(await fn())
    } catch (err) {
      setMessage(t('backup.failed', { message: (err as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked)
            setBackupEnabled(e.target.checked)
            if (e.target.checked) void run(async () => t('backup.pushed', { count: await pushBackup() }))
          }}
        />
        <span>
          <span className="block text-sm font-medium">{t('backup.toggle')}</span>
          <span className="block text-xs text-muted-foreground">{t('backup.help')}</span>
        </span>
      </label>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={busy || !enabled} onClick={() => void run(async () => t('backup.pushed', { count: await pushBackup() }))}>
          <CloudUpload />
          {t('backup.pushNow')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const count = await restoreBackup()
              await loadMemories()
              return t('backup.restored', { count })
            })
          }
        >
          <CloudDownload />
          {t('backup.restore')}
        </Button>
      </div>
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  )
}
