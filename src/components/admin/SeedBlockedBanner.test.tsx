// @vitest-environment jsdom
// SeedBlockedBanner — the D-16 failure/loading notice shared by the
// entity list pages. State is driven by the real useAutoLoadConfig
// effect (the banner is its only consumer here): a never-settling
// GET /configs/raw keeps the pending copy, a rejection shows the failed
// copy + verbatim error + Retry, a resolved config seeds the store and
// the banner disappears.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { SeedBlockedBanner } from '@/components/admin/SeedBlockedBanner'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'

vi.mock('@/api/endpoints', () => ({
  // Default: a fetch that never settles → the effect stays in 'loading'.
  getConfigsRaw: vi.fn(() => new Promise<never>(() => {})),
}))

const SERVER_YAML = ['global:', '  log-level: info', 'drivers: []', ''].join('\n')

function renderBanner() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, staleTime: Infinity } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <SeedBlockedBanner />
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  // useConfigRaw is connection-gated; enable the query so the seed
  // effect actually observes fetch states.
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
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

describe('SeedBlockedBanner (D-16 visibility)', () => {
  it('shows the pending copy without a Retry button while the seed is loading', async () => {
    renderBanner()

    expect(await screen.findByTestId('seed-blocked-banner')).toBeTruthy()
    expect(screen.getByText(/create is temporarily unavailable/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  })

  it('shows the failed copy with the verbatim error and a Retry button after a failure', async () => {
    const { getConfigsRaw } = await import('@/api/endpoints')
    vi.mocked(getConfigsRaw).mockRejectedValueOnce(new Error('backend restarting'))
    renderBanner()

    expect(await screen.findByTestId('seed-blocked-banner')).toBeTruthy()
    await waitFor(() =>
      expect(
        screen.getByText(/create & apply are disabled to protect the running config/),
      ).toBeTruthy(),
    )
    expect(screen.getByText('backend restarting')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('disappears once the config seeds successfully', async () => {
    const { getConfigsRaw } = await import('@/api/endpoints')
    vi.mocked(getConfigsRaw).mockResolvedValue(SERVER_YAML)
    renderBanner()

    await waitFor(() => expect(screen.queryByTestId('seed-blocked-banner')).toBeNull())
    expect(useConfigStore.getState().seedStatus).toBe('ready')
  })

  it('Retry re-fetches GET /configs/raw', async () => {
    const { getConfigsRaw } = await import('@/api/endpoints')
    vi.mocked(getConfigsRaw).mockRejectedValueOnce(new Error('backend restarting'))
    renderBanner()

    await waitFor(() => expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy())
    const callsBefore = vi.mocked(getConfigsRaw).mock.calls.length
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    })
    expect(vi.mocked(getConfigsRaw).mock.calls.length).toBeGreaterThan(callsBefore)
  })
})
