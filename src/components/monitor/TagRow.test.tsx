// @vitest-environment jsdom
// TagRow — pure presentational row for the virtualized tag table. B06: the
// device cell must render the sub-device (or '-') so same-name tags on
// different devices are distinguishable. i18n forced to English.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
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
