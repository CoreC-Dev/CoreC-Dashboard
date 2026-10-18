// @vitest-environment jsdom
// A-03 — saving an instance must trigger an immediate probe: the operator
// sees the connecting → verdict transition within seconds instead of a
// grey dot for up to 15s. Exercises the full panel → dialog → store →
// probe chain with real fetch mocked at the transport boundary.
import { act, cleanup, configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstancePanel } from '@/features/home/InstancePanel'
import i18n from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'
import type { CoreCInstance } from '@/types/models'

// Load-tolerant async-assertion timeout: the runner is shared with parallel
// agents on a 2-core host, and RTL waitFor's 1s default flakes under contention.
configure({ asyncUtilTimeout: 4000 })

const t = (key: string) => i18n.t(key)

// themeStore reads the system theme via matchMedia at module scope, which
// jsdom does not implement — stub it before any module import evaluates.
vi.hoisted(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  })
})

// Mock fetch — the panel probe hits 5 endpoints per instance.
const mockFetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>()
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Healthy responses for every probe endpoint. */
function mockHealthyEndpoints() {
  mockFetch.mockImplementation((url: string) => {
    switch (url) {
      case '/corec-proxy/':
        return Promise.resolve(
          jsonRes({ name: 'edge-node', version: '1.2.3', status: 'running', uptime: '1h' }),
        )
      case '/corec-proxy/stats':
        return Promise.resolve(jsonRes({ drivers: 1 }))
      case '/corec-proxy/tags':
        return Promise.resolve(jsonRes({ tags: { a: 1 } }))
      case '/corec-proxy/rules':
        return Promise.resolve(jsonRes({ rules: [] }))
      case '/corec-proxy/configs/raw':
        return Promise.resolve(new Response('', { status: 200 }))
      default:
        return Promise.resolve(new Response('not found', { status: 404 }))
    }
  })
}

function makeInstance(overrides: Partial<CoreCInstance> = {}): CoreCInstance {
  return {
    id: 'inst-1',
    name: 'Gateway A',
    baseUrl: 'http://127.0.0.1:9090',
    secret: 'secret-token',
    createdAt: '2026-01-01T00:00:00.000Z',
    sortOrder: 1,
    ...overrides,
  }
}

function resetStore(instances: CoreCInstance[] = []): void {
  useInstanceStore.setState({ instances, probing: {}, probeErrors: {} })
}

/** Fill the add/edit dialog with valid values and submit. */
async function submitDialog(buttonName: string) {
  await act(async () => {
    fireEvent.change(screen.getByPlaceholderText(t('instances.namePlaceholder')), {
      target: { value: 'Workshop 1' },
    })
  })
  await act(async () => {
    fireEvent.change(screen.getByPlaceholderText('********'), {
      target: { value: 'secret123' },
    })
  })
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: buttonName }))
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  localStorage.clear()
  sessionStorage.clear()
  resetStore()
  mockHealthyEndpoints()
})

afterEach(cleanup)

// Suite timeout raised from the 5s default (same rationale as
// InstanceDialog.test.tsx: heavy full-panel renders on a loaded runner).
describe('InstancePanel — immediate probe after save (A-03)', { timeout: 15_000 }, () => {
  it('probes a newly added instance right away instead of waiting 15s', async () => {
    // Empty state — one add button, and the mount probe has nothing to do.
    render(
      <MemoryRouter>
        <InstancePanel />
      </MemoryRouter>,
    )
    expect(mockFetch).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('instances.addNew') }))
    })
    await submitDialog(t('instances.add'))

    // The save triggered an immediate probe: 5 endpoint requests fired
    // without any timer advance (the 15s cycle would not have run yet)…
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(5)
    })
    // …and the result landed on the new instance (probe completed).
    await waitFor(() => {
      const state = useInstanceStore.getState()
      expect(state.instances[0]?.lastKnownInfo?.version).toBe('1.2.3')
      expect(state.probeErrors[state.instances[0]?.id ?? '']).toBeNull()
      expect(state.probing[state.instances[0]?.id ?? '']).toBe(false)
    })
    expect(useInstanceStore.getState().instances).toHaveLength(1)
  })

  it('probes an updated instance right away after saving edits', async () => {
    resetStore([makeInstance()])
    render(
      <MemoryRouter>
        <InstancePanel />
      </MemoryRouter>,
    )
    // The homepage mount probe runs for the seeded instance first.
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(5)
    })

    // Open the edit dialog via the card's pencil button.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('common.edit') }))
    })
    await submitDialog(t('common.save'))

    // The edit save fired a fresh immediate probe (5 more requests)…
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(10)
    })
    // …and the updated instance keeps a fresh connected stamp.
    const state = useInstanceStore.getState()
    expect(state.instances[0].name).toBe('Workshop 1')
    await waitFor(() => {
      expect(useInstanceStore.getState().instances[0]?.lastConnectedAt).toBeTruthy()
    })
  })
})
