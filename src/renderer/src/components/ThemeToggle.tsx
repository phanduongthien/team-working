import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePreferences } from '@renderer/stores/preferences'

/** Nút chuyển nhanh sáng/tối trên thanh bên (lưu vào Cài đặt → Giao diện). */
export function ThemeToggle() {
  const { t } = useTranslation('settings')
  const appearance = usePreferences((s) => s.appearance)
  const saveAppearance = usePreferences((s) => s.saveAppearance)
  // Đọc trạng thái thực tế (kể cả khi đang "Theo hệ thống").
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const next = isDark ? 'light' : 'dark'
  const label = t('appearance.toggle', { mode: t(`appearance.themes.${next}`).toLowerCase() })
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      data-testid="theme-toggle"
      className="flex size-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      onClick={() => void saveAppearance({ ...appearance, theme: next })}
    >
      {isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  )
}
