import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { features } from './features/registry'
import { initI18n } from './i18n'
import './styles.css'

initI18n(features)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App features={features} />
  </StrictMode>
)
