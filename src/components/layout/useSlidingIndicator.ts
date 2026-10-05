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

/**
 * Sliding highlight for a row of toggle items (mode switcher, tab bar, …).
 * Measures the active item's box relative to a shared container and returns
 * an absolutely-positioned overlay style. On switch the overlay slides
 * between positions with a spring (back-out) easing for a small bounce.
 *
 * Pure layout helper — no `@/` imports beyond React. For the sidebar nav
 * (which also tracks collapse/expand) use `useNavIndicator` instead.
 */
export function useSlidingIndicator(
  containerRef: React.RefObject<HTMLDivElement | null>,
  itemRefs: React.RefObject<Map<string, HTMLElement>>,
  activeKey: string | undefined,
): { visible: boolean; style: CSSProperties } {
  const [rect, setRect] = useState<Rect | null>(null)
  const [mounted, setMounted] = useState(false)
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

  // Re-measure on switch (animated, with bounce). activeKey is read indirectly
  // through the stable measure callback, so it is an intentional dep.
  // biome-ignore lint/correctness/useExhaustiveDependencies: activeKey triggers a re-measure on switch
  useLayoutEffect(() => {
    measure()
  }, [measure, activeKey])

  // Keep the overlay glued to the active item when its box or the container
  // shifts (window resize, font load). containerRef/itemRefs are stable refs;
  // only activeKey re-subscribes the observer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: stable refs; only activeKey re-subscribes
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
  const transition = mounted
    ? 'transform 0.3s var(--ease-spring), width 0.3s var(--ease-smooth), height 0.3s var(--ease-smooth)'
    : 'none'

  const style: CSSProperties = rect
    ? {
        position: 'absolute',
        top: 0,
        left: 0,
        width: rect.w,
        height: rect.h,
        transform: `translate(${rect.x}px, ${rect.y}px)`,
        borderRadius: '0.375rem',
        transition,
        opacity: 1,
        pointerEvents: 'none',
        willChange: 'transform',
      }
    : { position: 'absolute', opacity: 0, pointerEvents: 'none' }

  return { visible, style }
}
