// @vitest-environment jsdom
// C-A15: the backend exposes POST /transports/{name}/test (publish one
// synthetic data point through the live transport) and the endpoints
// layer has testTransport — but no UI ever called it. The transport
// detail page now offers "Send test point"; the wizard explains the
// probe only exists after save & apply.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TransportTestSender } from '@/components/admin/TransportTestSender'
import { TransportWizard } from '@/features/admin/TransportWizard'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'

vi.setConfig({ testTimeout: 15_000 })

vi.mock('@/api/endpoints', () => ({
  testTransport: vi.fn(),
  getConfigsRaw: vi.fn().mockResolvedValue('transports: []\n'),
}))

import * as api from '@/api/endpoints'

function renderSender(name = 'notify-slack') {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <TransportTestSender name={name} />
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
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

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
})

describe('TransportTestSender (C-A15)', () => {
  it('sends exactly one POST per click and shows the server message on ok', async () => {
    vi.mocked(api.testTransport).mockResolvedValue({ ok: true, message: 'test notification sent' })
    renderSender()

    // Zero requests before the explicit click (danger-area discipline).
    expect(api.testTransport).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send test point' }))
    })

    expect(api.testTransport).toHaveBeenCalledTimes(1)
    expect(api.testTransport).toHaveBeenCalledWith('notify-slack')
    expect(await screen.findByText('Test point sent: test notification sent')).toBeTruthy()
  })

  it('renders an ok:false outcome as a warning with the verbatim Publish error', async () => {
    vi.mocked(api.testTransport).mockResolvedValue({
      ok: false,
      message: 'slack webhook returned 404',
    })
    renderSender()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send test point' }))
    })

    expect(await screen.findByText('Send failed: slack webhook returned 404')).toBeTruthy()
  })

  it('disables the button while the request is in flight and shows transport errors', async () => {
    let resolve: (v: { ok: boolean; message?: string }) => void = () => {}
    vi.mocked(api.testTransport).mockImplementation(
      () =>
        new Promise((res) => {
          resolve = res
        }),
    )
    renderSender()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send test point' }))
    })
    // The pending flag lands a tick after the click; wait for it.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send test point' })).toBeDisabled(),
    )
    expect(api.testTransport).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolve({ ok: true, message: 'late' })
    })
    expect(await screen.findByText('Test point sent: late')).toBeTruthy()
  })

  it('wizard connection step explains the probe lives on the detail page after apply', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <TransportWizard open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('Create Transport')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByText('MQTT'))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    })

    expect(
      await screen.findByText(
        'After saving & applying, send a test point from the transport detail page to verify connectivity.',
      ),
    ).toBeTruthy()
  })
})
