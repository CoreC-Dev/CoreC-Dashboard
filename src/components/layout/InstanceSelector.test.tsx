// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstanceSelector, switchInstanceTarget } from '@/components/layout/InstanceSelector'
import i18n from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'

// Regression test for the "Maximum update depth exceeded" (#185) bug in
// InstanceSelector. The selector used to be `useShallow((s) => s.instances.map(
// (i) => ({ ... })))`. zustand v5 has no equalityFn arg (it uses
// useSyncExternalStore + Object.is), and useShallow compares array elements by
// reference — so every getSnapshot() returned a brand-new array of brand-new
// objects. The loop only kicks in once the store is updated after mount (e.g.
// a connection probe writes lastKnownInfo), which is why it surfaced on every
// instance-scoped route in production but not in a plain render.
//
// Fake timers: rendering Radix Select + triggering a store-driven re-render
// schedules React scheduler macrotasks (setTimeout/setImmediate via
// performWorkUntilDeadline). Under Node 24 these can fire after the jsdom
// window is torn down → "ReferenceError: window is not defined" attributed to
// the next test file. Fake timers keep those tasks in the fake queue (cleared
// on useRealTimers) so no orphaned macrotask escapes the test.

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

const consoleErrors: string[] = []
beforeAll(async () => {
  await i18n.changeLanguage('en')
})
beforeEach(() => {
  vi.useFakeTimers()
  consoleErrors.length = 0
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    consoleErrors.push(args.map(String).join(' '))
  })
  useInstanceStore.setState({ instances: [], probing: {}, probeErrors: {} })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  useInstanceStore.setState({ instances: [], probing: {}, probeErrors: {} })
})

function seed() {
  useInstanceStore.setState({
    instances: [
      {
        id: 'inst_a',
        name: 'Alpha',
        baseUrl: 'http://a',
        secret: 's',
        useProxy: 'auto',
        createdAt: '',
        sortOrder: 1,
      },
      {
        id: 'inst_b',
        name: 'Bravo',
        baseUrl: 'http://b',
        secret: 's',
        useProxy: 'auto',
        createdAt: '',
        sortOrder: 2,
      },
    ],
    probing: {},
    probeErrors: {},
  })
}

describe('InstanceSelector (#185 regression)', () => {
  it('does not infinite-loop when the instance store updates after mount', () => {
    seed()
    render(
      <MemoryRouter>
        <InstanceSelector eff={false} />
      </MemoryRouter>,
    )

    // Simulate a connection probe writing lastKnownInfo + lastConnectedAt —
    // the store update that used to trigger the render loop.
    act(() => {
      useInstanceStore.getState().setProbeResult('inst_a', true, {
        name: 'Alpha',
        version: '1.0',
        status: 'running',
        uptime: '1h',
      })
    })

    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(consoleErrors.some((m) => m.includes('Maximum update depth'))).toBe(false)
  })
})

describe('switchInstanceTarget (D-20 route preservation)', () => {
  it('keeps the monitor sub-page when switching instances', () => {
    expect(switchInstanceTarget('/corec/inst-a/monitor/alerts', 'inst-b')).toBe(
      '/corec/inst-b/monitor/alerts',
    )
  })

  it('keeps the admin sub-page when switching instances', () => {
    expect(switchInstanceTarget('/corec/inst-a/admin/config', 'inst-b')).toBe(
      '/corec/inst-b/admin/config',
    )
  })

  it('drops entity-scoped detail segments to the section list page', () => {
    // The driver `drv-1` belongs to the OLD instance — the new one may not
    // have it, so the switch lands on the drivers list, not a dead detail.
    expect(switchInstanceTarget('/corec/inst-a/admin/drivers/drv-1', 'inst-b')).toBe(
      '/corec/inst-b/admin/drivers',
    )
  })

  it('falls back to the section root when only the section is in the path', () => {
    expect(switchInstanceTarget('/corec/inst-a/monitor', 'inst-b')).toBe('/corec/inst-b/monitor')
  })

  it('defaults to the monitor section outside the instance tree', () => {
    expect(switchInstanceTarget('/settings', 'inst-b')).toBe('/corec/inst-b/monitor')
    expect(switchInstanceTarget('/', 'inst-b')).toBe('/corec/inst-b/monitor')
  })
})

describe('InstanceSelector dropdown dots (D-20 live status)', () => {
  /** Open the Radix Select via keyboard and return the listbox. */
  function openDropdown() {
    const { container } = render(
      <MemoryRouter initialEntries={['/corec/inst_a/monitor/dashboard']}>
        <InstanceSelector eff={false} />
      </MemoryRouter>,
    )
    const trigger = screen.getByRole('combobox', { name: 'Switch Instance' })
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const listbox = screen.getByRole('listbox')
    expect(listbox).toBeTruthy()
    return { container, listbox }
  }

  it('greens an instance only when a probe actually succeeded', () => {
    seed()
    act(() => {
      // Alpha probes OK; Bravo has never been reached (no lastConnectedAt).
      useInstanceStore.getState().setProbeResult('inst_a', true, {
        name: 'Alpha',
        version: '1.0',
        status: 'running',
        uptime: '1h',
      })
    })
    openDropdown()

    const alpha = screen.getByRole('option', { name: /Alpha/ })
    expect(alpha.querySelector('.bg-status-running')).not.toBeNull()
    const bravo = screen.getByRole('option', { name: /Bravo/ })
    expect(bravo.querySelector('.bg-status-running')).toBeNull()
    expect(bravo.querySelector('.bg-status-idle')).not.toBeNull()
  })

  it('shows red for an instance the probe just reported dead — even one that connected before', () => {
    seed()
    act(() => {
      useInstanceStore.getState().setProbeResult('inst_a', true, {
        name: 'Alpha',
        version: '1.0',
      })
      useInstanceStore.getState().setProbeResult('inst_a', false, undefined, 'unreachable')
    })
    openDropdown()

    // The old dot went green from lastConnectedAt alone ("was ever
    // connected"); a fresh failure verdict must override it.
    const alpha = screen.getByRole('option', { name: /Alpha/ })
    expect(alpha.querySelector('.bg-status-error')).not.toBeNull()
    expect(alpha.querySelector('.bg-status-running')).toBeNull()
  })

  it('shows the connecting dot only for a first probe with no verdict yet', () => {
    seed()
    act(() => {
      useInstanceStore.getState().setProbing('inst_b', true)
    })
    openDropdown()

    const bravo = screen.getByRole('option', { name: /Bravo/ })
    expect(bravo.querySelector('.bg-status-warning')).not.toBeNull()
  })
})
