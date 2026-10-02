import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

const SIDEBAR_KEY = 'corec_sidebar_collapsed'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia('(max-width: 767px)').matches,
  )
  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])
  return isMobile
}

/**
 * Sidebar layout state: desktop collapse (persisted in localStorage) plus
 * mobile drawer open/close. The mobile drawer auto-closes on route change
 * and when resizing to desktop.
 */
export function useSidebarState() {
  const isMobile = useIsMobile()
  const location = useLocation()

  // Sidebar collapse state (desktop) — persisted in localStorage
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof localStorage === 'undefined') return true
    return localStorage.getItem(SIDEBAR_KEY) !== 'expanded'
  })

  // Mobile drawer open/close
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? 'collapsed' : 'expanded')
  }, [collapsed])

  // Close mobile drawer on route change
  // biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is an intentional trigger — close the drawer on navigation, not a value read in the body.
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  // Close mobile drawer when resizing to desktop
  useEffect(() => {
    if (!isMobile) setMobileOpen(false)
  }, [isMobile])

  return { isMobile, collapsed, setCollapsed, mobileOpen, setMobileOpen }
}
