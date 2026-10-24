// @vitest-environment jsdom
// navItems: the admin section used to be a flat 7-item pile —
// "edit the config" (drivers/transports/rules/config) and "watch it run"
// (write/topology/diagnostics) mixed together, and in the collapsed rail
// they were seven bare icons with nothing to anchor a visual search. The
// section now splits into two labeled sub-groups; this pins the split, the
// base-prefixed paths, and that the labels actually render.
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildAdminGroups, buildMonitorItems, type RailItem } from '@/components/layout/navItems'
import { SidebarNav } from '@/components/layout/SidebarNav'
import i18n from '@/i18n'

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
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  globalThis.ResizeObserver = RealRO
})

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

const paths = (items: RailItem[]) => items.map((i) => i.path)

describe('buildAdminGroups', () => {
  it('splits the admin section into configuration and operations halves', () => {
    const groups = buildAdminGroups('/corec/inst-1')

    expect(groups).toHaveLength(2)
    expect(groups[0].labelKey).toBe('nav.adminConfig')
    expect(paths(groups[0].items)).toEqual([
      '/corec/inst-1/admin/drivers',
      '/corec/inst-1/admin/transports',
      '/corec/inst-1/admin/rules',
      '/corec/inst-1/admin/config',
    ])
    expect(groups[1].labelKey).toBe('nav.adminOps')
    expect(paths(groups[1].items)).toEqual([
      '/corec/inst-1/admin/write',
      '/corec/inst-1/admin/topology',
      '/corec/inst-1/admin/diagnostics',
    ])
  })

  it('still covers all seven admin routes exactly once', () => {
    const all = buildAdminGroups('').flatMap((g) => g.items)
    expect(all).toHaveLength(7)
    expect(new Set(all.map((i) => i.path)).size).toBe(7)
  })

  it('resolves every group label and item label in both language packs', () => {
    for (const lng of ['zh-CN', 'en']) {
      for (const group of buildAdminGroups('')) {
        expect(i18n.exists(group.labelKey, { lng }), `${lng}: ${group.labelKey}`).toBe(true)
        for (const item of group.items) {
          expect(i18n.exists(item.labelKey, { lng }), `${lng}: ${item.labelKey}`).toBe(true)
        }
      }
      for (const item of buildMonitorItems('')) {
        expect(i18n.exists(item.labelKey, { lng }), `${lng}: ${item.labelKey}`).toBe(true)
      }
    }
  })
})

describe('SidebarNav admin sub-group rendering', () => {
  it('labels the two admin halves when expanded', () => {
    render(
      <MemoryRouter initialEntries={['/corec/inst-1/monitor/dashboard']}>
        <SidebarNav collapsed={false} setCollapsed={() => {}} isMobile={false} />
      </MemoryRouter>,
    )

    expect(screen.getByText('Configuration')).toBeTruthy()
    expect(screen.getByText('Operations & Diagnostics')).toBeTruthy()
    // The section label still heads the group.
    expect(screen.getByText('Administration')).toBeTruthy()
  })

  it('collapses the sub-group labels to hairline dividers in icon-rail mode', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/corec/inst-1/monitor/dashboard']}>
        <SidebarNav collapsed setCollapsed={() => {}} isMobile={false} />
      </MemoryRouter>,
    )

    // No text labels leak into the rail…
    expect(screen.queryByText('Configuration')).toBeNull()
    expect(screen.queryByText('Operations & Diagnostics')).toBeNull()
    // …but the two boundaries are drawn: monitor|config and config|ops.
    const dividers = container.querySelectorAll('.h-px.bg-border\\/70')
    expect(dividers.length).toBe(2)
  })
})
