// @vitest-environment jsdom
// DialogContent had no max-height or overflow constraint: on
// short/landscape viewports a tall dialog (the seven-field instance form)
// extended past the viewport and the footer buttons were unreachable — the
// dialog could not be scrolled because nothing scrolled. The content element
// must clamp to the viewport and scroll its own overflow; overflow-y-auto
// only shows a scrollbar when content actually overflows, so short dialogs
// are unaffected.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

afterEach(cleanup)

function renderContent(): HTMLElement {
  render(
    <Dialog open onOpenChange={() => {}}>
      <DialogContent>
        <DialogTitle>tall dialog</DialogTitle>
      </DialogContent>
    </Dialog>,
  )
  return screen.getByRole('dialog')
}

describe('DialogContent viewport clamp', () => {
  it('clamps its height to the viewport and scrolls overflow', () => {
    const content = renderContent()
    expect(content.className).toContain('max-h-[calc(100vh-2rem)]')
    expect(content.className).toContain('overflow-y-auto')
  })
})
