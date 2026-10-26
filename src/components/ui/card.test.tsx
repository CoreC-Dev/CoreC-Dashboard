// @vitest-environment jsdom
// The card design language pins iOS-style continuous corners at Apple
// scale: the `squircle` utility (corner-shape: squircle, css-borders-4)
// smooths the transition from the straight edge into the corner, while
// `rounded-3xl` (--radius-3xl, 24px ≈ the iOS icon proportion of a KPI
// tile's short side) sizes it. Curvature and size are separate knobs —
// layout and hit-testing are untouched, and engines without corner-shape
// keep the circular corners as the fallback. This guards both tokens
// against silent class-list regressions (a plain class string is easy to
// drop in a refactor), and pins that the radius stays on Tailwind's
// default scale so tailwind-merge keeps deduping caller overrides; the
// visual effect itself is paint-level and cannot be computed by jsdom.
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Card } from '@/components/ui/card'

afterEach(cleanup)

describe('Card continuous corners', () => {
  it('applies squircle curvature at the rounded-3xl radius', () => {
    const { container } = render(<Card />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('squircle')
    expect(card.className).toContain('rounded-3xl')
  })

  it('keeps squircle when a caller overrides the radius scale', () => {
    // tailwind-merge dedupes rounded-3xl vs a caller's rounded-sm, but
    // the squircle utility is a separate concern (curvature, not size)
    // and must survive the merge — corner-shape redraws whatever radius
    // wins.
    const { container } = render(<Card className="rounded-sm" />)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('squircle')
    expect(card.className).toContain('rounded-sm')
    expect(card.className).not.toContain('rounded-3xl')
  })
})
