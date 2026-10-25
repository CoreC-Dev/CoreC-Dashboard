// @vitest-environment jsdom
// The card design language pins iOS-style continuous corners: the
// `squircle` utility (corner-shape: squircle, css-borders-4) smooths the
// transition from the straight edge into the corner without changing
// border-radius sizing — layout and hit-testing are untouched, and engines
// without corner-shape keep the circular corners as the fallback. This
// guards the token against silent class-list regressions (a plain class
// string is easy to drop in a refactor); the visual effect itself is a
// paint-level property jsdom cannot compute.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Card } from '@/components/ui/card'

afterEach(cleanup)

describe('Card continuous corners', () => {
  it('applies the squircle utility alongside its rounded-lg radius', () => {
    const { container } = render(<Card />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('squircle')
    expect(card.className).toContain('rounded-lg')
  })

  it('keeps squircle when a caller overrides the radius scale', () => {
    // tailwind-merge dedupes rounded-lg vs a caller's rounded-2xl, but the
    // squircle utility is a separate concern (curvature, not size) and must
    // survive the merge — corner-shape redraws whatever radius wins.
    const { container } = render(<Card className="rounded-2xl" />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('squircle')
    expect(card.className).toContain('rounded-2xl')
    expect(card.className).not.toContain('rounded-lg')
  })
})
