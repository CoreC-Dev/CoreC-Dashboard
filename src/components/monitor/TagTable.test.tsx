// @vitest-environment jsdom
// TagTable — B06: the header must expose the new device column between
// driver and group, using the shared COLS widths. B22: the empty state
// distinguishes "no tags on this instance yet" (guidance) from "filters
// matched nothing" (one-click clear). Rows themselves are covered by
// TagRow.test; the virtualizer stays unexercised here (jsdom has no
// layout), so we assert the sticky header structure. i18n in English.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
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

function renderTable(over: Partial<Parameters<typeof TagTable>[0]> = {}) {
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
      hasActiveFilters={false}
      onClearFilters={noop}
      {...over}
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

  it('hides the group and type columns below md and lifts the 860px floor (B24)', () => {
    const { container } = renderTable()
    const table = container.querySelector('table')
    expect(table?.className).toContain('min-w-0')
    expect(table?.className).toContain('md:min-w-[860px]')
    // The 860px floor is md-only — no bare min-w-[860px] class remains.
    expect(table?.classList.contains('min-w-[860px]')).toBe(false)

    const headers = Array.from(container.querySelectorAll('thead th'))
    const groupTh = headers.find((th) => th.textContent === 'Group')
    const typeTh = headers.find((th) => th.textContent === 'Type')
    expect(groupTh?.className).toContain('hidden md:block')
    expect(typeTh?.className).toContain('hidden md:block')
    // The tag column absorbs the freed width on narrow screens.
    const tagTh = headers.find((th) => th.textContent === 'Tag Name')
    expect(tagTh?.className).toContain('max-md:flex-1')
    // The critical columns stay visible at every width (exact class match —
    // 'overflow-hidden' must not false-positive).
    for (const label of ['Value', 'Quality', 'Timestamp', 'Actions']) {
      const th = headers.find((h) => h.textContent === label)
      expect(th?.classList.contains('hidden')).toBe(false)
    }
  })

  it('keeps the no-points empty state between the header and the virtual body', () => {
    renderTable()
    expect(screen.getByText(/No tags yet/)).toBeTruthy()
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
        hasActiveFilters={false}
        onClearFilters={noop}
      />,
    )
    expect(screen.getByText(/No tags yet/)).toBeTruthy()
  })
})

describe('TagTable — two honest empty states (B22)', () => {
  it('an unfiltered zero-tag instance shows setup guidance, not a filter complaint', () => {
    renderTable({ hasActiveFilters: false })

    expect(
      screen.getByText('No tags yet. Check that a driver is connected and tags are configured.'),
    ).toBeTruthy()
    // The old copy blamed filters the operator never set.
    expect(screen.queryByText(/matching current filter/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull()
  })

  it('a filter that matched nothing offers the one-click clear', () => {
    const onClearFilters = vi.fn()
    renderTable({ hasActiveFilters: true, onClearFilters })

    expect(screen.getByText('No tags match your filters')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })
})
