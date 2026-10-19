// @vitest-environment jsdom
// TagRow — pure presentational row for the virtualized tag table. B06: the
// device cell must render the sub-device (or '-') so same-name tags on
// different devices are distinguishable. i18n forced to English.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TagRow } from '@/components/monitor/TagRow'
import i18n from '@/i18n'
import { COLS } from '@/lib/tagExplorer'
import type { DataPoint } from '@/types/models'

const point = (over: Partial<DataPoint> = {}): DataPoint => ({
  driver: 'plc1',
  device: 'meter-01',
  group: 'line3',
  tag: 'temperature',
  value: 42.5,
  type: 'float32',
  quality: 0,
  timestamp: '2026-01-01T12:00:00Z',
  ...over,
})

const noop = () => {}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
})

describe('TagRow — device column (B06)', () => {
  it('renders the sub-device in the dedicated device cell', () => {
    render(
      <table>
        <tbody>
          <TagRow point={point()} start={0} flashTick={0} onOpen={noop} onWrite={noop} />
        </tbody>
      </table>,
    )

    expect(screen.getByText('meter-01')).toBeTruthy()
    // Neighboring identity cells still render.
    expect(screen.getByText('plc1')).toBeTruthy()
    expect(screen.getByText('temperature')).toBeTruthy()
  })

  it("falls back to '-' when the tag has no sub-device (single-device drivers)", () => {
    render(
      <table>
        <tbody>
          <TagRow
            point={point({ device: undefined })}
            start={0}
            flashTick={0}
            onOpen={noop}
            onWrite={noop}
          />
        </tbody>
      </table>,
    )

    expect(screen.getByText('-')).toBeTruthy()
  })

  it('uses the shared COLS.device width so header and cells stay aligned', () => {
    const { container } = render(
      <table>
        <tbody>
          <TagRow point={point()} start={0} flashTick={0} onOpen={noop} onWrite={noop} />
        </tbody>
      </table>,
    )
    const cells = container.querySelectorAll('td')
    expect(cells).toHaveLength(9)
    expect(cells[2].getAttribute('style')).toContain(COLS.device)
  })
})

describe('TagRow — honest timestamps (B15)', () => {
  // Pin the clock: the point timestamp and the expected title are both
  // derived from Date.now(); without freezing it, a second boundary between
  // the two evaluations flipped the assertion ~1/1177 runs (A-domain
  // flake report). Frozen now ⇒ both sides compute the same instant.
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T08:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const row = (over: Partial<DataPoint> = {}) =>
    render(
      <table>
        <tbody>
          <TagRow point={point(over)} start={0} flashTick={0} onOpen={noop} onWrite={noop} />
        </tbody>
      </table>,
    )

  it('renders a relative age for a minutes-old value instead of a bare clock time', () => {
    row({ timestamp: new Date(Date.now() - 3 * 60_000).toISOString() })
    const cell = screen.getByText('3m ago')
    // The full date-time rides along for the hover tooltip.
    expect(cell.getAttribute('title')).toBe(new Date(Date.now() - 3 * 60_000).toLocaleString())
  })

  it('dims the timestamp cell past the 5-minute horizon', () => {
    row({ timestamp: new Date(Date.now() - 10 * 60_000).toISOString() })
    const cell = screen.getByText('10m ago')
    expect(cell.className).toContain('opacity-60')
  })

  it('a sub-minute-fresh value reads "just now" and stays fully opaque', () => {
    row({ timestamp: new Date(Date.now() - 5_000).toISOString() })
    const cell = screen.getByText('just now')
    expect(cell.className).not.toContain('opacity-60')
  })
})

describe('TagRow — narrow-screen columns (B24)', () => {
  it('hides the group and type cells below md, matching the header', () => {
    const { container } = render(
      <table>
        <tbody>
          <TagRow point={point()} start={0} flashTick={0} onOpen={noop} onWrite={noop} />
        </tbody>
      </table>,
    )
    const cells = Array.from(container.querySelectorAll('td'))
    // group is the 4th cell, type the 6th (tag/driver/device/group/value/type…)
    expect(cells[3].className).toContain('hidden md:block')
    expect(cells[5].className).toContain('hidden md:block')
    // The tag cell flexes to absorb the freed width on narrow screens.
    expect(cells[0].className).toContain('max-md:flex-1')
    // Value / quality / timestamp / actions stay visible at every width
    // (exact class match — 'overflow-hidden' must not false-positive).
    for (const idx of [4, 6, 7, 8]) {
      expect(cells[idx].classList.contains('hidden')).toBe(false)
    }
  })
})

describe('TagRow — direction is information, not an alarm color (B25)', () => {
  // jsdom ships no Web Animations API — stub el.animate so the flash
  // effect runs its real state logic without the actual tween.
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'animate', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({ cancel: vi.fn() }),
    })
  })

  const renderRow = (value: number, tick: number) =>
    render(
      <table>
        <tbody>
          <TagRow
            point={point({ value })}
            start={0}
            flashTick={tick}
            onOpen={noop}
            onWrite={noop}
          />
        </tbody>
      </table>,
    )

  it('a FALLING value flashes neutral primary and shows ▼ — never red', () => {
    const view = renderRow(50, 1)
    // First flash has no previous value → no direction yet.
    expect(screen.queryByText('▼')).toBeNull()

    view.rerender(
      <table>
        <tbody>
          <TagRow
            point={point({ value: 40 })}
            start={0}
            flashTick={2}
            onOpen={noop}
            onWrite={noop}
          />
        </tbody>
      </table>,
    )

    expect(screen.getByText('▼')).toBeTruthy()
    const overlay = view.container.querySelector('div.pointer-events-none')
    // Neutral tint for both directions — red stays reserved for bad
    // quality/errors, green for healthy status.
    expect(overlay?.className).toContain('bg-primary/10')
    expect(overlay?.className).not.toContain('bg-status-error')
    expect(overlay?.className).not.toContain('bg-status-running')
  })

  it('a RISING value shows ▲ with the same neutral flash', () => {
    const view = renderRow(10, 1)

    view.rerender(
      <table>
        <tbody>
          <TagRow
            point={point({ value: 12.5 })}
            start={0}
            flashTick={2}
            onOpen={noop}
            onWrite={noop}
          />
        </tbody>
      </table>,
    )

    expect(screen.getByText('▲')).toBeTruthy()
    const overlay = view.container.querySelector('div.pointer-events-none')
    expect(overlay?.className).toContain('bg-primary/10')
    expect(overlay?.className).not.toContain('bg-status-running')
  })

  it('a quality-error badge keeps its red — the direction arrow does not steal it', () => {
    const view = renderRow(10, 1)
    view.rerender(
      <table>
        <tbody>
          <TagRow
            point={point({ value: 3, quality: 1 })}
            start={0}
            flashTick={2}
            onOpen={noop}
            onWrite={noop}
          />
        </tbody>
      </table>,
    )

    // Bad quality still reads red (QualityLabel color), the ▼ arrow reads
    // primary — the two semantics no longer share a palette.
    expect(screen.getByText('▼').className).toContain('text-primary')
  })
})
