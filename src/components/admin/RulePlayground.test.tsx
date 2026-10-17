// @vitest-environment jsdom
// Component-level test for the RuleWizard's Playground (RulePlayground).
// The endpoint layer is mocked (real hook wiring: useRulesPreview →
// postRulesPreview); i18n is forced to English for deterministic content
// assertions.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { RulePlayground } from '@/components/admin/RulePlayground'
import i18n from '@/i18n'
import type { RulesPreviewResult } from '@/types/api'

vi.mock('@/api/endpoints', () => ({
  postRulesPreview: vi.fn(),
}))

import * as api from '@/api/endpoints'

const DEFAULTS = {
  driver: 'plc1',
  tag: 'temperature',
  value: '96.5',
  type: 'float64' as const,
  quality: 0,
}

const evaluated = (matched: boolean): RulesPreviewResult => ({
  outcome: 'evaluated',
  matched,
})

const compileError: RulesPreviewResult = {
  outcome: 'error',
  status: 400,
  error:
    'failed to create rule preview: invalid match expression "tag ==": unexpected token EOF (1:6)',
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

/** The point the component is expected to build from the default form. */
function expectedPoint() {
  return {
    driver: 'plc1',
    device: '',
    group: '',
    tag: 'temperature',
    value: 96.5,
    type: 'float64',
    quality: 0,
    timestamp: expect.any(String),
  }
}

async function openPlayground() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Playground/ }))
  })
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

// Suite timeout raised from the 5s default: each test renders two Radix
// Selects, which is expensive under jsdom (first test pays the environment
// warm-up: 1.2–3.3s in isolation). In the full 40-file suite on this loaded
// 2-core runner, two tests intermittently exceeded the 5s default while
// passing 10/10 in isolation (twice) — same conditions as the InstanceDialog
// flake recorded in 1da217b.
describe('RulePlayground', { timeout: 15_000 }, () => {
  it('renders collapsed and expands the sample point form with defaults', async () => {
    renderWithClient(<RulePlayground match="value > 90" defaults={DEFAULTS} />)

    // Collapsed: the mini form is hidden.
    expect(screen.queryByDisplayValue('96.5')).toBeNull()

    await openPlayground()

    expect(screen.getByDisplayValue('plc1')).toBeTruthy()
    expect(screen.getByDisplayValue('temperature')).toBeTruthy()
    expect(screen.getByDisplayValue('96.5')).toBeTruthy()
    expect(screen.getByText('float64')).toBeTruthy()
    expect(screen.getByText('Good')).toBeTruthy()
  })

  it('previews the current match against the built sample point and shows a hit', async () => {
    vi.mocked(api.postRulesPreview).mockResolvedValue(evaluated(true))
    renderWithClient(<RulePlayground match="value > 90" defaults={DEFAULTS} />)
    await openPlayground()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    })

    expect(api.postRulesPreview).toHaveBeenCalledWith('value > 90', expectedPoint())
    expect(await screen.findByText('Matched')).toBeTruthy()
  })

  it('shows a miss as a plain result (not an error)', async () => {
    vi.mocked(api.postRulesPreview).mockResolvedValue(evaluated(false))
    renderWithClient(<RulePlayground match="value > 900" defaults={DEFAULTS} />)
    await openPlayground()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    })

    expect(await screen.findByText('Not matched')).toBeTruthy()
  })

  it('shows compile errors verbatim next to the editor (400)', async () => {
    vi.mocked(api.postRulesPreview).mockResolvedValue(compileError)
    renderWithClient(<RulePlayground match="tag ==" defaults={DEFAULTS} />)
    await openPlayground()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    })

    expect(await screen.findByText('Preview failed')).toBeTruthy()
    expect(screen.getByText(/failed to create rule preview: invalid match expression/)).toBeTruthy()
  })

  it('shows the unsupported-engine message for a 501', async () => {
    vi.mocked(api.postRulesPreview).mockResolvedValue({
      outcome: 'error',
      status: 501,
      error: 'rule preview not supported by this engine',
    })
    renderWithClient(<RulePlayground match="ALL" defaults={DEFAULTS} />)
    await openPlayground()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    })

    expect(await screen.findByText('Rule preview is not supported by this engine')).toBeTruthy()
    expect(screen.getByText('rule preview not supported by this engine')).toBeTruthy()
  })

  it('disables the run button when the match expression is empty', async () => {
    renderWithClient(<RulePlayground match="   " defaults={DEFAULTS} />)
    await openPlayground()

    const runBtn = screen.getByRole('button', { name: 'Preview' })
    expect(runBtn).toBeDisabled()
    expect(screen.getByText('Enter a match expression to run a preview.')).toBeTruthy()
    expect(api.postRulesPreview).not.toHaveBeenCalled()
  })

  it('disables the run button while a preview is in flight', async () => {
    let resolvePreview: (v: RulesPreviewResult) => void = () => {}
    vi.mocked(api.postRulesPreview).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve
        }),
    )
    renderWithClient(<RulePlayground match="value > 90" defaults={DEFAULTS} />)
    await openPlayground()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    })

    const pendingBtn = screen.getByRole('button', { name: 'Preview' })
    expect(pendingBtn).toBeDisabled()
    fireEvent.click(pendingBtn)
    expect(api.postRulesPreview).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolvePreview(evaluated(true))
    })
    expect(await screen.findByText('Matched')).toBeTruthy()
  })

  it('sends a non-numeric sample value as a string', async () => {
    vi.mocked(api.postRulesPreview).mockResolvedValue(evaluated(true))
    renderWithClient(<RulePlayground match="tag contains 'temp'" defaults={DEFAULTS} />)
    await openPlayground()

    fireEvent.change(screen.getByDisplayValue('96.5'), { target: { value: 'hot' } })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    })

    const call = vi.mocked(api.postRulesPreview).mock.calls[0]
    expect(call[0]).toBe("tag contains 'temp'")
    expect(call[1]?.value).toBe('hot')
  })

  it('shows a transport failure without throwing', async () => {
    vi.mocked(api.postRulesPreview).mockRejectedValue(new Error('network unreachable'))
    renderWithClient(<RulePlayground match="value > 90" defaults={DEFAULTS} />)
    await openPlayground()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    })

    expect(await screen.findByText('Preview failed')).toBeTruthy()
    expect(screen.getByText('network unreachable')).toBeTruthy()
  })

  it('hides the previous verdict once the match expression changes (stale guard)', async () => {
    vi.mocked(api.postRulesPreview).mockResolvedValue(evaluated(true))
    const { rerenderEl } = renderWithClient(
      <RulePlayground match="value > 90" defaults={DEFAULTS} />,
    )
    await openPlayground()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    })
    expect(await screen.findByText('Matched')).toBeTruthy()

    // The verdict described the OLD expression — editing it must hide it.
    rerenderEl(<RulePlayground match="value > 99" defaults={DEFAULTS} />)
    expect(screen.queryByText('Matched')).toBeNull()
  })
})
