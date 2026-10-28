import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { HashRouter, Route, Routes, useNavigate } from 'react-router'
import type { FeatureDefinition } from '@renderer/features/types'
import { api } from '@renderer/lib/api'
import { useAuth } from '@renderer/stores/auth'
import { useCliStatus } from '@renderer/stores/cli'
import { usePreferences } from '@renderer/stores/preferences'
import { useTeam } from '@renderer/stores/team'
import { AppShell } from './AppShell'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } }
})

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

/** Bấm thông báo Windows → main gửi route → chuyển trang. */
function NavigateFromMain() {
  const navigate = useNavigate()
  useEffect(() => api.app.onNavigate((route) => void navigate(route)), [navigate])
  return null
}

/** Đăng nhập/đăng xuất → tải hoặc dọn dữ liệu team. */
function useAuthLifecycle(): void {
  useEffect(() => {
    const stopAuth = useAuth.getState().init()
    let lastUid: string | null = null
    const unsubscribe = useAuth.subscribe((s) => {
      const uid = s.session?.user.id ?? null
      if (uid === lastUid) return
      lastUid = uid
      queryClient.clear()
      if (uid) void useTeam.getState().load()
      else useTeam.getState().reset()
    })
    return () => {
      unsubscribe()
      stopAuth()
    }
  }, [])
}

export function App({ features }: { features: FeatureDefinition[] }) {
  const loaded = usePreferences((s) => s.loaded)
  const load = usePreferences((s) => s.load)
  useAuthLifecycle()

  useEffect(() => {
    void load()
    const cleanups = features.flatMap((f) => (f.setup ? [f.setup()] : []))
    return () => cleanups.forEach((fn) => fn())
  }, [features, load])

  if (!loaded) return null

  return (
    <QueryClientProvider client={queryClient}>
      <HashRouter>
        <CliGate />
        <NavigateFromMain />
        <Routes>
          <Route element={<AppShell features={features} />}>
            {features.map((f) => (
              <Route key={f.id} path={f.route} element={<f.component />} />
            ))}
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </HashRouter>
    </QueryClientProvider>
  )
}
