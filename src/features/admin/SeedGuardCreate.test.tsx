// @vitest-environment jsdom
// X4 leftover wiring point: the entity list pages must make the D-16
// seed block VISIBLE — Create disabled plus the shared SeedBlockedBanner
// while GET /configs/raw has not produced a baseline — and must lift the
// block (and open the wizard) once the seed succeeds.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DriversPage } from '@/features/admin/DriversPage'
import { RulesPage } from '@/features/admin/RulesPage'
import { TransportsPage } from '@/features/admin/TransportsPage'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'

vi.mock('@/api/endpoints', () => ({
  getDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  getTransports: vi.fn().mockResolvedValue({ transports: [] }),
  getRules: vi.fn().mockResolvedValue({ rules: [] }),
  // Controllable per test; default: the load never settles (blocked).
  getConfigsRaw: vi.fn(() => new Promise<never>(() => {})),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
  getConfigs: vi.fn().mockResolvedValue({}),
}))

// These pages render heavy card grids and the driver wizard; under
// full-suite load on a 2-core box (parallel agent workstreams) they can
// exceed the 5s default. 15s mirrors the BatchWritePanel suite-timeout
// precedent.
vi.setConfig({ testTimeout: 15_000 })

const SERVER_YAML = ['global:', '  log-level: info', 'drivers: []', ''].join('\n')

function wrap(el: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: Infinity },
    },
  })
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{el}</MemoryRouter>
    </QueryClientProvider>
  )
}

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
  // jsdom lacks ResizeObserver, which the driver wizard's sliding step
  // indicator needs once the Create click opens it (same stub as the
  // WizardCancelGuard suite).
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

beforeEach(() => {
  useConfigStore.setState({
    workingConfig: null,
    savedConfig: null,
    dirty: false,
    seedStatus: 'idle',
    seedError: null,
  })
})

afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
})

describe('list pages: seed-guarded Create with a visible block (X4 wiring)', () => {
  it('DriversPage: Create disabled + banner while blocked; Retry + success lifts it and opens the wizard', async () => {
    const { getConfigsRaw } = await import('@/api/endpoints')
    vi.mocked(getConfigsRaw).mockRejectedValueOnce(new Error('backend restarting'))
    render(wrap(<DriversPage />))

    // Blocked: the banner explains, the Create button is disabled.
    expect(await screen.findByTestId('seed-blocked-banner')).toBeTruthy()
    const createBtn = screen.getByRole('button', { name: 'Create Driver' })
    expect(createBtn).toBeDisabled()

    await waitFor(() =>
      expect(screen.getByText(/disabled to protect the running config/)).toBeTruthy(),
    )

    // Retry → the fetch succeeds → the block lifts and the banner goes away.
    vi.mocked(getConfigsRaw).mockResolvedValueOnce(SERVER_YAML)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })
    await waitFor(() => expect(screen.queryByTestId('seed-blocked-banner')).toBeNull())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Driver' })).toBeEnabled())

    // Create now works: the wizard opens.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Driver' }))
    })
    // The wizard dialog opens on top of the page: its title matches the
    // header button's label, so the label now appears twice.
    await waitFor(() =>
      expect(screen.getAllByText('Create Driver').length).toBeGreaterThanOrEqual(2),
    )
  })

  it('TransportsPage: Create disabled with the banner while the seed is blocked', async () => {
    render(wrap(<TransportsPage />))

    expect(await screen.findByTestId('seed-blocked-banner')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create Transport' })).toBeDisabled()
  })

  it('RulesPage: Create disabled with the banner while the seed is blocked', async () => {
    render(wrap(<RulesPage />))

    expect(await screen.findByTestId('seed-blocked-banner')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create Rule' })).toBeDisabled()
  })
})
