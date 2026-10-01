import { useCountUp } from '@/hooks/useCountUp'

interface CountUpNumberProps {
  value: number
  duration?: number
  format?: (n: number) => string
  className?: string
}

/**
 * Displays a number that animates from its previous value to the new target
 * using an ease-out cubic curve. Respects prefers-reduced-motion.
 */
export function CountUpNumber({
  value,
  duration = 800,
  format = (n) => Math.round(n).toLocaleString(),
  className,
}: CountUpNumberProps) {
  const animated = useCountUp(value, duration)
  return <span className={className}>{format(animated)}</span>
}
