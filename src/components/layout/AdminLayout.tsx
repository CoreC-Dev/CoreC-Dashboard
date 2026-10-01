import { X } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export const AdminLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <TopBar onMenuClick={() => setSidebarOpen(true)} />
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Mobile sidebar drawer */}
        {sidebarOpen && (
          <>
            <button
              type="button"
              aria-label="Close sidebar"
              className="fixed inset-0 z-40 bg-black/50 md:hidden cursor-default"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="fixed inset-y-0 left-0 z-50 md:hidden">
              <div className="relative h-full">
                <Sidebar onNavigate={() => setSidebarOpen(false)} />
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close sidebar"
                  className="absolute top-2 right-2 h-8 w-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}

        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-muted/10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
