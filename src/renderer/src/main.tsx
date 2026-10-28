import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { features } from './features/registry'
import { initI18n } from './i18n'
import './styles.css'

initI18n(features)

// Lỗi giao diện chưa bắt → ghi vào file log (%APPDATA%/Team Working/logs) để báo lỗi.
window.addEventListener('error', (e) => void window.api.app.logError(`${e.message} @ ${e.filename}:${e.lineno}`.slice(0, 4000)))
window.addEventListener('unhandledrejection', (e) => void window.api.app.logError(`unhandledrejection: ${String(e.reason)}`.slice(0, 4000)))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App features={features} />
  </StrictMode>
)
