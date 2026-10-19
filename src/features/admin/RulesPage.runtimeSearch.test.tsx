// @vitest-environment jsdom
// C-B6 regression: the runtime rules table is searchable (name/match/
// target) and its priority header toggles the sort direction — finding one
// tag's rule among hundreds used to need browser Ctrl+F.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { RulesPage } from '@/features/admin/RulesPage'
import i18n from '@/i18n'
import { useConnectionStore } from '@/stores/connectionStore'

vi.setConfig({ testTimeout: 15_000 })

// Seven live rules — enough to cross the >6 threshold that reveals the
// runtime search bar. Built inside the factory (vi.mock hoists above
// top-level consts).
vi.mock('@/api/endpoints', () => {
  const rules = Array.from({ length: 7 }, (_, i) => ({
    index: i,
    name: `rule-${i}`,
    type: 'forward',
    match: i === 0 ? 'ALL' : `tag == "temp-${i}"`,
    action: 'forward',
    target: 'webhook-in',
    priority: 40 + i * 10,
    disabled: false,
    hit_count: 0,
    miss_count: 0,
    hit_at: '0001-01-01T00:00:00Z',
    miss_at: '0001-01-01T00:00:00Z',
    matched: 0,
    fired: 0,
  }))
  return {
    getRules: vi.fn().mockResolvedValue({ rules }),
    getConfigsRaw: vi.fn().mockResolvedValue('rules: []\n'),
    updateConfigs: vi.fn().mockResolvedValue(undefined),
  }
})

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
})

afterEach(() => {
  cleanup()
})

describe('RulesPage runtime search & priority sort (C-B6)', () => {
  it('search narrows the runtime table by match text and target', async () => {
    render(wrap(<RulesPage />))

    // All seven rows render once the runtime query resolves.
    expect(await screen.findByText('rule-3')).toBeTruthy()
    expect(screen.getByText('rule-6')).toBeTruthy()

    // Type a match fragment → only the matching rows remain.
    const search = screen.getByPlaceholderText('Search runtime rules (name/match/target)…')
    await act(async () => {
      fireEvent.change(search, { target: { value: 'temp-3' } })
    })
    expect(screen.getByText('rule-3')).toBeTruthy()
    expect(screen.queryByText('rule-6')).toBeNull()

    // The target is searchable too (the match text stays but the target
    // narrows nothing here — use a distinct term to prove the extra field).
    await act(async () => {
      fireEvent.change(search, { target: { value: 'webhook-in' } })
    })
    expect(screen.getByText('rule-0')).toBeTruthy()

    // Gibberish shows the no-results state, not a blank card.
    await act(async () => {
      fireEvent.change(search, { target: { value: 'no-such-rule' } })
    })
    expect(screen.getByText(/No results for "no-such-rule"/)).toBeTruthy()
    expect(screen.queryByText('rule-0')).toBeNull()
  })

  it('the priority header toggles between ascending and descending order', async () => {
    render(wrap(<RulesPage />))
    await screen.findByText('rule-0')

    const sortButton = screen.getByRole('button', { name: /Sort by priority/ })
    const firstRow = () => document.querySelector('tbody tr')?.textContent ?? ''
    // Server order is priority-ascending (#40 → #100): rule-0 first.
    expect(firstRow()).toContain('rule-0')

    await act(async () => {
      fireEvent.click(sortButton)
    })
    // Descending: rule-6 (#100) jumps to the top.
    expect(firstRow()).toContain('rule-6')

    await act(async () => {
      fireEvent.click(sortButton)
    })
    expect(firstRow()).toContain('rule-0')
  })
})
