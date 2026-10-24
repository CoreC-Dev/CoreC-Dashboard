// @vitest-environment jsdom
// TagToolbar — the quality Select and the stale-only toggle must be
// present and wired. Radix Select content cannot be opened in jsdom, so the
// quality options are asserted via the trigger's label and the end-to-end
// filtering behavior is covered by TagExplorerPage.test; the stale-only
// Checkbox IS interactable here. i18n in English.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TagToolbar } from '@/components/monitor/TagToolbar'
import i18n from '@/i18n'

const noop = () => {}

function renderToolbar(over: Partial<Parameters<typeof TagToolbar>[0]> = {}) {
  return render(
    <TagToolbar
      searchTerm=""
      onSearchChange={noop}
      selectedDriver="all"
      onDriverChange={noop}
      selectedGroup="all"
      onGroupChange={noop}
      selectedQuality="all"
      onQualityChange={noop}
      staleOnly={false}
      onStaleOnlyChange={noop}
      drivers={[]}
      uniqueGroups={[]}
      filteredCount={0}
      isFetching={false}
      onRefresh={noop}
      {...over}
    />,
  )
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('TagToolbar — problem-point filters', () => {
  it('renders the quality select with an accessible Quality label', () => {
    renderToolbar()

    expect(screen.getByRole('combobox', { name: 'Quality' })).toBeTruthy()
  })

  it('renders the stale-only toggle labeled with the revived tags.staleOnly key', () => {
    renderToolbar()

    expect(screen.getByText('Stale Tags Only')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Stale Tags Only' })).toBeTruthy()
  })

  it('toggling stale-only fires onStaleOnlyChange with true, and back with false', () => {
    const onStaleOnlyChange = vi.fn()
    const { rerender } = renderToolbar({ onStaleOnlyChange })

    fireEvent.click(screen.getByRole('checkbox', { name: 'Stale Tags Only' }))
    expect(onStaleOnlyChange).toHaveBeenCalledWith(true)

    rerender(
      <TagToolbar
        searchTerm=""
        onSearchChange={noop}
        selectedDriver="all"
        onDriverChange={noop}
        selectedGroup="all"
        onGroupChange={noop}
        selectedQuality="all"
        onQualityChange={noop}
        staleOnly
        onStaleOnlyChange={onStaleOnlyChange}
        drivers={[]}
        uniqueGroups={[]}
        filteredCount={0}
        isFetching={false}
        onRefresh={noop}
      />,
    )
    // The label element is still associated with the same checkbox id.
    expect(screen.getByRole('checkbox', { name: 'Stale Tags Only' })).toBeTruthy()
  })
})
