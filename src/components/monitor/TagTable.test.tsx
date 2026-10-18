// @vitest-environment jsdom
// TagTable — B06: the header must expose the new device column between
// driver and group, using the shared COLS widths. Rows themselves are
// covered by TagRow.test; the virtualizer stays unexercised here (jsdom has
// no layout), so we assert the sticky header structure. i18n in English.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { TagTable } from '@/components/monitor/TagTable'
import i18n from '@/i18n'
import { COLS } from '@/lib/tagExplorer'
import type { DataPoint } from '@/types/models'

const noop = () => {}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
})

function renderTable() {
  return render(
    <TagTable
      filteredTags={[]}
      flashTick={{}}
      onOpen={noop}
      onWrite={noop}
      sortKey={null}
      sortDir="asc"
      onToggleSort={noop}
      showLoading={false}
      showError={false}
      error={null}
      isFetching={false}
      onRetry={noop}
    />,
  )
}

describe('TagTable — device column header (B06)', () => {
  it('renders a Device column between Driver and Group', () => {
    const { container } = renderTable()

    const headers = Array.from(container.querySelectorAll('thead th')).map((th) => th.textContent)
    // Tag name (button), Driver, Device, Group, Value, Type, Quality,
    // Timestamp (button), Actions.
    expect(headers).toEqual([
      'Tag Name',
      'Driver',
      'Device',
      'Group',
      'Value',
      'Type',
      'Quality',
      'Timestamp',
      'Actions',
    ])
    expect(screen.getByText('Device')).toBeTruthy()
  })

  it('gives the device header the shared COLS.device width', () => {
    const { container } = renderTable()
    const headers = container.querySelectorAll('thead th')
    const deviceTh = headers[2]
    expect(deviceTh.getAttribute('style')).toContain(COLS.device)
    // The percentage budget still sums to 100 across all columns.
    const widths = Array.from(headers).map((th) =>
      Number((th.getAttribute('style')?.match(/([\d.]+)%/) ?? ['0'])[1]),
    )
    expect(widths.reduce((a, b) => a + b, 0)).toBe(100)
  })

  it('keeps the no-points empty state between the header and the virtual body', () => {
    renderTable()
    expect(screen.getByText('No points found matching current filter')).toBeTruthy()
  })

  it('renders the DataPoint-typed table without type errors (compile-time guard)', () => {
    const pts: DataPoint[] = []
    render(
      <TagTable
        filteredTags={pts}
        flashTick={{}}
        onOpen={noop}
        onWrite={noop}
        sortKey={null}
        sortDir="asc"
        onToggleSort={noop}
        showLoading={false}
        showError={false}
        error={null}
        isFetching={false}
        onRetry={noop}
      />,
    )
    expect(screen.getByText('No points found matching current filter')).toBeTruthy()
  })
})
