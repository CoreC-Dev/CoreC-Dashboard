// @vitest-environment jsdom
// Paint-level UI contracts that jsdom cannot compute: the class strings that
// carry the design tokens. Kept in one file so a class-token change has a
// single update point instead of one file per component.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Card } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

afterEach(cleanup)

describe('Card continuous corners', () => {
  // The card design language pins iOS-style continuous corners at Apple
  // scale: the `squircle` utility (corner-shape: squircle, css-borders-4)
  // smooths the transition from the straight edge into the corner, while
  // `rounded-3xl` sizes it. Curvature and size are separate knobs.
  it('applies squircle curvature at the rounded-3xl radius', () => {
    const { container } = render(<Card />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('squircle')
    expect(card.className).toContain('rounded-3xl')
  })

  it('keeps squircle when a caller overrides the radius scale', () => {
    // tailwind-merge dedupes rounded-3xl vs a caller's rounded-sm, but the
    // squircle utility is a separate concern (curvature, not size) and must
    // survive the merge — corner-shape redraws whatever radius wins.
    const { container } = render(<Card className="rounded-sm" />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('squircle')
    expect(card.className).toContain('rounded-sm')
    expect(card.className).not.toContain('rounded-3xl')
  })
})

describe('DialogContent viewport clamp', () => {
  // A tall dialog (the seven-field instance form) used to extend past a
  // short/landscape viewport with no scroll container, leaving the footer
  // buttons unreachable. The content element must clamp to the viewport and
  // scroll its own overflow; overflow-y-auto only shows a scrollbar when
  // content actually overflows, so short dialogs are unaffected.
  it('clamps its height to the viewport and scrolls overflow', () => {
    render(
      <Dialog open onOpenChange={() => {}}>
        <DialogContent>
          <DialogTitle>tall dialog</DialogTitle>
        </DialogContent>
      </Dialog>,
    )
    const content = screen.getByRole('dialog')
    expect(content.className).toContain('max-h-[calc(100vh-2rem)]')
    expect(content.className).toContain('overflow-y-auto')
  })
})
