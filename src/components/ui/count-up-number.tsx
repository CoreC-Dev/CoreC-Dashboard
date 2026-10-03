import { memo, useEffect, useRef, useState } from 'react'

interface CountUpNumberProps {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}

/**
 * Displays a number that animates from its previous value to the new target
 * using an ease-out cubic curve. Respects prefers-reduced-motion.
 *
 * Animation logic inlined (TD-ARCH-005) — components/ui must not import
 * from hooks/. The former useCountUp hook had no other consumers.
 */
export const CountUpNumber = memo(function CountUpNumber({
  value,
  duration = 800,
  format = (n) => n.toLocaleString(),
  className,
}: CountUpNumberProps) {
  const [animated, setValue] = useState(0)
  const rafRef = useRef<number | undefined>(undefined)
  const fromRef = useRef(0)

  useEffect(() => {
    // Skip animation if reduced motion is preferred
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setValue(value)
      return
    }

    const from = fromRef.current
    const start = performance.now()

    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - t) ** 3 // ease-out cubic
      const next = from + (value - from) * eased
      setValue(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        fromRef.current = value
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  return <span className={className}>{format(Math.round(animated))}</span>
})
