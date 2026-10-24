// @vitest-environment jsdom
// CountUpNumber — Math.round must live INSIDE the integer default
// format, not before it: a custom format receives the RAW animated value so
// fractional KPIs (sample rate, one decimal) don't get flattened to "12.0"
// for the whole animation. Reduced-motion is forced on so the component
// snaps straight to the target value — no rAF animation to await.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { CountUpNumber } from '@/components/ui/count-up-number'

beforeAll(() => {
  // jsdom ships no matchMedia; reduced-motion also makes renders
  // deterministic (setValue(value) without the rAF easing curve).
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
})

afterEach(() => {
  cleanup()
})

describe('CountUpNumber — raw animated value for custom formats', () => {
  it('passes the raw fractional value to a custom format (12.4 stays 12.4)', () => {
    render(<CountUpNumber value={12.4} format={(n) => n.toFixed(1)} />)
    expect(screen.getByText('12.4')).toBeTruthy()
  })

  it('keeps rounding inside the DEFAULT format so integer KPIs stay integers', () => {
    render(<CountUpNumber value={1234.5} />)
    expect(screen.getByText('1,235')).toBeTruthy()
  })

  it('a custom integer format can still round (formatNumber wrappers keep their contract)', () => {
    render(<CountUpNumber value={99.6} format={(n) => Math.round(n).toLocaleString()} />)
    expect(screen.getByText('100')).toBeTruthy()
  })
})
