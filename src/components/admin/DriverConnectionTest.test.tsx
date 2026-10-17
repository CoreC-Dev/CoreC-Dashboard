// @vitest-environment jsdom
// Component-level test for the DriverWizard's "test connection" step
// (DriverConnectionTest). The endpoint layer is mocked (real hook wiring:
// useDriverTest → postDriverTest), i18n is forced to English for
// deterministic content assertions.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DriverConnectionTest } from '@/components/admin/DriverConnectionTest'
import i18n from '@/i18n'
import type { DriverTestResult } from '@/types/api'

vi.mock('@/api/endpoints', () => ({
  postDriverTest: vi.fn(),
}))

import * as api from '@/api/endpoints'

const connected: DriverTestResult = {
  outcome: 'completed',
  data: { ok: true, connected: true, latency_ms: 12, driver_type: 'modbus-tcp' },
}

const failed: DriverTestResult = {
  outcome: 'completed',
  data: {
    ok: false,
    connected: false,
    error: 'dial tcp 10.0.0.5:502: connect: connection refused',
    latency_ms: 3,
    driver_type: 'modbus-tcp',
  },
}

function renderWithClient(el: ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const utils = render(<QueryClientProvider client={qc}>{el}</QueryClientProvider>)
  return {
    ...utils,
    rerenderEl: (next: ReactElement) =>
      utils.rerender(<QueryClientProvider client={qc}>{next}</QueryClientProvider>),
  }
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
})

// vitest runs without globals:true — @testing-library/react's auto-cleanup
// never registers; clean the DOM explicitly between tests.
afterEach(() => {
  cleanup()
})

describe('DriverConnectionTest', () => {
  it('renders the probe with the button enabled once a driver type is selected', () => {
    renderWithClient(<DriverConnectionTest type="modbus-tcp" settings={{ host: '10.0.0.5' }} />)
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeTruthy()
    expect(screen.getByText(/throwaway server-side instance/)).toBeTruthy()
  })

  it('disables the button before a driver type is chosen', () => {
    renderWithClient(<DriverConnectionTest type={null} settings={{}} />)
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled()
  })

  it('probes with the current type+settings and shows the latency on success', async () => {
    vi.mocked(api.postDriverTest).mockResolvedValue(connected)
    renderWithClient(
      <DriverConnectionTest type="modbus-tcp" settings={{ host: '10.0.0.5' }} name="probe-1" />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    })

    expect(api.postDriverTest).toHaveBeenCalledWith('modbus-tcp', { host: '10.0.0.5' }, 'probe-1')
    expect(await screen.findByText('Connected in 12 ms')).toBeTruthy()
  })

  it('shows the verbatim server error and an actionable hint on a failed probe', async () => {
    vi.mocked(api.postDriverTest).mockResolvedValue(failed)
    renderWithClient(<DriverConnectionTest type="modbus-tcp" settings={{}} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    })

    expect(await screen.findByText('Connection failed')).toBeTruthy()
    expect(screen.getByText('dial tcp 10.0.0.5:502: connect: connection refused')).toBeTruthy()
    expect(screen.getByText(/probe is optional/)).toBeTruthy()
  })

  it('shows the rejection reason when the server refuses the request (400)', async () => {
    vi.mocked(api.postDriverTest).mockResolvedValue({
      outcome: 'rejected',
      error: 'unknown driver type: no-such-type',
    })
    renderWithClient(<DriverConnectionTest type="no-such-type" settings={{}} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    })

    expect(await screen.findByText('Server rejected the test request')).toBeTruthy()
    expect(screen.getByText('unknown driver type: no-such-type')).toBeTruthy()
  })

  it('shows a transport failure without throwing (generic request-failed state)', async () => {
    vi.mocked(api.postDriverTest).mockRejectedValue(new Error('network unreachable'))
    renderWithClient(<DriverConnectionTest type="modbus-tcp" settings={{}} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    })

    expect(await screen.findByText('Test request failed')).toBeTruthy()
    expect(screen.getByText('network unreachable')).toBeTruthy()
  })

  it('disables the button while a probe is in flight and ignores extra clicks', async () => {
    let resolveProbe: (v: DriverTestResult) => void = () => {}
    vi.mocked(api.postDriverTest).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveProbe = resolve
        }),
    )
    renderWithClient(<DriverConnectionTest type="modbus-tcp" settings={{}} />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    })

    // In-flight: the button flips to "Testing…" and is disabled; a second
    // click must not fire a second probe.
    const pendingBtn = screen.getByRole('button', { name: /Testing…/ })
    expect(pendingBtn).toBeDisabled()
    fireEvent.click(pendingBtn)
    expect(api.postDriverTest).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveProbe(connected)
    })
    expect(await screen.findByText('Connected in 12 ms')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled()
  })

  it('hides the previous result once the settings change (stale guard)', async () => {
    vi.mocked(api.postDriverTest).mockResolvedValue(connected)
    const { rerenderEl } = renderWithClient(
      <DriverConnectionTest type="modbus-tcp" settings={{ host: '10.0.0.5' }} />,
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
    })
    expect(await screen.findByText('Connected in 12 ms')).toBeTruthy()

    // Editing the host invalidates the green check — it described the OLD
    // inputs and must not mislead about the new ones.
    rerenderEl(<DriverConnectionTest type="modbus-tcp" settings={{ host: '10.0.0.6' }} />)
    expect(screen.queryByText('Connected in 12 ms')).toBeNull()
  })
})
