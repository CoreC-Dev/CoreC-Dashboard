// @vitest-environment jsdom
// Behavior: the diagnostics page's six stacked sections get an
// in-page table of contents (jump chips), and the pprof developer tools
// fold into a collapsed "Advanced debugging" section so the operator's
// page ends at the write history.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DiagnosticsPage } from '@/features/admin/DiagnosticsPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

vi.setConfig({ testTimeout: 15_000 })

vi.mock('@/api/endpoints', () => ({
  getMetricsText: vi.fn().mockResolvedValue('corec_goroutines 42\n'),
  getWriteHistory: vi.fn().mockResolvedValue({ writes: [], count: 0 }),
  getVersion: vi.fn().mockResolvedValue({ version: '0.9.2-mock' }),
  getHealthzLive: vi.fn().mockResolvedValue({ status: 'alive' }),
  getHealthzReady: vi.fn().mockResolvedValue({ ready: true }),
  getConfigsRaw: vi.fn().mockResolvedValue('drivers: []\n'),
}))

// The xterm terminal and the /logs socket cannot run under jsdom — same
// inert stubs as the render-smoke suite.
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    open = vi.fn()
    loadAddon = vi.fn()
    writeln = vi.fn()
    clear = vi.fn()
    dispose = vi.fn()
  },
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit = vi.fn()
    dispose = vi.fn()
  },
}))
vi.mock('@/api/websocket', () => ({
  CoreCWebSocket: class {
    destroy = vi.fn()
  },
}))

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, refetchInterval: false, staleTime: Infinity } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DiagnosticsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
  // jsdom has no scrollIntoView; stub it to observe chip jumps.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  cleanup()
})

describe('diagnostics page IA', () => {
  it('renders one jump chip per section, in reading order', async () => {
    renderPage()

    const chips = await screen.findAllByTestId('section-anchor-nav')
    expect(chips).toHaveLength(1)
    for (const label of [
      'Health',
      'Live streams',
      'Event terminal',
      'Metrics',
      'Write history',
      'Advanced debugging',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }

    // Every chip has a real scroll target in the DOM.
    for (const id of [
      'diagnostics-health',
      'diagnostics-streams',
      'diagnostics-terminal',
      'diagnostics-metrics',
      'diagnostics-writes',
      'diagnostics-advanced',
    ]) {
      expect(document.getElementById(id)).toBeTruthy()
    }
  })

  it('chips scroll to their section (never href-hash, HashRouter-safe)', async () => {
    renderPage()
    await screen.findByTestId('section-anchor-nav')

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Metrics' }))
    })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Write history' }))
    })
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('pprof is folded by default and expands on demand', async () => {
    renderPage()

    expect(await screen.findByText('Advanced debugging (pprof) (developers)')).toBeTruthy()
    expect(screen.queryByText('/debug/pprof/heap')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Toggle advanced debugging section' }))
    })
    expect(screen.getByText('/debug/pprof/heap')).toBeTruthy()
    expect(screen.getByText('/debug/pprof/mutex')).toBeTruthy()
  })

  it('a ?section= deep link lands on that section (write-history hop)', async () => {
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false, refetchInterval: false, staleTime: Infinity } },
    })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/admin/diagnostics?section=writes']}>
          <DiagnosticsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await screen.findByTestId('section-anchor-nav')
    // The write-history deep link (WriteControlPage's "view write history")
    // scrolled the page to the writes section, not the top.
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: 'smooth' }),
    )
  })
})
