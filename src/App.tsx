import type React from 'react'
import { lazy, Suspense } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/button'
import { ConnectionProvider, useConnection } from '@/contexts/ConnectionContext'
import i18n from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'

// Route-level code splitting: each page is a separate chunk, loaded on
// demand via React.lazy + Suspense.
const InstancePanel = lazy(() =>
  import('@/features/home/InstancePanel').then((m) => ({ default: m.InstancePanel })),
)
const GlobalSettingsPage = lazy(() =>
  import('@/features/settings/GlobalSettingsPage').then((m) => ({ default: m.GlobalSettingsPage })),
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
const ConfigCenterPage = lazy(() =>
  import('@/features/admin/ConfigCenterPage').then((m) => ({ default: m.ConfigCenterPage })),
)
const TopologyPage = lazy(() =>
  import('@/features/admin/TopologyPage').then((m) => ({ default: m.TopologyPage })),
)
const DiagnosticsPage = lazy(() =>
  import('@/features/admin/DiagnosticsPage').then((m) => ({ default: m.DiagnosticsPage })),
)

// Minimal Suspense fallback while a lazy chunk loads.
const LoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center h-full min-h-[50vh]">
    <div className="animate-pulse text-sm text-muted-foreground">
      {i18n.t('common.loading', { defaultValue: 'Loading…' })}
    </div>
  </div>
)

// Per-route error boundary. Keyed on pathname so navigating to a different
// route resets the boundary state.
const RouteErrorBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

/**
 * InstanceGuard — wraps the instance route tree. Checks that the instance ID
 * from the route exists in the store. If not, redirects to home. If yes,
 * wraps children in ConnectionProvider (which sets the active connection and
 * provides a per-instance QueryClient).
 */
const InstanceGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { id } = useParams<{ id: string }>()
  const instance = useInstanceStore((s) => s.instances.find((i) => i.id === id))

  if (!id || !instance) {
    return <Navigate to="/" replace />
  }

  return <ConnectionProvider instanceId={id}>{children}</ConnectionProvider>
}

/**
 * ConnectionGate — inside ConnectionProvider, waits for the connection probe
 * to finish before rendering children. Shows a loading state while connecting,
 * or an error state if the connection failed.
 */
const ConnectionGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isConnecting, isConnected, error, reconnect } = useConnection()

  if (isConnecting && !isConnected) {
    return <LoadingFallback />
  }

  if (!isConnected && error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="text-status-error text-lg font-semibold">{error}</div>
        <Button type="button" onClick={reconnect}>
          {i18n.t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      </div>
    )
  }

  return <>{children}</>
}

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <HashRouter>
        <Routes>
          {/* Homepage — instance management panel */}
          <Route
            path="/"
            element={
              <RouteErrorBoundary>
                <InstancePanel />
              </RouteErrorBoundary>
            }
          />

          {/* Global settings */}
          <Route
            path="/settings"
            element={
              <RouteErrorBoundary>
                <GlobalSettingsPage />
              </RouteErrorBoundary>
            }
          />

          {/* Instance-scoped Monitor space */}
          <Route
            path="/corec/:id/monitor"
            element={
              <InstanceGuard>
                <ConnectionGate>
                  <AppShell />
                </ConnectionGate>
              </InstanceGuard>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
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

          {/* Instance-scoped Admin space */}
          <Route
            path="/corec/:id/admin"
            element={
              <InstanceGuard>
                <ConnectionGate>
                  <AppShell />
                </ConnectionGate>
              </InstanceGuard>
            }
          >
            <Route index element={<Navigate to="drivers" replace />} />
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
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ErrorBoundary>
  )
}

export default App
