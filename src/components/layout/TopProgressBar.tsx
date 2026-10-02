import type React from 'react'
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Top route-progress bar — a composited transform bar that animates on every
 * route change without triggering layout thrash. Fades out after completion.
 */
export const TopProgressBar: React.FC = () => {
  const location = useLocation()
  const [progress, setProgress] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: location.pathname is an intentional trigger — re-run the progress-bar animation on every route change, not a value read in the body.
  useEffect(() => {
    setProgress(30)
    const t1 = setTimeout(() => setProgress(70), 80)
    const t2 = setTimeout(() => setProgress(100), 250)
    const t3 = setTimeout(() => setProgress(0), 500)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [location.pathname])

  if (progress <= 0) return null

  return (
    <div className="fixed top-0 left-0 right-0 h-0.5 z-[100] pointer-events-none">
      <div
        className="h-full w-full bg-primary transition-transform duration-300 ease-out origin-left"
        style={{ transform: `scaleX(${progress / 100})` }}
      />
    </div>
  )
}
