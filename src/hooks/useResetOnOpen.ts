import { useState } from 'react'

/**
 * Call `resetFn` exactly when `open` transitions from false → true.
 *
 * Encapsulates the `lastOpen` render-phase guard pattern duplicated across
 * the Driver/Rule/Transport wizards: track the previous open state and, on
 * the rising edge, run a reset callback (re-seed draft fields from the
 * entity being edited, reset the step index, etc.). The guard also tracks
 * the falling edge so re-opening triggers reset again.
 *
 * Like the inline pattern it replaces, `resetFn` is invoked during render
 * (a "derive during render" update) — this is intentional and React-safe:
 * the setState calls inside `resetFn` schedule a re-render, and the
 * `setLastOpen(true)` guard prevents re-entry.
 */
export function useResetOnOpen(open: boolean, resetFn: () => void): void {
  const [lastOpen, setLastOpen] = useState(open)
  if (open && !lastOpen) {
    setLastOpen(true)
    resetFn()
  }
  if (!open && lastOpen) {
    setLastOpen(false)
  }
}
