// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstanceSelector } from '@/components/layout/InstanceSelector'
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
