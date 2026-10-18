// @vitest-environment jsdom
// TagTrendPanel (B08) — the pause indicator carries the expectation-management
// copy, and gap samples (whitespace markers) stay out of the stats bar, the
// sample count, and the CSV export. useTrendChart is mocked (jsdom has no
// canvas); i18n in English.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { TagTrendPanel } from '@/components/monitor/TagTrendPanel'
import i18n from '@/i18n'
import type { DataPoint } from '@/types/models'

vi.mock('@/hooks/useTrendChart', () => ({
  useTrendChart: () => ({ chartContainerRef: { current: null } }),
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
