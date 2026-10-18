// @vitest-environment jsdom
// A-03 — saving an instance must trigger an immediate probe: the operator
// sees the connecting → verdict transition within seconds instead of a
// grey dot for up to 15s. Exercises the full panel → dialog → store →
// probe chain with real fetch mocked at the transport boundary.
import {
  act,
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstancePanel } from '@/features/home/InstancePanel'
import i18n from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'
import type { CoreCInstance } from '@/types/models'

// Load-tolerant async-assertion timeout: the runner is shared with parallel
// agents on a 2-core host, and RTL waitFor's 1s default flakes under contention.
configure({ asyncUtilTimeout: 4000 })

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts)

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

describe('InstancePanel — import result clarity (A-09)', () => {
  /** Open the import dialog from the empty state and return its scope. */
  async function openImportDialog() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('instances.import') }))
    })
    return within(screen.getByRole('dialog'))
  }

  /** Paste a payload into the dialog textarea (scoped: getByLabelText also
   matches the dialog element via aria-labelledby). */
  async function pastePayload(payload: string, scope: ReturnType<typeof within>) {
    await act(async () => {
      fireEvent.change(scope.getByRole('textbox'), {
        target: { value: payload },
      })
    })
  }

  function validItemsJson() {
    return JSON.stringify([
      { id: 'imp-1', name: 'Imported A', baseUrl: 'http://a:9090', secret: 'import-secret' },
    ])
  }

  it('shows the invalid-JSON message and keeps the dialog open', async () => {
    vi.useFakeTimers()
    render(
      <MemoryRouter>
        <InstancePanel />
      </MemoryRouter>,
    )

    const dialog = await openImportDialog()
    await pastePayload('{not valid json', dialog)
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: t('instances.import') }))
    })

    // A parse failure is reported as what it is — not "added 0, skipped 0".
    expect(screen.getByText(t('instances.importInvalid'))).toBeInTheDocument()
    // …and the dialog stays open so the operator can fix the payload.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows success, then closes the dialog ~1.5s later (result not swallowed)', async () => {
    vi.useFakeTimers()
    render(
      <MemoryRouter>
        <InstancePanel />
      </MemoryRouter>,
    )

    const dialog = await openImportDialog()
    await pastePayload(validItemsJson(), dialog)
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: t('instances.import') }))
    })

    // The result is rendered first…
    expect(screen.getByText(t('instances.importSuccess', { added: 1 }))).toBeInTheDocument()

    // …and only then does the dialog close, instead of vanishing instantly.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useInstanceStore.getState().instances).toHaveLength(1)
    expect(useInstanceStore.getState().instances[0].name).toBe('Imported A')
  })

  it('reports an all-duplicates import and keeps the dialog open', async () => {
    vi.useFakeTimers()
    resetStore([makeInstance()])
    render(
      <MemoryRouter>
        <InstancePanel />
      </MemoryRouter>,
    )

    // Header import button (non-empty state) — open the dialog.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('instances.import') }))
    })
    const dialog = within(screen.getByRole('dialog'))
    await pastePayload(
      JSON.stringify([{ id: 'inst-1', name: 'Gateway A', baseUrl: 'http://x:9090' }]),
      dialog,
    )
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: t('instances.import') }))
    })

    expect(screen.getByText(t('instances.importAllSkipped', { skipped: 1 }))).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('reports a partial import with separate duplicate and invalid counts', async () => {
    vi.useFakeTimers()
    resetStore([makeInstance()])
    render(
      <MemoryRouter>
        <InstancePanel />
      </MemoryRouter>,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t('instances.import') }))
    })
    const dialog = within(screen.getByRole('dialog'))
    await pastePayload(
      JSON.stringify([
        { id: 'imp-9', name: 'Fresh One', baseUrl: 'http://fresh:9090', secret: 's' }, // added
        { id: 'inst-1', name: 'Gateway A', baseUrl: 'http://x:9090' }, // duplicate → skipped
        { name: 'no-id', baseUrl: 'http://bad' }, // malformed → invalid
      ]),
      dialog,
    )
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: t('instances.import') }))
    })

    expect(
      screen.getByText(t('instances.importPartial', { added: 1, skipped: 1, invalid: 1 })),
    ).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600)
    })
    // Partial success closes after showing the numbers.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useInstanceStore.getState().instances).toHaveLength(2)
  })
})

describe('InstancePanel — storage failure banner (A-11)', () => {
  it('warns visibly when the last persist to localStorage failed', () => {
    resetStore([makeInstance()])
    useInstanceStore.setState({ persistFailed: true })

    render(
      <MemoryRouter>
        <InstancePanel />
      </MemoryRouter>,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent(t('instances.storagePersistFailed'))
  })

  it('shows no banner when persistence is healthy', () => {
    resetStore([makeInstance()])
    useInstanceStore.setState({ persistFailed: false })

    render(
      <MemoryRouter>
        <InstancePanel />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('InstancePanel — help links (A-06)', () => {
  const HELP_URL = 'https://github.com/CoreC-Dev/CoreC-Dashboard'

  it('exposes an outbound help button in the header', () => {
    render(
      <MemoryRouter>
        <InstancePanel />
      </MemoryRouter>,
    )

    const help = screen.getByRole('link', { name: t('instances.help') })
    expect(help).toHaveAttribute('href', HELP_URL)
    // Opened in a new tab without a window.opener handle.
    expect(help).toHaveAttribute('target', '_blank')
    expect(help).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('links the first-run empty state to the help docs', () => {
    render(
      <MemoryRouter>
        <InstancePanel />
      </MemoryRouter>,
    )

    const hint = screen.getByRole('link', { name: t('instances.emptyHelpHint') })
    expect(hint).toHaveAttribute('href', HELP_URL)
    expect(hint).toHaveAttribute('target', '_blank')
  })
})
