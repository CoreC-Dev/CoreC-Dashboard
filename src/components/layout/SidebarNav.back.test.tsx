// @vitest-environment jsdom
// SidebarNav — bottom function area: the old "Disconnect"
// button only called navigate('/'), byte-identical to the back button above
// it, while its label promised a distinct action — a lying, duplicated
// escape. It was merged away: one button remains, labeled with the same
// "Back to instances" copy every other escape in the app uses.
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarNav } from '@/components/layout/SidebarNav'
import i18n from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// SidebarNav pulls in ThemeSelector → themeStore, whose module scope probes
// prefers-color-scheme via window.matchMedia — absent in jsdom.
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

// Fake timers + ResizeObserver mock — same posture as SidebarNav.badge.test.
const RealRO = globalThis.ResizeObserver

beforeEach(() => {
  cleanup()
  vi.useFakeTimers()
  class MockRO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockRO as unknown as typeof ResizeObserver
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

describe('SidebarNav bottom area', () => {
  it('offers exactly one escape to the instance list, no duplicate "Disconnect"', () => {
    renderNav(false)

    // One honest button — same copy as ConnectionGate's dead-end fix.
    expect(screen.getAllByRole('button', { name: 'Back to instances' })).toHaveLength(1)
    // The lying duplicate is gone.
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull()
    expect(screen.queryByLabelText('Disconnect')).toBeNull()
  })

  it('keeps the merged escape accessible in collapsed (icon-rail) mode', () => {
    renderNav(true)

    const back = screen.getByRole('button', { name: 'Back to instances' })
    expect(back).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull()
  })

  it('the dead disconnect keys are gone from both language packs', async () => {
    // Removing the button leaves connection.disconnect/aria.disconnect with
    // zero consumers — dead keys are deleted, and both packs must stay in
    // lockstep (the parity test enforces the set equality; this pins the
    // specific keys the audit named).
    const zh = (await import('@/i18n/zh-CN.json')).default as Record<string, unknown>
    const en = (await import('@/i18n/en.json')).default as Record<string, unknown>

    expect(i18n.exists('connection.disconnect')).toBe(false)
    expect(i18n.exists('aria.disconnect')).toBe(false)
    expect('disconnect' in (zh.connection as object)).toBe(false)
    expect('disconnect' in (en.connection as object)).toBe(false)
    expect('disconnect' in (zh.aria as object)).toBe(false)
    expect('disconnect' in (en.aria as object)).toBe(false)
  })
})
