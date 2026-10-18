// @vitest-environment jsdom
// C-B3 regression: the runtime row's Test dialog evaluates through
// POST /rules/preview (the same scratch engine as the wizard's
// Playground) instead of the deleted client-side rough matcher — the
// two "test" affordances can no longer disagree, compile errors arrive
// verbatim, and a stale verdict hides when the sample point changes.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RuleTestDialog } from '@/components/admin/RuleParts'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import type { RulesPreviewResult } from '@/types/api'
import type { RuleStat } from '@/types/models'

vi.setConfig({ testTimeout: 15_000 })

vi.mock('@/api/endpoints', () => ({
  postRulesPreview: vi.fn(),
  getConfigsRaw: vi.fn().mockResolvedValue('drivers: []\n'),
}))

import * as api from '@/api/endpoints'

const RULE: RuleStat = {
  index: 0,
  name: 'alert-hot',
  type: 'simple',
  match: 'driver == "plc1" && value > 80',
  action: 'alert',
  target: 'notify-slack',
  targets: null,
  priority: 10,
  continue: false,
  disabled: false,
  hit_count: 0,
  hit_at: '0001-01-01T00:00:00Z',
  miss_count: 0,
  miss_at: '0001-01-01T00:00:00Z',
}

function renderDialog(rule: RuleStat | null = RULE) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <RuleTestDialog rule={rule} onClose={vi.fn()} />
    </QueryClientProvider>,
  )
}

const evaluated = (matched: boolean): RulesPreviewResult => ({ outcome: 'evaluated', matched })

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
  useConfigStore.setState({ workingConfig: null, savedConfig: null, seedStatus: 'ready' })
})

afterEach(() => {
  cleanup()
})

describe('RuleTestDialog — server scratch engine (C-B3)', () => {
  it('sends the sample point to POST /rules/preview and renders a hit', async () => {
    vi.mocked(api.postRulesPreview).mockResolvedValue(evaluated(true))
    renderDialog()

    expect(screen.getByText('Test Rule: alert-hot')).toBeTruthy()
    // Zero requests before the explicit run.
    expect(api.postRulesPreview).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run Test' }))
    })

    await waitFor(() => expect(api.postRulesPreview).toHaveBeenCalledTimes(1))
    const [match, point] = vi.mocked(api.postRulesPreview).mock.calls[0]
    expect(match).toBe('driver == "plc1" && value > 80')
    expect(point?.driver).toBe('')
    expect(point?.device).toBe('')
    expect(point?.value).toBe('')
    expect(point?.quality).toBe(0)

    expect(await screen.findByText('✓ MATCHED')).toBeTruthy()
    expect(screen.getByText('ALERT')).toBeTruthy() // action badge
    expect(screen.getByText(/Evaluated by the server's scratch engine/)).toBeTruthy()
  })

  it('renders a miss as a plain verdict, not an error', async () => {
    vi.mocked(api.postRulesPreview).mockResolvedValue(evaluated(false))
    renderDialog()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run Test' }))
    })
    expect(await screen.findByText('✗ NO MATCH')).toBeTruthy()
  })

  it('shows compile errors verbatim and hides the verdict once inputs change (stale guard)', async () => {
    vi.mocked(api.postRulesPreview).mockResolvedValue({
      outcome: 'error',
      status: 400,
      error: 'invalid match expression "tag ==": unexpected token EOF (1:6)',
    })
    renderDialog()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run Test' }))
    })
    expect(
      await screen.findByText(/invalid match expression "tag ==": unexpected token EOF/),
    ).toBeTruthy()

    // Editing the sample point after a run hides the previous verdict.
    const valueInput = screen.getByPlaceholderText('e.g. 42.5')
    await act(async () => {
      fireEvent.change(valueInput, { target: { value: '90' } })
    })
    expect(screen.queryByText(/unexpected token EOF/)).toBeNull()
  })

  it('the typed device travels with the sample point', async () => {
    vi.mocked(api.postRulesPreview).mockResolvedValue(evaluated(true))
    renderDialog()

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('e.g. meter-01'), {
        target: { value: 'meter-01' },
      })
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run Test' }))
    })

    const [, point] = vi.mocked(api.postRulesPreview).mock.calls[0]
    expect(point?.device).toBe('meter-01')
  })

  it('surfaces a transport failure without throwing', async () => {
    vi.mocked(api.postRulesPreview).mockRejectedValue(new Error('network unreachable'))
    renderDialog()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Run Test' }))
    })
    expect(await screen.findByText('network unreachable')).toBeTruthy()
  })
})
