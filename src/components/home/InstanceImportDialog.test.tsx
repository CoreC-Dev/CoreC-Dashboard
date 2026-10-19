// @vitest-environment jsdom
// InstanceImportDialog (audit A-14) — the shared import UI for both entry
// points (homepage header + settings page). The audit's complaint: the same
// operation offered drag & drop + file browse on the homepage but only a
// bare textarea on the settings page. The component must carry the full
// affordance set AND the honest outcome classification (D-08/A-09) so both
// pages behave identically.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InstanceImportDialog } from '@/components/home/InstanceImportDialog'
import i18n from '@/i18n'
import { useInstanceStore } from '@/stores/instanceStore'

const t = (key: string, opts?: Record<string, unknown>) => i18n.t(key, opts)

/** Scoped queries: the dialog element itself is also labelled with the
 * title (aria-labelledby), so an unscoped getByLabelText matches it too. */
function dialogScope() {
  return within(screen.getByRole('dialog'))
}

function renderDialog(onOpenChange = vi.fn()) {
  render(<InstanceImportDialog open onOpenChange={onOpenChange} />)
  return onOpenChange
}

function paste(payload: string): void {
  fireEvent.change(dialogScope().getByLabelText(t('instances.importTitle')), {
    target: { value: payload },
  })
}

function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: t('instances.import') }))
}

const validItemsJson = JSON.stringify([
  { id: 'imp-1', name: 'Imported A', baseUrl: 'http://a:9090', secret: 'import-secret' },
])

beforeEach(() => {
  useInstanceStore.setState({ instances: [], probing: {}, probeErrors: {} })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('InstanceImportDialog shared affordances (A-14)', () => {
  it('offers drag & drop, file browse AND paste in one dialog', () => {
    renderDialog()

    // The drop zone says what it accepts and offers the browse fallback…
    expect(screen.getByText(t('instances.importDrop'))).toBeInTheDocument()
    expect(screen.getByText(t('instances.importBrowse'))).toBeInTheDocument()
    // …and the paste path is still there for copied JSON.
    expect(dialogScope().getByLabelText(t('instances.importTitle'))).toBeInTheDocument()
    expect(screen.getByText(t('instances.importOrPaste'))).toBeInTheDocument()
  })

  it('loads a dropped JSON file into the paste area', async () => {
    renderDialog()
    const file = new File([validItemsJson], 'instances.json', { type: 'application/json' })
    const dropZone = screen.getByText(t('instances.importDrop')).closest('button')
    expect(dropZone).not.toBeNull()

    fireEvent.drop(dropZone as HTMLElement, { dataTransfer: { files: [file] } })

    await waitFor(() => {
      expect(dialogScope().getByLabelText(t('instances.importTitle'))).toHaveValue(validItemsJson)
    })
  })
})

describe('InstanceImportDialog outcome classification (D-08/A-09)', () => {
  it('reports unusable JSON as a parse failure and keeps the dialog open', () => {
    vi.useFakeTimers()
    const onOpenChange = renderDialog()
    paste('{not valid json')
    submit()

    expect(screen.getByRole('status')).toHaveTextContent(t('instances.importInvalid'))
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('shows a green confirmation on a clean import, then closes itself', () => {
    vi.useFakeTimers()
    const onOpenChange = renderDialog()
    paste(validItemsJson)
    submit()

    expect(screen.getByRole('status')).toHaveTextContent(t('instances.importSuccess', { added: 1 }))
    expect(useInstanceStore.getState().instances).toHaveLength(1)

    act(() => {
      vi.advanceTimersByTime(1_500)
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps the breakdown visible for an all-duplicates import', () => {
    vi.useFakeTimers()
    useInstanceStore.setState({
      instances: [
        {
          id: 'imp-1',
          name: 'Imported A',
          baseUrl: 'http://a:9090',
          secret: 's',
          createdAt: '',
          sortOrder: 1,
        },
      ],
    })
    const onOpenChange = renderDialog()
    paste(validItemsJson)
    submit()

    expect(screen.getByRole('status')).toHaveTextContent(
      t('instances.importAllSkipped', { skipped: 1 }),
    )
    act(() => {
      vi.advanceTimersByTime(2_000)
    })
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('closes without importing when cancelled', () => {
    const onOpenChange = renderDialog()
    paste(validItemsJson)
    fireEvent.click(screen.getByRole('button', { name: t('common.cancel') }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(useInstanceStore.getState().instances).toHaveLength(0)
  })

  it('starts every open as a fresh session — no stale payload or verdict', () => {
    const { rerender } = render(<InstanceImportDialog open={false} onOpenChange={() => {}} />)
    rerender(<InstanceImportDialog open onOpenChange={() => {}} />)
    expect(dialogScope().getByLabelText(t('instances.importTitle'))).toHaveValue('')
  })
})
