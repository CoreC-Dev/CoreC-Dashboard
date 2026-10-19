// @vitest-environment jsdom
// TagTrendPanel (B08 + 待验证-1 + B21) — the pause indicator carries the
// expectation-management copy, gap samples (whitespace markers) stay out of
// the stats bar / count / CSV export, the Back-to-live button jumps the
// (mocked) chart to the live edge, and the exported CSV leads with the
// same-second aggregation note. useTrendChart is mocked (jsdom has no
// canvas); i18n in English.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TagTrendPanel } from '@/components/monitor/TagTrendPanel'
import i18n from '@/i18n'
import type { DataPoint } from '@/types/models'

// jsdom ships neither URL.createObjectURL nor anchor-click navigation —
// stub both so the CSV export can be intercepted and its Blob inspected.
const createObjectURL = vi.fn(() => 'blob:mock')
beforeAll(() => {
  Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  Object.defineProperty(HTMLAnchorElement.prototype, 'click', {
    value: vi.fn(),
    configurable: true,
  })
})

// Both the main and the fullscreen chart instances resolve to the same spy —
// each TagTrendPanel render calls the hook twice.
const scrollToLive = vi.fn()
vi.mock('@/hooks/useTrendChart', () => ({
  useTrendChart: () => ({ chartContainerRef: { current: null }, scrollToLive }),
}))

const TREND_TAG: DataPoint = {
  driver: 'plc1',
  device: 'meter-01',
  tag: 'temperature',
  value: 7,
  type: 'float32',
  quality: 0,
  timestamp: '2026-01-01T12:00:00Z',
}

function renderPanel(over: Partial<Parameters<typeof TagTrendPanel>[0]> = {}) {
  return render(
    <TagTrendPanel
      trendTag={TREND_TAG}
      trendLivePoint={TREND_TAG}
      trendSamples={[]}
      trendPaused={false}
      onTogglePause={() => {}}
      onClose={() => {}}
      {...over}
    />,
  )
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  scrollToLive.mockClear()
})

describe('TagTrendPanel — pause gap expectation (B08)', () => {
  it('shows the pause note that the paused period stays blank on resume', () => {
    renderPanel({ trendPaused: true })

    expect(screen.getByText('Paused — the paused period will be left blank on resume')).toBeTruthy()
    expect(screen.queryByText('Paused')).toBeNull() // old bare label is gone
  })

  it('shows no pause note while live', () => {
    renderPanel({ trendPaused: false })

    expect(screen.queryByText('Paused — the paused period will be left blank on resume')).toBeNull()
  })
})

describe('TagTrendPanel — gap samples excluded from stats and count (B08)', () => {
  it('counts and aggregates only valued samples; current is the last real value', () => {
    renderPanel({
      trendSamples: [
        { time: 10, value: 5 },
        { time: 11 }, // gap marker from a resume
        { time: 30, value: 7 },
      ],
    })

    // 2 valued samples, not 3 — the gap marker is not a sample.
    expect(screen.getByText('Live trend · last 2 / 100 samples')).toBeTruthy()
    expect(document.body.textContent).not.toContain('NaN')
    expect(document.body.textContent).not.toContain('undefined')
  })

  it('with only gap markers the count reads zero, stats vanish and CSV stays disabled', () => {
    renderPanel({ trendSamples: [{ time: 10 }] })

    // Honest zero count — a gap marker is not a sample.
    expect(screen.getByText('Live trend · last 0 / 100 samples')).toBeTruthy()
    expect(screen.queryByText('Current')).toBeNull()
    const csv = screen.getByRole('button', { name: 'Export CSV' })
    expect(csv).toBeDisabled()
  })
})

describe('TagTrendPanel — back to live (待验证-1)', () => {
  it('shows the Back to live button and wires it to the chart scroll', () => {
    renderPanel({ trendSamples: [{ time: 10, value: 1 }] })

    const btn = screen.getByRole('button', { name: 'Back to live' })
    expect(btn).toBeEnabled()
    act(() => {
      fireEvent.click(btn)
    })
    expect(scrollToLive).toHaveBeenCalled()
  })

  it('disables the jump while there are no valued samples yet', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: 'Back to live' })).toBeDisabled()
  })

  it('the fullscreen dialog carries its own Back to live control', () => {
    renderPanel({ trendSamples: [{ time: 10, value: 1 }] })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }))
    })
    const dialogBtn = screen.getAllByRole('button', { name: 'Back to live' })[0]
    act(() => {
      fireEvent.click(dialogBtn)
    })
    expect(scrollToLive).toHaveBeenCalled()
  })
})

describe('TagTrendPanel — CSV aggregation disclosure (B21)', () => {
  it('prepends the same-second merge note to the exported CSV', async () => {
    renderPanel({ trendSamples: [{ time: 10, value: 1.5 }] })

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }))
    })

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    const text = await blob.text()
    // The analyst must know same-second records were coalesced before the
    // data ever reaches their analysis tooling.
    expect(text.startsWith('# Same-second records merged (last value kept)\n')).toBe(true)
    expect(text).toContain('timestamp,datetime,value')
    expect(text).toContain('10,')
  })
})
