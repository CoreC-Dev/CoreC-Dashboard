// @vitest-environment jsdom
// Collapsed-rail circles must stay put on hover. The nav container clips
// at its right edge (overflow-x-hidden), so the retired hover:translate-
// x-0.5 nudge pushed the hovered circle 2px under the clip: the icon read
// as off-center inside the circle and the circle's right edge looked cut
// off — most visible right after clicking through nav items, when the
// pointer rests on the next hovered circle. The affordance that REMAINS
// is the icon's centered scale-up (group-hover:scale-110), which scales
// around the circle's center and can never leave it. jsdom cannot
// compute :hover transforms, so this pins the class contract instead.
import { cleanup, render, screen } from '@testing-library/react'
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
  vi.useFakeTimers()
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

/** Nav links rendered by the rail, selected by the item class signature. */
function navLinks(): HTMLAnchorElement[] {
  return screen
    .getAllByRole('link')
    .filter((el) => el.className.includes('relative z-10')) as HTMLAnchorElement[]
}

// Rendering the full rail mounts Radix Select + i18n on top of jsdom;
// under CI load that legitimately exceeds the 5s default, so the three
// contract checks below get an explicit, generous timeout.
const SLOW_RENDER = { timeout: 20000 }

describe('SidebarNav hover motion contract', () => {
  it(
    'collapsed circles never translate on hover (they would clip and read off-center)',
    SLOW_RENDER,
    () => {
      renderNav(true)
      const links = navLinks()
      expect(links.length).toBeGreaterThan(0)
      for (const link of links) {
        expect(link.className).toContain('rounded-full')
        expect(link.className).not.toContain('translate-x')
      }
    },
  )

  it('expanded rows keep the same no-translate contract (same clip edge)', SLOW_RENDER, () => {
    renderNav(false)
    const links = navLinks()
    expect(links.length).toBeGreaterThan(0)
    for (const link of links) {
      expect(link.className).not.toContain('translate-x')
    }
  })

  it('keeps the centered icon scale-up affordance in both modes', SLOW_RENDER, () => {
    for (const collapsed of [true, false]) {
      cleanup()
      renderNav(collapsed)
      const icons = navLinks().flatMap((link) =>
        [...link.querySelectorAll('svg')].filter((s) =>
          s.classList.contains('group-hover:scale-110'),
        ),
      )
      expect(icons.length).toBe(navLinks().length)
    }
  })
})
