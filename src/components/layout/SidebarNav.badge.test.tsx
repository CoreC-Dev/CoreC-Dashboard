// @vitest-environment jsdom
// SidebarNav — the "告警事件" nav badge: a red unread count fed
// by the instance-level alert provider's store. Unread error events take
// precedence; a non-empty dead-letter queue is the fallback signal. The
// audit's aria copy — "{{count}} unread alerts" — must reach screen readers
// through the pill's aria-label.
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarNav } from '@/components/layout/SidebarNav'
import i18n from '@/i18n'
import { useAlertStore } from '@/stores/alertStore'
import { useInstanceStore } from '@/stores/instanceStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// SidebarNav pulls in ThemeSelector → themeStore, whose module scope probes
// prefers-color-scheme via window.matchMedia — absent in jsdom. Hoisted so
// it runs before the imports evaluate.
vi.hoisted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
    const stub = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
    Object.defineProperty(window, 'matchMedia', {
      value: stub,
      writable: true,
      configurable: true,
    })
  }
})

// SidebarNav mounts InstanceSelector, which reads the connection context.
// The instance store stays REAL (empty) — same posture as
// InstanceSelector.test.tsx, which pins the selector's render stability.
vi.mock('@/contexts/ConnectionContext', () => ({
  useConnection: () => ({
    instance: {
      id: 'inst_a',
      name: 'Alpha',
      baseUrl: 'http://a',
      secret: 's',
      createdAt: '',
      sortOrder: 1,
    },
    isConnected: true,
    isConnecting: false,
    error: null,
    serverInfo: null,
    reconnect: vi.fn(),
  }),
}))

// Fake timers keep Radix Select's scheduler macrotasks from leaking past
// the jsdom window (see InstanceSelector.test.tsx for the original report).
// jsdom has no ResizeObserver (same situation as useNavIndicator.test.tsx).
const RealRO = globalThis.ResizeObserver

beforeEach(() => {
  // Auto-cleanup is disabled repo-wide (vitest has no globals:true), so a
  // prior file in the same worker can leave DOM residue — clear it before
  // asserting on a "no badge" state.
  cleanup()
  vi.useFakeTimers()
  // SidebarNav's sliding nav indicator observes item rects.
  class MockRO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockRO as unknown as typeof ResizeObserver
  useAlertStore.setState({ unreadErrorCount: 0, deadLetterCount: 0 })
  useInstanceStore.setState({ instances: [], probing: {}, probeErrors: {} })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  globalThis.ResizeObserver = RealRO
  useInstanceStore.setState({ instances: [], probing: {}, probeErrors: {} })
})

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

function renderNav(collapsed: boolean) {
  return render(
    <MemoryRouter initialEntries={['/corec/inst-1/monitor/dashboard']}>
      <SidebarNav collapsed={collapsed} setCollapsed={() => {}} isMobile={false} />
    </MemoryRouter>,
  )
}

describe('SidebarNav alerts badge', () => {
  it('shows no badge when there are neither unread errors nor dead letters', () => {
    renderNav(false)
    expect(screen.queryByLabelText(/unread alerts/)).toBeNull()
  })

  it('shows the unread error count with the audit aria copy (expanded)', () => {
    useAlertStore.setState({ unreadErrorCount: 3, deadLetterCount: 9 })
    renderNav(false)

    const badge = screen.getByLabelText('3 unread alerts')
    expect(badge.textContent).toBe('3')
  })

  it('falls back to the dead-letter count when nothing is unread', () => {
    useAlertStore.setState({ unreadErrorCount: 0, deadLetterCount: 5 })
    renderNav(false)

    const badge = screen.getByLabelText('5 unread alerts')
    expect(badge.textContent).toBe('5')
  })

  it('renders in collapsed (icon-rail) mode too', () => {
    useAlertStore.setState({ unreadErrorCount: 2 })
    renderNav(true)

    expect(screen.getByLabelText('2 unread alerts')).toBeTruthy()
  })

  it('caps the visible count at 99+ while keeping the true aria count', () => {
    useAlertStore.setState({ unreadErrorCount: 250 })
    renderNav(false)

    expect(screen.getByLabelText('250 unread alerts').textContent).toBe('99+')
  })

  it('updates live when the provider counts change', () => {
    renderNav(false)
    expect(screen.queryByLabelText(/unread alerts/)).toBeNull()

    act(() => {
      useAlertStore.setState({ unreadErrorCount: 7 })
    })
    expect(screen.getByLabelText('7 unread alerts')).toBeTruthy()
  })
})
