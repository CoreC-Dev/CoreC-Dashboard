/**
 * Status message management hook with auto-dismiss.
 *
 * Extracted from ConfigCenterPage.tsx to reduce the god component's state
 * surface. Manages a transient success/error notice that auto-clears after
 * a configurable timeout, with proper timer cleanup on unmount.
 */
import { useEffect, useRef, useState } from 'react'

const STATUS_AUTO_DISMISS_MS = 4000

export type StatusMessage = { type: 'success' | 'error'; text: string } | null

export function useStatusMessage(autoDismissMs: number = STATUS_AUTO_DISMISS_MS) {
  const [statusMsg, setStatusMsg] = useState<StatusMessage>(null)
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-dismiss the status notice and clear the pending timer on unmount so
  // we never call setState on a disposed component.
  useEffect(() => {
    if (!statusMsg) return
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current)
    statusTimerRef.current = setTimeout(() => {
      setStatusMsg(null)
      statusTimerRef.current = null
    }, autoDismissMs)
    return () => {
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current)
        statusTimerRef.current = null
      }
    }
  }, [statusMsg, autoDismissMs])

  return { statusMsg, setStatusMsg }
}
