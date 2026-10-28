import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { HashRouter, Route, Routes, useNavigate } from 'react-router'
import type { FeatureDefinition } from '@renderer/features/types'
import { useCliStatus } from '@renderer/stores/cli'
import { usePreferences } from '@renderer/stores/preferences'
import { AppShell } from './AppShell'

function NotFound() {
  const { t } = useTranslation()
  return <p className="p-8 text-muted-foreground">{t('errors.notFound')}</p>
}

/** Lần đầu mở app: kiểm tra Claude CLI, chưa sẵn sàng thì đưa tới màn hình hướng dẫn. */
function CliGate() {
  const navigate = useNavigate()
  const check = useCliStatus((s) => s.check)
  useEffect(() => {
    void check().then((status) => {
      if (status.state !== 'ok') void navigate('/claude')
    })
  }, [check, navigate])
  return null
}

export function App({ features }: { features: FeatureDefinition[] }) {
  const loaded = usePreferences((s) => s.loaded)
  const load = usePreferences((s) => s.load)

  useEffect(() => {
    void load()
    const cleanups = features.flatMap((f) => (f.setup ? [f.setup()] : []))
    return () => cleanups.forEach((fn) => fn())
  }, [features, load])

  if (!loaded) return null

  return (
    <HashRouter>
      <CliGate />
      <Routes>
        <Route element={<AppShell features={features} />}>
          {features.map((f) => (
            <Route key={f.id} path={f.route} element={<f.component />} />
          ))}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
