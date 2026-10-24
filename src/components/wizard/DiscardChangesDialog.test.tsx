// @vitest-environment jsdom
// DiscardChangesDialog: discarding unsaved edits is a lossy
// action, but the confirm used to render as the default primary (lime)
// button — visually identical to a plain "OK", so habit-clicking the
// right button dropped the draft. The confirm must be destructive-styled,
// the same red family as every delete-class confirm.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { DiscardChangesDialog } from '@/components/wizard/DiscardChangesDialog'
import i18n from '@/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DiscardChangesDialog destructive confirm', () => {
  it('renders the confirm with the destructive variant, not the primary look', () => {
    render(<DiscardChangesDialog open onOpenChange={() => {}} onConfirm={() => {}} />)

    const confirm = screen.getByRole('button', { name: 'Discard' })
    expect(confirm.className).toContain('bg-destructive')
    expect(confirm.className).toContain('text-destructive-foreground')
    // Cancel stays a plain outline button — the danger sits on the action.
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel.className).not.toContain('bg-destructive')
  })

  it('still confirms via onConfirm and closes', () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(<DiscardChangesDialog open onOpenChange={onOpenChange} onConfirm={onConfirm} />)

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
