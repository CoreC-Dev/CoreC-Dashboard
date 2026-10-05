// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { act, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNavIndicator } from '@/components/layout/useNavIndicator'

// The hook measures live DOM boxes via getBoundingClientRect and subscribes to
// ResizeObserver — neither exists meaningfully in jsdom, so we mock both and
// drive the measurement with controlled rects keyed by `data-key`.

type Box = { left: number; top: number; width: number; height: number }

function Harness({
  activeKey,
  collapsed,
  rects,
}: {
  activeKey?: string
  collapsed: boolean
  rects: Record<string, Box>
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const { style, visible } = useNavIndicator(containerRef, itemRefs, activeKey, collapsed)
  return (
    <div ref={containerRef} data-container>
      {Object.keys(rects).map((k) => (
        <div
          key={k}
          data-key={k}
          ref={(el) => {
            if (el) itemRefs.current.set(k, el)
            else itemRefs.current.delete(k)
          }}
        />
      ))}
      <div data-testid="indicator" data-visible={visible} style={style} />
    </div>
  )
}

function box(b: Box): DOMRect {
  return { ...b, right: 0, bottom: 0, x: 0, y: 0, toJSON: () => {} } as DOMRect
}

const RealRO = globalThis.ResizeObserver
let restoreRect: () => void

/** Install a getBoundingClientRect mock driven by a `data-key` → Box map. */
function mockRects(rects: Record<string, Box>) {
  const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: Element,
  ) {
    if (this.hasAttribute('data-container')) return box({ left: 0, top: 0, width: 0, height: 0 })
    const key = this.getAttribute('data-key')
    return box(key && rects[key] ? rects[key] : { left: 0, top: 0, width: 0, height: 0 })
  })
  restoreRect = () => spy.mockRestore()
}

describe('useNavIndicator', () => {
  beforeEach(() => {
    class MockRO {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = MockRO as unknown as typeof ResizeObserver
  })

  afterEach(() => {
    cleanup()
    globalThis.ResizeObserver = RealRO
    restoreRect?.()
  })

  it('positions the overlay over the active item and slides when it changes', () => {
    const rects: Record<string, Box> = {
      a: { left: 0, top: 12, width: 200, height: 44 },
      b: { left: 0, top: 68, width: 200, height: 44 },
    }
    mockRects(rects)

    const { rerender } = render(<Harness activeKey="a" collapsed={false} rects={rects} />)
    const indicator = document.querySelector('[data-testid="indicator"]') as HTMLElement
    expect(indicator.style.transform).toBe('translate(0px, 12px)')
    expect(indicator.style.width).toBe('200px')
    expect(indicator.style.height).toBe('44px')
    expect(indicator.style.borderRadius).toBe('0.5rem')

    // Switch active item → overlay target moves to item b.
    rerender(<Harness activeKey="b" collapsed={false} rects={rects} />)
    const after = document.querySelector('[data-testid="indicator"]') as HTMLElement
    expect(after.style.transform).toBe('translate(0px, 68px)')

    // No active item → overlay hidden.
    rerender(<Harness activeKey={undefined} collapsed={false} rects={rects} />)
    const hidden = document.querySelector('[data-testid="indicator"]') as HTMLElement
    expect(hidden.dataset.visible).toBe('false')
    expect(Number(hidden.style.opacity)).toBe(0)
  })

  it('uses a spring (back-out) easing for the slide once the layout settles', async () => {
    const rects: Record<string, Box> = {
      a: { left: 0, top: 10, width: 36, height: 36 },
    }
    mockRects(rects)

    render(<Harness activeKey="a" collapsed={true} rects={rects} />)
    // Wait for the collapse-settle timeout to re-enable transitions.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 320))
    })
    const indicator = document.querySelector('[data-testid="indicator"]') as HTMLElement
    expect(indicator.style.transition).toContain('var(--ease-spring)')
    // Collapsed → pill shape.
    expect(indicator.style.borderRadius).toBe('9999px')
  })
})
