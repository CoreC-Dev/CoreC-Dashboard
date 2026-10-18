// @vitest-environment jsdom
// C-C1 regression: the Write Control page's dead-letter "Replay Command"
// button must stage the entry in the SAME two-step confirmation dialog the
// manual single write uses — listing the command plus its failure time and
// recorded error — and fire zero writes before an explicit confirm.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { WriteControlPage } from '@/features/admin/WriteControlPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

vi.mock('@/api/endpoints', () => ({
  getDrivers: vi.fn().mockResolvedValue({ drivers: [{ name: 'plc1', type: 'modbus-tcp' }] }),
  getConfigsRaw: vi
    .fn()
    .mockResolvedValue(
      [
        'drivers:',
        '  - name: plc1',
        '    type: modbus-tcp',
        '    settings:',
        '      host: 192.168.1.100',
      ].join('\n'),
    ),
  getDeadLetters: vi.fn().mockResolvedValue({
    failed_writes: [
      {
        command: {
          driver: 'plc1',
          device: 'meter-01',
          tag: 'pump',
          value: true,
          type: 'bool',
          // Stamped by the server on the original write — must NOT be re-sent.
          source: 'api',
          remote: '192.168.1.10:51424',
        },
        error: 'driver disconnected',
        failed_at: '2026-01-01T00:00:00Z',
        attempts: 3,
      },
    ],
  }),
  writeTag: vi.fn(),
}))

import * as api from '@/api/endpoints'

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={qc}>
      <WriteControlPage />
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
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

describe('WriteControlPage dead-letter replay gate (C-C1)', () => {
  it('stages the replay in the write-confirmation dialog; zero writes before confirm', async () => {
    vi.mocked(api.writeTag).mockResolvedValue({ success: true })
    renderPage()

    // The dead letter row renders.
    expect(await screen.findByText('[plc1] Tag: pump = true (bool)')).toBeTruthy()

    // Clicking "Replay Command" only opens the confirmation dialog.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Command' }))
    })

    expect(await screen.findByText('Confirm Write Command')).toBeTruthy()
    // The staged command is listed in full…
    expect(screen.getAllByText('plc1').length).toBeGreaterThan(0)
    expect(screen.getByText('meter-01')).toBeTruthy()
    expect(screen.getByText('pump')).toBeTruthy()
    // …along with the dead-letter context: when it failed, retries
    // exhausted, and the recorded error (the report's warning copy).
    expect(screen.getByText(/This command previously failed \(driver disconnected\)/)).toBeTruthy()
    expect(screen.getByText(/Last failed:/)).toBeTruthy()
    expect(screen.getAllByText('3 attempts exhausted').length).toBe(2)
    // Nothing sent yet.
    expect(api.writeTag).not.toHaveBeenCalled()

    // Explicit confirm → one write of the CLEAN command (no source/remote).
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm re-send' }))
    })

    await waitFor(() => expect(api.writeTag).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.writeTag).mock.calls[0][0]).toEqual({
      driver: 'plc1',
      device: 'meter-01',
      tag: 'pump',
      value: true,
      type: 'bool',
    })
  })

  it('cancel in the replay dialog sends nothing', async () => {
    renderPage()

    expect(await screen.findByText('[plc1] Tag: pump = true (bool)')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Command' }))
    })
    expect(await screen.findByText('Confirm Write Command')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    await waitFor(() => expect(screen.queryByText('Confirm Write Command')).toBeNull())
    expect(api.writeTag).not.toHaveBeenCalled()
  })

  it('manual write path unchanged: empty form submit shows the validation error, no dialog', async () => {
    renderPage()

    expect(await screen.findByText('Field Control & Dead Letter Queue')).toBeTruthy()

    // jsdom does not run submit-button activation on fireEvent.click for
    // forms with unmet `required` constraints — dispatch submit directly.
    await act(async () => {
      fireEvent.submit(document.querySelector('form') as HTMLFormElement)
    })

    expect(await screen.findByText('Please select a driver and specify a tag name')).toBeTruthy()
    expect(screen.queryByText('Confirm Write Command')).toBeNull()
    expect(api.writeTag).not.toHaveBeenCalled()
  })
})
