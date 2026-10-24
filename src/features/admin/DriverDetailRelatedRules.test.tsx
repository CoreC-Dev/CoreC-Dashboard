// @vitest-environment jsdom
// Regression: the driver detail page lists the rules that consume
// the driver's data (match-DSL scan over the saved config) with a link per
// rule — the "which rules break if I touch this driver?" question used to
// require opening every rule on the rules page. Also pins the
// truncated-tag-count note as a real deep link into the pre-filtered Tag Explorer.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DriverDetailPage } from '@/features/admin/DriverDetailPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

vi.setConfig({ testTimeout: 15_000 })

// 201 registered tags — enough to trip the 200-row render cap so the
// truncation note (and its Tag Explorer link) is on screen. Built inside the
// vi.mock factory (vi.mock hoists above top-level consts).
vi.mock('@/api/endpoints', () => {
  const manyTags = Object.fromEntries(
    Array.from({ length: 201 }, (_, i) => [
      `tag-${i}`,
      {
        tag: `tag-${i}`,
        value: i,
        type: 'float32',
        quality: 0,
        timestamp: '2026-10-19T00:00:00Z',
        is_stale: false,
      },
    ]),
  )
  return {
    getDriver: vi.fn().mockResolvedValue({
      name: 'plc1',
      type: 'modbus-tcp',
      state: 2,
      last_read: '0001-01-01T00:00:00Z',
      last_error: '',
      tag_count: 201,
      read_count: 10,
      error_count: 0,
      reconnect_count: 0,
    }),
    getDriverTags: vi.fn().mockResolvedValue({ tags: manyTags }),
    getConfigsRaw: vi
      .fn()
      .mockResolvedValue(
        [
          'drivers:',
          '  - name: plc1',
          '    type: modbus-tcp',
          '    settings:',
          '      host: 10.0.0.1',
          '    tags:',
          '      - name: temperature',
          "        address: '40001'",
          '        type: float32',
          'rules:',
          '  - name: alert-hot',
          '    match: \'driver == "plc1" && value > 80\'',
          '    action: alert',
          '    priority: 10',
          '  - name: fwd-all',
          '    match: ALL',
          '    action: forward',
          '    priority: 100',
        ].join('\n'),
      ),
    updateConfigs: vi.fn().mockResolvedValue(undefined),
  }
})

function renderAt(element: React.ReactElement, path: string, routePath: string) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchInterval: false },
      mutations: { retry: false },
    },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={routePath} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeAll(async () => {
  useConnectionStore.getState().setConnected(true)
  await i18n.changeLanguage('en')
})

// vitest runs without globals:true, so @testing-library/react's auto-cleanup
// never registers — clean up the DOM explicitly between tests.
afterEach(() => {
  cleanup()
})

describe('driver detail page — related rules & tag-explorer deep link', () => {
  it('lists rules consuming the driver, each linking to the rules page', async () => {
    renderAt(<DriverDetailPage />, '/corec/i1/admin/drivers/plc1', '/corec/:id/admin/drivers/:name')

    // The related-rules card counts only the rule whose match DSL points
    // at plc1; the catch-all forwarder is not listed.
    expect(await screen.findByText('Related rules (1)')).toBeTruthy()
    expect(screen.getByText('Rules consuming this driver')).toBeTruthy()

    // The rule chip is a link into the rules page and shows the action.
    const chip = screen.getByRole('link', { name: /alert-hot/ })
    expect(chip).toBeTruthy()
    expect(chip.getAttribute('href')).toBe('/corec/i1/admin/rules')
    expect(screen.queryByText(/fwd-all/)).toBeNull()
  })

  it('says so when no rule consumes the driver', async () => {
    // Serve a config without the driver-referencing rule for the whole
    // test (mockResolvedValue, not Once — the query may fetch again and a
    // transient loading state must not shadow the settled one).
    const { getConfigsRaw } = await import('@/api/endpoints')
    vi.mocked(getConfigsRaw).mockResolvedValue(
      [
        'drivers:',
        '  - name: plc1',
        '    type: modbus-tcp',
        '    tags:',
        '      - name: temperature',
        "        address: '40001'",
        '        type: float32',
        'rules: []',
      ].join('\n'),
    )

    renderAt(<DriverDetailPage />, '/corec/i1/admin/drivers/plc1', '/corec/:id/admin/drivers/:name')

    expect(await screen.findByText('Related rules (0)')).toBeTruthy()
    expect(screen.getByText("No rules consume this driver's data")).toBeTruthy()
    expect(screen.queryByRole('link', { name: /alert-hot/ })).toBeNull()
  })

  it('truncation note deep-links into the tag explorer pre-filtered to the driver', async () => {
    renderAt(<DriverDetailPage />, '/corec/i1/admin/drivers/plc1', '/corec/:id/admin/drivers/:name')

    const link = await screen.findByRole('link', {
      name: /Open Tag Explorer for all 201/,
    })
    expect(link.getAttribute('href')).toBe('/corec/i1/monitor/tags?driver=plc1')
  })
})
