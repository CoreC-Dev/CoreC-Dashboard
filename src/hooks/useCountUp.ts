import { useEffect, useRef, useState } from 'react'

/**
 * Animate a number from 0 to `target` using requestAnimationFrame
 * with an ease-out cubic curve. Respects prefers-reduced-motion.
 */
export function useCountUp(target: number, duration = 800): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | undefined>(undefined)
  const fromRef = useRef(0)

  useEffect(() => {
    // Skip animation if reduced motion is preferred
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setValue(target)
      return
    }

    const from = fromRef.current
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - t) ** 3 // ease-out cubic
      const next = from + (target - from) * eased
      setValue(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = target
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [target, duration])

  return value
}
