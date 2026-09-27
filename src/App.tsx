import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type React from 'react'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AdminLayout } from '@/components/layout/AdminLayout'
import { MonitorLayout } from '@/components/layout/MonitorLayout'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

// Route-level code splitting: each page is a separate chunk, loaded on
// demand via React.lazy + Suspense. This fixes the 1.25 MB single-chunk
// build warning and dramatically reduces initial load.
const ConnectionPage = lazy(() =>
  import('@/features/login/ConnectionPage').then((m) => ({ default: m.ConnectionPage })),
)
const DashboardPage = lazy(() =>
  import('@/features/monitor/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const TagExplorerPage = lazy(() =>
  import('@/features/monitor/TagExplorerPage').then((m) => ({ default: m.TagExplorerPage })),
)
const AlertsPage = lazy(() =>
  import('@/features/monitor/AlertsPage').then((m) => ({ default: m.AlertsPage })),
)
const DriversPage = lazy(() =>
  import('@/features/admin/DriversPage').then((m) => ({ default: m.DriversPage })),
)
const DriverDetailPage = lazy(() =>
  import('@/features/admin/DriverDetailPage').then((m) => ({ default: m.DriverDetailPage })),
)
const TransportsPage = lazy(() =>
  import('@/features/admin/TransportsPage').then((m) => ({ default: m.TransportsPage })),
)
const TransportDetailPage = lazy(() =>
  import('@/features/admin/TransportDetailPage').then((m) => ({ default: m.TransportDetailPage })),
)
const RulesPage = lazy(() =>
  import('@/features/admin/RulesPage').then((m) => ({ default: m.RulesPage })),
)
const WriteControlPage = lazy(() =>
  import('@/features/admin/WriteControlPage').then((m) => ({ default: m.WriteControlPage })),
)
const DashboardEditorPage = lazy(() =>
  import('@/features/admin/DashboardEditorPage').then((m) => ({ default: m.DashboardEditorPage })),
)
const ConfigCenterPage = lazy(() =>
  import('@/features/admin/ConfigCenterPage').then((m) => ({ default: m.ConfigCenterPage })),
)
const TopologyPage = lazy(() =>
  import('@/features/admin/TopologyPage').then((m) => ({ default: m.TopologyPage })),
)
const DiagnosticsPage = lazy(() =>
  import('@/features/admin/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage })),
)
const SettingsPage = lazy(() =>
  import('@/features/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })),
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Minimal Suspense fallback while a lazy chunk loads. Uses the i18n instance
// directly (not the hook) because this renders outside React render cycle
// during Suspense transitions.
const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[50vh]">
    <div className="animate-pulse text-sm text-muted-foreground">
      {i18n.t('common.loading', { defaultValue: 'Loading…' })}
    </div>
  </div>
)

// Protected route wrapper.
//
// Gate logic (also triggered when a 401 clears the secret at runtime):
//   - No baseUrl/secret          → redirect to /login
//   - isConnecting (revalidating) → show loading probe (don't redirect yet)
//   - !isConnected && !isConnecting → redirect to /login (revalidation failed
//     or token was just cleared by a 401 — leaves no frozen/stale view)
//   - isConnected                 → render children
const RequireConnection: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { baseUrl, secret, isConnected, isConnecting } = useConnectionStore()
  if (!baseUrl || !secret) {
    return <Navigate to="/login" replace />
  }
  // While the startup revalidate probe is in flight, show a loading state so
  // a page reload with valid persisted creds doesn't bounce through /login.
  if (isConnecting && !isConnected) {
    return <LoadingFallback />
  }
  // Credentials present but not connected (e.g. 401 cleared auth, or
  // revalidation failed) → send to login instead of a frozen stale page.
  if (!isConnected) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

// Per-route error boundary. Keyed on pathname so navigating to a different
// route resets the boundary state — a broken lazy page won't brick the whole
// app (nav stays accessible), and "Reset View" re-mounts the current route.
const RouteErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

export const App: React.FC = () => {
  const revalidate = useConnectionStore((s) => s.revalidate)

  // On startup, re-validate any persisted credentials against the CoreC
  // instance. This flips isConnected→true when the saved session is still
  // valid (so React Query hooks activate after a page refresh) or clears
  // the connecting flag when it isn't (redirecting to /login).
  useEffect(() => {
    void revalidate()
  }, [revalidate])

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            {/* Public Connection Setup */}
            <Route path="/login" element={<ConnectionPage />} />

            {/* Monitor Space (Public display & plant-floor monitoring) */}
            <Route
              path="/monitor"
              element={
                <RequireConnection>
                  <MonitorLayout />
                </RequireConnection>
              }
            >
              <Route index element={<Navigate to="/monitor/dashboard" replace />} />
              <Route
                path="dashboard"
                element={
                  <RouteErrorBoundary>
                    <DashboardPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="tags"
                element={
                  <RouteErrorBoundary>
                    <TagExplorerPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="alerts"
                element={
                  <RouteErrorBoundary>
                    <AlertsPage />
                  </RouteErrorBoundary>
                }
              />
            </Route>

            {/* Admin Space (Southbound, Northbound, Control, Config, etc.) */}
            <Route
              path="/admin"
              element={
                <RequireConnection>
                  <AdminLayout />
                </RequireConnection>
              }
            >
              <Route index element={<Navigate to="/admin/drivers" replace />} />
              <Route
                path="drivers"
                element={
                  <RouteErrorBoundary>
                    <DriversPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="drivers/:name"
                element={
                  <RouteErrorBoundary>
                    <DriverDetailPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="transports"
                element={
                  <RouteErrorBoundary>
                    <TransportsPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="transports/:name"
                element={
                  <RouteErrorBoundary>
                    <TransportDetailPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="rules"
                element={
                  <RouteErrorBoundary>
                    <RulesPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="write"
                element={
                  <RouteErrorBoundary>
                    <WriteControlPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="dashboard-editor"
                element={
                  <RouteErrorBoundary>
                    <DashboardEditorPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="config"
                element={
                  <RouteErrorBoundary>
                    <ConfigCenterPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="topology"
                element={
                  <RouteErrorBoundary>
                    <TopologyPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="diagnostics"
                element={
                  <RouteErrorBoundary>
                    <DiagnosticsPage />
                  </RouteErrorBoundary>
                }
              />
              <Route
                path="settings"
                element={
                  <RouteErrorBoundary>
                    <SettingsPage />
                  </RouteErrorBoundary>
                }
              />
            </Route>

            {/* Fallback */}
            <Route path="/" element={<Navigate to="/monitor/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/monitor/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
