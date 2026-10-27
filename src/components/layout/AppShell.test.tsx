// @vitest-environment jsdom
// AppShell — live-stream indicator coverage: the "实时流" badge
// and the disconnect banner used to render on /monitor only, leaving the
// seven admin pages (config center, write control — the pages most harmed
// by a silently dead socket) with no stream status at all. Both must be
// visible on every instance route, fed by wsStatusStore.
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '@/components/layout/AppShell'
import i18n from '@/i18n'
import { useWsStatusStore } from '@/stores/wsStatusStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// themeStore (SidebarNav → ThemeSelector) and useSidebarState probe
// prefers-color-scheme in module scope — jsdom has no matchMedia.
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

// The AppShell-level alert provider mounts a real WebSocket subscription;
// irrelevant to the badge wiring under test (the store is driven by hand).
vi.mock('@/components/layout/AlertStreamProvider', () => ({
  AlertStreamProvider: () => null,
}))

// The config seeder fetches the server config via react-query; not under test.
vi.mock('@/hooks/useAutoLoadConfig', () => ({
  useAutoLoadConfig: () => ({ loaded: true }),
}))

// SidebarNav → InstanceSelector reads the connection context.
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

const RealRO = globalThis.ResizeObserver

beforeEach(() => {
  cleanup()
  class MockRO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockRO as unknown as typeof ResizeObserver
  useWsStatusStore.getState().reset()
})

afterEach(() => {
  cleanup()
  globalThis.ResizeObserver = RealRO
  useWsStatusStore.getState().reset()
})

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

function renderShellAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppShell />
    </MemoryRouter>,
  )
}

describe('AppShell stream indicator coverage', () => {
  // The badge lives in the sidebar under the brand mark. In the collapsed
  // rail it is dot-only — the label travels in aria-label — so these
  // assertions use the accessible name, which both shapes carry.
  it('shows the live-stream badge on an admin route', () => {
    const sink = useWsStatusStore.getState().registerStream('admin-stream')
    act(() => sink('open'))
    renderShellAt('/corec/inst-1/admin/config')

    expect(screen.getByLabelText(/Stream Connected/)).toBeTruthy()
  })

  it('keeps showing the badge on monitor routes (regression)', () => {
    const sink = useWsStatusStore.getState().registerStream('monitor-stream')
    act(() => sink('open'))
    renderShellAt('/corec/inst-1/monitor/dashboard')

    expect(screen.getByLabelText(/Stream Connected/)).toBeTruthy()
  })

  it('shows the disconnect banner on an admin route when the stream drops', () => {
    const sink = useWsStatusStore.getState().registerStream('flaky')
    act(() => sink('open'))
    act(() => sink('closed'))
    renderShellAt('/corec/inst-1/admin/write')

    expect(screen.getByLabelText(/Stream Disconnected/)).toBeTruthy()
    expect(screen.getByText(/Live stream disconnected — data may be stale/)).toBeTruthy()
  })

  it('offers the reconnect button on admin when the stream gave up', () => {
    const sink = useWsStatusStore.getState().registerStream('rejected-stream')
    act(() => sink('open'))
    act(() => sink('rejected'))
    renderShellAt('/corec/inst-1/admin/drivers')

    expect(screen.getByText(/gave up after 10 failed attempts/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeTruthy()
  })

  it('renders no banner while every stream is healthy', () => {
    const sink = useWsStatusStore.getState().registerStream('healthy')
    act(() => sink('open'))
    renderShellAt('/corec/inst-1/admin/config')

    expect(screen.queryByText(/Live stream disconnected/)).toBeNull()
    expect(screen.queryByText(/gave up after 10 failed attempts/)).toBeNull()
  })
})

describe('AppShell window-fit card layout contract', () => {
  // The big bg-card FITS THE WINDOW and never scrolls; page content
  // scrolls in its own pane INSIDE the card (keyed page-enter wrapper).
  // jsdom cannot compute scrolling, so this pins the structural contract:
  // the scroll must live on the pane, not on <main> or the card.
  it('the scroll lives on the inner pane, not on main or the card', () => {
    renderShellAt('/corec/inst-1/monitor/dashboard')

    const main = document.querySelector('main') as HTMLElement
    expect(main.className).not.toContain('overflow-y-auto')
    expect(main.className).toContain('min-h-0')

    const card = main.querySelector('.bg-card') as HTMLElement
    // The card clips and stays window-fitted; it never becomes a scroller.
    expect(card.className).toContain('overflow-hidden')
    expect(card.className).not.toContain('overflow-y-auto')

    const pane = card.querySelector('.page-enter') as HTMLElement
    expect(pane.className).toContain('overflow-y-auto')
    expect(pane.className).toContain('min-h-0')
    // Stable gutter: the pane width doesn't jump when content grows.
    expect(pane.className).toContain('[scrollbar-gutter:stable]')
  })

  it('the stream badge lives in the sidebar below the brand mark, never in the scroll pane', () => {
    // Connection state is app chrome: the badge sits under the sidebar
    // logo — constant on every route — and must never ride inside the
    // scrolling content pane.
    renderShellAt('/corec/inst-1/monitor/dashboard')

    const aside = document.querySelector('aside') as HTMLElement
    const pane = document.querySelector('main .bg-card .page-enter') as HTMLElement
    const logo = aside.querySelector('a[aria-label*="CoreC"]') as HTMLAnchorElement | null
    const badge = aside.querySelector('[role="status"]') as HTMLElement | null

    expect(logo).toBeTruthy()
    expect(badge).toBeTruthy()
    // Badge follows the brand mark in the sidebar's document order…
    const position = (badge as HTMLElement).compareDocumentPosition(logo as Node)
    expect(position & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy()
    // …lives inside the sidebar…
    expect(aside.contains(badge as Node)).toBeTruthy()
    // …and never inside the content scroll pane.
    expect(pane.contains(badge as Node)).toBeFalsy()
  })
})
