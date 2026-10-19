// @vitest-environment jsdom
// C-A4 regression: the detail-page quick-edit form must never echo a
// stored secret. Password-kind fields render as masked inputs with a
// show/hide toggle and a "Saved — leave blank to keep" placeholder, and
// a blank password is OMITTED from the generated YAML so the apply merge
// keeps the server's stored value.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TransportDetailPage } from '@/features/admin/TransportDetailPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

vi.setConfig({ testTimeout: 15_000 })

// The mock factory is hoisted above all bindings, so the YAML must be
// inlined here (a top-level const would throw "accessed before
// initialization").
vi.mock('@/api/endpoints', () => ({
  getTransport: vi.fn().mockResolvedValue({
    name: 'mqtt-out',
    type: 'mqtt',
    state: 2,
    published: 5,
    failed: 0,
    received: 0,
    last_publish: '0001-01-01T00:00:00Z',
    queue_size: 0,
    dropped_commands: 0,
  }),
  getConfigsRaw: vi
    .fn()
    .mockResolvedValue(
      [
        'transports:',
        '  - name: mqtt-out',
        '    type: mqtt',
        '    settings:',
        '      broker: tcp://broker.local:1883',
        '      username: operator',
        '      password: hunter2',
        'drivers: []',
        '',
      ].join('\n'),
    ),
  updateConfigs: vi.fn().mockResolvedValue(undefined),
}))

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/admin/transports/mqtt-out']}>
        <Routes>
          <Route path="/admin/transports/:name" element={<TransportDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('secret fields in the quick-edit form (C-A4)', () => {
  it('renders password fields masked, without echoing the stored secret, with a reveal toggle', async () => {
    renderPage()

    // Wait for the transport to resolve before toggling the edit card.
    expect((await screen.findAllByText('mqtt-out')).length).toBeGreaterThan(0)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle edit configuration section' }))
    })

    const pwInput = screen.getByLabelText('Password') as HTMLInputElement
    expect(pwInput.type).toBe('password')
    // The stored secret is NOT in the form state nor the DOM.
    expect(pwInput.value).toBe('')
    expect(screen.queryByText('hunter2')).toBeNull()
    // A saved value is advertised via the placeholder instead.
    expect(pwInput.placeholder).toBe('Saved — leave blank to keep')
    // The sibling text field still pre-fills normally.
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('operator')

    // Reveal toggle flips the input type; conceal flips it back.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Show secret' }))
    })
    expect((screen.getByLabelText('Password') as HTMLInputElement).type).toBe('text')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Hide secret' }))
    })
    expect((screen.getByLabelText('Password') as HTMLInputElement).type).toBe('password')
  })

  it('a blank password is omitted from the apply YAML — the reload keeps the stored secret', async () => {
    const { updateConfigs } = await import('@/api/endpoints')
    renderPage()

    expect((await screen.findAllByText('mqtt-out')).length).toBeGreaterThan(0)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle edit configuration section' }))
    })

    // Change the broker, leave the password blank.
    const brokerInput = screen.getByLabelText('Broker URL')
    await act(async () => {
      fireEvent.change(brokerInput, { target: { value: 'tcp://new-broker:1883' } })
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview & hot-reload' }))
    })
    expect(await screen.findByText('Apply Configuration Changes')).toBeTruthy()

    // Nothing sent before an explicit confirm.
    expect(vi.mocked(updateConfigs)).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm & hot-reload' }))
    })

    await waitFor(() => expect(vi.mocked(updateConfigs)).toHaveBeenCalledTimes(1))
    const payload = vi.mocked(updateConfigs).mock.calls[0][0].payload
    // The edited field is applied…
    expect(payload).toContain('tcp://new-broker:1883')
    // …and the stored password survives via the base-merge (the blank
    // field was omitted, not written as empty).
    expect(payload).toContain('password: hunter2')
  })
})
