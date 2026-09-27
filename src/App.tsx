import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type React from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout } from './components/layout/AdminLayout'
import { MonitorLayout } from './components/layout/MonitorLayout'
import { ConfigCenterPage } from './features/admin/ConfigCenterPage'
import { DashboardEditorPage } from './features/admin/DashboardEditorPage'
import { DiagnosticsPage } from './features/admin/DiagnosticsPage'
import { DriversPage } from './features/admin/DriversPage'
import { RulesPage } from './features/admin/RulesPage'
import { SettingsPage } from './features/admin/SettingsPage'
import { TopologyPage } from './features/admin/TopologyPage'
import { TransportsPage } from './features/admin/TransportsPage'
import { WriteControlPage } from './features/admin/WriteControlPage'
import { ConnectionPage } from './features/login/ConnectionPage'
import { AlertsPage } from './features/monitor/AlertsPage'
import { DashboardPage } from './features/monitor/DashboardPage'
import { TagExplorerPage } from './features/monitor/TagExplorerPage'
import { useConnectionStore } from './stores/connectionStore'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Protected route wrapper
const RequireConnection: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { baseUrl, secret } = useConnectionStore()
  if (!baseUrl || !secret) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

export const App: React.FC = () => {
  return (
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
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="tags" element={<TagExplorerPage />} />
            <Route path="alerts" element={<AlertsPage />} />
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
            <Route path="drivers" element={<DriversPage />} />
            <Route path="transports" element={<TransportsPage />} />
            <Route path="rules" element={<RulesPage />} />
            <Route path="write" element={<WriteControlPage />} />
            <Route path="dashboard-editor" element={<DashboardEditorPage />} />
            <Route path="config" element={<ConfigCenterPage />} />
            <Route path="topology" element={<TopologyPage />} />
            <Route path="diagnostics" element={<DiagnosticsPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          {/* Fallback */}
          <Route path="/" element={<Navigate to="/monitor/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/monitor/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

export default App
