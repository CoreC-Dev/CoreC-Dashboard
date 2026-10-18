// @vitest-environment jsdom
// C-A8 regression: the runtime empty state used to send the operator to
// edit YAML while the page's own Create button sat unused in the corner.
// The empty card now carries the honest copy and a working Create button.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DriversPage } from '@/features/admin/DriversPage'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'

vi.setConfig({ testTimeout: 15_000 })

vi.mock('@/api/endpoints', () => ({
  getDrivers: vi.fn().mockResolvedValue({ drivers: [] }),
  getConfigsRaw: vi.fn().mockResolvedValue('drivers: []\n'),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
}))

function wrap(el: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, staleTime: Infinity } },
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
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})

afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
})

describe('drivers empty state (C-A8)', () => {
  it('shows the honest copy with a working Create button that opens the wizard', async () => {
    useConfigStore.setState({
      workingConfig: { drivers: [] },
      savedConfig: { drivers: [] },
      dirty: false,
      seedStatus: 'ready',
      seedError: null,
    })
    render(wrap(<DriversPage />))

    // The empty card explains the two real paths instead of "edit YAML".
    expect(
      await screen.findByText(/No drivers yet. Click "Create Driver" \(top right\)/),
    ).toBeTruthy()

    // Two Create affordances now exist (header + empty card) — click the
    // empty card's one; the wizard title then doubles the label.
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Create Driver' }).at(-1)!)
    })
    await screen.findAllByText('Create Driver')
    expect(screen.getAllByText('Create Driver').length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the inline Create disabled while the seed is blocked', async () => {
    // A never-settling load keeps the seed blocked (the resolving mock
    // would flip the store back to ready via the auto-seed effect).
    const { getConfigsRaw } = await import('@/api/endpoints')
    vi.mocked(getConfigsRaw).mockImplementation(() => new Promise<never>(() => {}))
    useConfigStore.setState({
      workingConfig: null,
      savedConfig: null,
      dirty: false,
      seedStatus: 'loading',
      seedError: null,
    })
    render(wrap(<DriversPage />))

    expect(
      await screen.findByText(/No drivers yet. Click "Create Driver" \(top right\)/),
    ).toBeTruthy()
    // Both Create affordances (header + empty card) honor the seed guard.
    const buttons = screen.getAllByRole('button', { name: 'Create Driver' })
    for (const btn of buttons) expect(btn).toBeDisabled()
  })
})
