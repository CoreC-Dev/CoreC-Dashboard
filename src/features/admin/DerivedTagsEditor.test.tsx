// @vitest-environment jsdom
// Regression: deleting a derived tag must confirm (it used to vanish
// instantly), the row edit button is a Pencil (Calculator read as
// "compute"), and the expression field validates live — a broken expr used
// to surface only at apply time.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DerivedTagsEditor } from '@/features/admin/DerivedTagsEditor'
import i18n from '@/i18n'
import { useConfigStore } from '@/stores/configStore'
import type { CoreCConfig } from '@/types/config'

const WORKING: CoreCConfig = {
  'derived-tags': [
    {
      name: 'efficiency',
      expr: '(output / input) * 100',
      type: 'float64',
      interval: '5s',
    },
  ],
}

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  useConfigStore.setState({
    workingConfig: WORKING,
    savedConfig: WORKING,
    dirty: true,
    seedStatus: 'ready',
    seedError: null,
  })
})

afterEach(() => {
  cleanup()
  useConfigStore.getState().reset()
})

describe('DerivedTagsEditor — delete confirm, pencil icon, live expr validation', () => {
  it('row delete opens a confirm dialog; Confirm removes, Cancel keeps', async () => {
    render(
      <MemoryRouter>
        <DerivedTagsEditor />
      </MemoryRouter>,
    )

    await screen.findByText('efficiency')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })

    expect(await screen.findByText('Delete derived tag')).toBeTruthy()
    expect(
      screen.getByText(/Are you sure you want to delete the derived tag "efficiency"/),
    ).toBeTruthy()
    // Nothing removed before the explicit confirm.
    expect(useConfigStore.getState().workingConfig?.['derived-tags']).toHaveLength(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    })
    expect(useConfigStore.getState().workingConfig?.['derived-tags']).toHaveLength(1)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    })
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!)
    })
    expect(useConfigStore.getState().workingConfig?.['derived-tags']).toHaveLength(0)
  })

  it('edit button shows a pencil; a broken expression is flagged live', async () => {
    render(
      <MemoryRouter>
        <DerivedTagsEditor />
      </MemoryRouter>,
    )

    await screen.findByText('efficiency')
    const editButton = screen.getByRole('button', { name: 'Edit' })
    // Pencil icon (not the old Calculator) — lucide renders an <svg> whose
    // class names carry the icon.
    expect(editButton.querySelector('svg')?.getAttribute('class')).toContain('lucide-pencil')

    await act(async () => {
      fireEvent.click(editButton)
    })

    // Type a syntactically invalid expression → the shared validator's
    // message appears immediately (before any save/apply attempt).
    const exprInput = screen.getByPlaceholderText('(output / input) * 100')
    await act(async () => {
      fireEvent.change(exprInput, { target: { value: 'bogus * 2' } })
    })
    expect(await screen.findByText(/invalid characters:/)).toBeTruthy()
    // A valid expression shows no error line.
    await act(async () => {
      fireEvent.change(exprInput, { target: { value: 'value * 2' } })
    })
    expect(screen.queryByText(/invalid characters:/)).toBeNull()
  })
})
