import type React from 'react'
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

type Rect = { x: number; y: number; w: number; h: number }

/** Sidebar collapse/expand CSS transition duration + a small settle margin. */
const LAYOUT_SETTLE_MS = 260

/**
 * Sliding highlight for the sidebar nav. Measures the active item's box
 * relative to a shared container and returns an absolutely-positioned overlay
 * style. On nav switches the overlay slides between positions with a spring
 * (back-out) easing for a small bounce; during sidebar collapse/expand it
 * tracks the layout instantly so it stays glued to the item.
 *
 * Pure layout helper — no `@/` imports beyond React.
 */
export function useNavIndicator(
  containerRef: React.RefObject<HTMLDivElement | null>,
  itemRefs: React.RefObject<Map<string, HTMLElement>>,
  activeKey: string | undefined,
  collapsed: boolean,
): { visible: boolean; style: CSSProperties } {
  const [rect, setRect] = useState<Rect | null>(null)
  const [mounted, setMounted] = useState(false)
  const [noTransition, setNoTransition] = useState(false)
  const rafRef = useRef<number>(0)

  // Keep the latest active key reachable from the stable measure callback.
  const activeKeyRef = useRef(activeKey)
  activeKeyRef.current = activeKey

  const measure = useCallback(() => {
    const container = containerRef.current
    const key = activeKeyRef.current
    const item = key ? itemRefs.current.get(key) : undefined
    if (!container || !item) {
      setRect(null)
      return
    }
    const c = container.getBoundingClientRect()
    const i = item.getBoundingClientRect()
    setRect({ x: i.left - c.left, y: i.top - c.top, w: i.width, h: i.height })
  }, [containerRef, itemRefs])

  // Enable transitions after first paint so the indicator doesn't slide in
  // from the origin on initial mount.
  useEffect(() => {
    setMounted(true)
  }, [])

  // Re-measure on nav switch (animated, with bounce). activeKey is read
  // indirectly through the stable measure callback, so it is an intentional dep.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeKey triggers a re-measure on nav switch
  useLayoutEffect(() => {
    measure()
  }, [measure, activeKey])

  // During collapse/expand, track the layout without the bounce transition,
  // then re-enable transitions once the layout has settled.
  // biome-ignore lint/correctness/useExhaustiveDependencies: collapsed triggers instant layout tracking on sidebar resize
  useLayoutEffect(() => {
    setNoTransition(true)
    measure()
    const id = window.setTimeout(() => {
      measure()
      setNoTransition(false)
    }, LAYOUT_SETTLE_MS)
    return () => window.clearTimeout(id)
  }, [measure, collapsed])

  // Keep the overlay glued to the active item when its box or the container
  // shifts (window resize, collapse animation, font load). The observer stays
  // attached across collapse, so only activeKey needs to re-subscribe.
  // biome-ignore lint/correctness/useExhaustiveDependencies: containerRef/itemRefs are stable refs; only activeKey re-subscribes the observer
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const item = activeKey ? itemRefs.current.get(activeKey) : undefined
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(measure)
    })
    ro.observe(container)
    if (item) ro.observe(item)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(rafRef.current)
    }
  }, [measure, activeKey])

  const visible = rect !== null
  const transition =
    noTransition || !mounted
      ? 'none'
      : 'transform 0.34s var(--ease-spring), width 0.34s var(--ease-smooth), height 0.34s var(--ease-smooth), border-radius 0.34s var(--ease-smooth), opacity 0.2s var(--ease-smooth)'

  const style: CSSProperties = rect
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: rect.w,
        height: rect.h,
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        borderRadius: collapsed ? '9999px' : '0.5rem',
        transition,
        opacity: 1,
        pointerEvents: 'none',
        willChange: 'transform, width, height',
      }
    : { position: 'absolute', opacity: 0, pointerEvents: 'none' }

  return { visible, style }
}
