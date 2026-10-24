// @vitest-environment jsdom
// Component coverage: the write page's dead-letter card exposes the
// search box, narrows rows as the operator types, and shows the explicit
// no-match state instead of a blank card. (The pure rules live in
// lib/deadLetterFilter.test; the driver Select cannot be driven open in
// jsdom — the alerts-filter tests hit the same limitation.)
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DeadLetterTable } from '@/components/admin/WriteControlParts'
import i18n from '@/i18n'
import type { DeadLetterEntry } from '@/types/models'

const dl = (driver: string, tag: string, error: string): DeadLetterEntry => ({
  command: { driver, tag, value: 1, type: 'float32' },
  error,
  failed_at: '2026-10-19T00:00:00Z',
  attempts: 3,
})

const ENTRIES = [
  dl('plc1', 'temperature', 'write timeout'),
  dl('plc2', 'pump_speed', 'disconnected'),
]

function renderTable() {
  return render(
    <MemoryRouter>
      <DeadLetterTable
        visibleDeadLetters={ENTRIES}
        loadingDlq={false}
        errorDlq={false}
        fetchingDlq={false}
        dlqError={null}
        dlqClearedMsg={null}
        replayError={null}
        onRefresh={vi.fn()}
        onClearAll={vi.fn()}
        onReplay={vi.fn()}
        isWritePending={false}
      />
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
})

describe('DeadLetterTable search', () => {
  it('shows the search box with entries present and narrows by tag text', async () => {
    renderTable()

    expect(screen.getByText(/pump_speed/)).toBeTruthy()
    const search = screen.getByPlaceholderText('Search dead letters (tag/error)…')
    await act(async () => {
      fireEvent.change(search, { target: { value: 'pump' } })
    })
    expect(screen.getByText(/pump_speed/)).toBeTruthy()
    expect(screen.queryByText(/temperature/)).toBeNull()
  })

  it('matches verbatim error text and shows the no-match state on gibberish', async () => {
    renderTable()

    const search = screen.getByPlaceholderText('Search dead letters (tag/error)…')
    await act(async () => {
      fireEvent.change(search, { target: { value: 'timeout' } })
    })
    expect(screen.getByText(/temperature/)).toBeTruthy()
    expect(screen.queryByText(/pump_speed/)).toBeNull()

    await act(async () => {
      fireEvent.change(search, { target: { value: 'no-such-thing' } })
    })
    expect(screen.getByText('No matching dead letters')).toBeTruthy()
  })
})
