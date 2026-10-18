// @vitest-environment jsdom
// GlobalSettingsPage — import dialog outcome classification (audit D-08).
// The store's importInstances now returns {added, skipped, invalid,
// parseError}; the dialog must tell those four stories apart instead of
// answering every outcome with "added 0, skipped 0 duplicates", and a clean
// import must show a brief confirmation instead of closing silently.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { GlobalSettingsPage } from '@/features/settings/GlobalSettingsPage'
import i18n from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// themeStore (pulled in via GlobalSettingsPage) probes prefers-color-scheme
// in module scope — jsdom has no matchMedia. Hoisted before imports.
vi.hoisted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'undefined') {
    const stub = (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })
    Object.defineProperty(window, 'matchMedia', {
      value: stub,
      writable: true,
      configurable: true,
    })
  }
})

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  vi.useFakeTimers()
  useInstanceStore.setState({ instances: [], probing: {}, probeErrors: {} })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  useInstanceStore.setState({ instances: [], probing: {}, probeErrors: {} })
})

function renderPage() {
  return render(
    <MemoryRouter>
      <GlobalSettingsPage />
    </MemoryRouter>,
  )
}

/** Open the import dialog and paste `text` into the JSON textarea. */
function openImportWith(text: string) {
  renderPage()
  fireEvent.click(screen.getByRole('button', { name: 'Import' }))
  const dialog = screen.getByRole('dialog')
  const textarea = within(dialog).getByLabelText('Import Instance Configs')
  fireEvent.change(textarea, { target: { value: text } })
  return dialog
}

/** Click the footer "Import" submit inside an open import dialog. */
function submitImport(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }))
}

const VALID_INSTANCES_JSON = JSON.stringify([
  { id: 'inst_new1', name: 'New One', baseUrl: 'http://one', secret: 's' },
  { id: 'inst_new2', name: 'New Two', baseUrl: 'http://two', secret: 's' },
])

describe('GlobalSettingsPage import dialog (D-08)', () => {
  it('reports unusable JSON as a parse failure, not "added 0, skipped 0"', () => {
    const dialog = openImportWith('this is not json')
    submitImport(dialog)

    const feedback = screen.getByRole('status')
    expect(feedback).toHaveTextContent(
      'Import failed: not a valid instance-config JSON (expected an array of objects with id/name/baseUrl)',
    )
    // The dialog stays open so the operator can fix the payload.
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('shows a brief success note on a clean import, then closes', () => {
    const dialog = openImportWith(VALID_INSTANCES_JSON)
    submitImport(dialog)

    const feedback = screen.getByRole('status')
    expect(feedback).toHaveTextContent('Import complete: 2 instance(s) added')
    expect(useInstanceStore.getState().instances).toHaveLength(2)

    // The confirmation is brief (1.5s) — then the dialog closes itself.
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the dialog open with the breakdown when entries were skipped', () => {
    useInstanceStore.setState({
      instances: [
        {
          id: 'inst_new1',
          name: 'New One',
          baseUrl: 'http://one',
          secret: 's',
          createdAt: '',
          sortOrder: 1,
        },
      ],
    })
    const duplicates = JSON.stringify([
      { id: 'inst_new1', name: 'New One', baseUrl: 'http://one', secret: 's' }, // dup by id
      { id: 'inst_other', name: 'New One', baseUrl: 'http://x', secret: 's' }, // dup by name
    ])
    const dialog = openImportWith(duplicates)
    submitImport(dialog)

    // Both entries already exist (by id AND name).
    const feedback = screen.getByRole('status')
    expect(feedback).toHaveTextContent('All 2 entries already exist')
    expect(useInstanceStore.getState().instances).toHaveLength(1)
    // No auto-close for a mixed outcome — the breakdown stays readable.
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('separates invalid entries from duplicates in the partial breakdown', () => {
    useInstanceStore.setState({
      instances: [
        {
          id: 'inst_new1',
          name: 'New One',
          baseUrl: 'http://one',
          secret: 's',
          createdAt: '',
          sortOrder: 1,
        },
      ],
    })
    const mixed = JSON.stringify([
      { id: 'inst_fresh', name: 'Fresh', baseUrl: 'http://fresh', secret: 's' },
      { id: 'inst_new1', name: 'New One', baseUrl: 'http://one', secret: 's' }, // duplicate id
      { name: 'No baseUrl', id: 'inst_bad' }, // invalid shape
    ])
    const dialog = openImportWith(mixed)
    submitImport(dialog)

    const feedback = screen.getByRole('status')
    expect(feedback).toHaveTextContent(
      'Added 1 instance(s), skipped 1 duplicate(s) and 1 invalid entries',
    )
    expect(useInstanceStore.getState().instances).toHaveLength(2)
  })

  it('answers a valid-but-empty array with the plain zero result', () => {
    const dialog = openImportWith('[]')
    submitImport(dialog)

    const feedback = screen.getByRole('status')
    expect(feedback).toHaveTextContent('Added 0 instance(s), skipped 0 duplicate(s)')
  })
})
