// @vitest-environment jsdom
// Regression: the Write Control page's dead-letter "Replay Command"
// button must stage the entry in the SAME two-step confirmation dialog the
// manual single write uses — listing the command plus its failure time and
// recorded error — and fire zero writes before an explicit confirm.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { WriteControlPage } from '@/features/admin/WriteControlPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

// Suite timeout raised above the 5s default for heavy render load.
vi.setConfig({ testTimeout: 15_000 })

// Engine entry: retry-exhausted, server-stamped source/remote audit fields.
// Ingress entry: channel-full drop — attempts stays 0 and the rejecting
// transport is named; driver/tag/failed_at collide with the engine entry.
const { ENGINE_DL, INGRESS_DL } = vi.hoisted(() => ({
  ENGINE_DL: {
    command: {
      driver: 'plc1',
      device: 'meter-01',
      tag: 'pump',
      value: true,
      type: 'bool' as const,
      // Stamped by the server on the original write — must NOT be re-sent.
      source: 'api',
      remote: '192.168.1.10:51424',
    },
    error: 'driver disconnected',
    failed_at: '2026-01-01T00:00:00Z',
    attempts: 3,
  },
  INGRESS_DL: {
    command: {
      driver: 'plc1',
      device: 'meter-01',
      tag: 'pump',
      value: true,
      type: 'bool' as const,
    },
    error: 'ingress command channel full',
    failed_at: '2026-01-01T00:00:00Z',
    attempts: 0,
    transport: 'mqtt-out',
  },
}))

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
  getDeadLetters: vi.fn().mockResolvedValue({ failed_writes: [ENGINE_DL], count: 1 }),
  writeTag: vi.fn(),
}))

import { MemoryRouter, useSearchParams } from 'react-router-dom'
import * as api from '@/api/endpoints'

// Renders the live ?source= param so tests can assert URL sync on toggle.
function UrlProbe() {
  const [params] = useSearchParams()
  return <div data-testid="url-probe">{params.get('source') ?? ''}</div>
}

function renderPage(initialPath = '/admin/write') {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false },
      mutations: { retry: false },
    },
  })
  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialPath]}>
        <WriteControlPage />
        <UrlProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { ...utils, qc }
}

// Per-source endpoint behaviour: ingress drops vs engine retries.
function mockPerSourceDeadLetters() {
  vi.mocked(api.getDeadLetters).mockImplementation(async (source) =>
    source === 'ingress'
      ? { failed_writes: [INGRESS_DL], count: 1 }
      : { failed_writes: [ENGINE_DL], count: 1 },
  )
}

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  vi.mocked(api.getDeadLetters).mockResolvedValue({ failed_writes: [ENGINE_DL], count: 1 })
})

// vitest runs without globals:true — @testing-library/react's auto-cleanup
// never registers; clean the DOM explicitly between tests.
afterEach(() => {
  cleanup()
})

describe('WriteControlPage dead-letter replay gate', () => {
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
    expect(screen.getAllByText('Retries exhausted: 3').length).toBe(2)
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

describe('WriteControlPage dead-letter queue source', () => {
  it('defaults to the engine source: no ?source= param, retry-exhausted entry rendered', async () => {
    const { qc } = renderPage()

    expect(await screen.findByText('[plc1] Tag: pump = true (bool)')).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Engine retries' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: 'Ingress drops' }).getAttribute('aria-pressed')).toBe(
      'false',
    )
    expect(api.getDeadLetters).toHaveBeenCalledWith(undefined)
    expect(api.getDeadLetters).not.toHaveBeenCalledWith('ingress')
    expect(qc.getQueryState(['deadLetters', 'engine'])?.status).toBe('success')
    expect(screen.getByTestId('url-probe').textContent).toBe('')
    // Engine entry shows retries, not an ingress annotation.
    expect(screen.getByText('Retries exhausted: 3')).toBeTruthy()
    expect(screen.queryByText(/Ingress drop ·/)).toBeNull()
  })

  it('?source=ingress deep link activates the ingress queue', async () => {
    mockPerSourceDeadLetters()
    const { qc } = renderPage('/admin/write?source=ingress')

    expect(screen.getByRole('button', { name: 'Ingress drops' }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(
      screen.getByText(/dropped when a transport's ingress command channel was full/),
    ).toBeTruthy()
    await waitFor(() => expect(api.getDeadLetters).toHaveBeenCalledWith('ingress'))
    expect(qc.getQueryState(['deadLetters', 'ingress'])?.status).toBe('success')
    // The ingress entry names its transport instead of retry counts.
    expect(await screen.findByText('Ingress drop · mqtt-out')).toBeTruthy()
    expect(screen.queryByText(/Retries exhausted/)).toBeNull()
  })

  it('toggle switches the query source and syncs ?source= in the URL', async () => {
    mockPerSourceDeadLetters()
    const { qc } = renderPage()

    expect(await screen.findByText('Retries exhausted: 3')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ingress drops' }))
    })
    await waitFor(() => expect(api.getDeadLetters).toHaveBeenCalledWith('ingress'))
    expect(qc.getQueryState(['deadLetters', 'ingress'])?.status).toBe('success')
    expect(screen.getByTestId('url-probe').textContent).toBe('ingress')
    expect(await screen.findByText('Ingress drop · mqtt-out')).toBeTruthy()

    // Back to engine: same collision-prone entry renders again from its own cache.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Engine retries' }))
    })
    expect(screen.getByTestId('url-probe').textContent).toBe('engine')
    expect(await screen.findByText('Retries exhausted: 3')).toBeTruthy()
    expect(screen.queryByText(/Ingress drop ·/)).toBeNull()
  })

  it('ingress replay stages the same two-step gate and sends the clean engine command', async () => {
    mockPerSourceDeadLetters()
    vi.mocked(api.writeTag).mockResolvedValue({ success: true })
    renderPage('/admin/write?source=ingress')

    expect(await screen.findByText('[plc1] Tag: pump = true (bool)')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Replay Command' }))
    })

    expect(await screen.findByText('Confirm Write Command')).toBeTruthy()
    expect(
      screen.getByText(/This command previously failed \(ingress command channel full\)/),
    ).toBeTruthy()
    // The dialog labels the ingress origin, not "Retries exhausted: 0"
    // (row badge + dialog context both carry the annotation).
    expect(screen.getAllByText('Ingress drop · mqtt-out').length).toBe(2)
    expect(screen.queryByText(/Retries exhausted/)).toBeNull()
    expect(api.writeTag).not.toHaveBeenCalled()

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

  it('cleared keys are per-source: clearing ingress leaves the colliding engine entry visible', async () => {
    mockPerSourceDeadLetters()
    renderPage('/admin/write?source=ingress')

    expect(await screen.findByText('Ingress drop · mqtt-out')).toBeTruthy()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Clear All' }))
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    })
    await waitFor(() => expect(screen.queryByText('[plc1] Tag: pump = true (bool)')).toBeNull())

    // Same driver/tag/failed_at in the engine queue stays visible.
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Engine retries' }))
    })
    expect(await screen.findByText('[plc1] Tag: pump = true (bool)')).toBeTruthy()
    expect(screen.getByText('Retries exhausted: 3')).toBeTruthy()
  })
})
