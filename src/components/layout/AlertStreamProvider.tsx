import type React from 'react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { CoreCWebSocket, makeStreamId, useDeadLetters, useWsStatusStore } from '@/api/hooks'
import { playAlertBeep } from '@/lib/alertAudio'
import { useAlertStore } from '@/stores/alertStore'
import type { LogEvent } from '@/types/models'

/**
 * Shows a browser notification iff the user has granted permission
 * (unchanged from the old AlertsPage notify helper).
 */
function showNotification(title: string, body: string): void {
  try {
    if (typeof Notification === 'undefined') return
    if (Notification.permission !== 'granted') return
    new Notification(title, { body })
  } catch {
    // Notification API blocked — fail silently
  }
}

/**
 * AlertStreamProvider — instance-level /logs subscription (audit B02).
 *
 * Mounted once by AppShell (inside ConnectionProvider/ConnectionGate, so it
 * only runs against a connected instance), it keeps the warn/error stream
 * alive on EVERY route of the instance — the old subscription lived inside
 * AlertsPage, so leaving the alerts page made sounds, browser
 * notifications, and the sidebar badge all go deaf.
 *
 * It owns no context: state lands in alertStore (bounded feed + unread
 * count + DLQ count) and the socket's connection status in wsStatusStore
 * (wired like every other stream: status sink, activity touch, drop
 * reports, reconnect handle for the banner's rejected-retry button).
 *
 * Renders nothing — it is a behavior-only provider. The one /logs socket
 * it owns is the only alert subscription in the app: AlertsPage reads the
 * feed from the store instead of subscribing again (dedupe).
 */
export const AlertStreamProvider: React.FC = () => {
  const { t } = useTranslation()
  // Latest translations for the WS callback without resubscribing on
  // language change (same ref pattern the old AlertsPage effect used).
  const tRef = useRef(t)
  tRef.current = t

  const { id } = useParams<{ id: string }>()

  // DLQ size for the sidebar badge — the SAME ['deadLetters'] query the
  // Alerts/Dashboard pages use, so react-query dedupes the poller whenever
  // both are mounted; on other routes this is the only poller.
  const { data: deadLettersData } = useDeadLetters()
  const setDeadLetterCount = useAlertStore((s) => s.setDeadLetterCount)
  useEffect(() => {
    setDeadLetterCount(deadLettersData?.failed_writes?.length ?? 0)
  }, [deadLettersData, setDeadLetterCount])

  // The /logs subscription — recreated only when the instance id changes.
  // It first clears per-instance transient data (feed, unread, DLQ count):
  // the provider stays mounted when only the :id param changes in place
  // (AppShell is not keyed per instance), so stale counts from the previous
  // instance must not leak into the new one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: id is the intentional stable dep — resubscribe only when the active instance changes, not on route/location transitions (the whole point of B02: the stream survives navigation).
  useEffect(() => {
    useAlertStore.getState().resetTransient()

    const streamId = makeStreamId('logs')
    const statusStore = useWsStatusStore.getState()
    const sink = statusStore.registerStream(streamId)
    let ws: CoreCWebSocket<LogEvent> | null = null
    statusStore.attachReconnect(streamId, () => ws?.reconnect())

    // rAF batching — a log storm can emit hundreds of events per second;
    // buffering + one flush per frame keeps store writes (and re-renders
    // of every alertStore subscriber) to ≤60/s (same discipline as the
    // old page-local buffer).
    const pending: LogEvent[] = []
    let rafId: number | null = null
    const flush = () => {
      rafId = null
      const batch = pending.splice(0, pending.length)
      if (batch.length === 0) return
      // Feed + unread count land in one store write per frame.
      useAlertStore.getState().pushEvents(batch)
      const { soundEnabled, notificationsEnabled } = useAlertStore.getState()
      for (const evt of batch) {
        // level >= 8 are errors — audible + visual alerts when enabled
        // (per-event, not per-batch: same behavior the page had).
        if (evt.level >= 8) {
          if (soundEnabled) playAlertBeep()
          if (notificationsEnabled) {
            showNotification(
              tRef.current('alerts.notificationTitle'),
              tRef.current('alerts.notificationBody'),
            )
          }
        }
      }
    }
    const scheduleFlush = () => {
      if (rafId === null) rafId = requestAnimationFrame(flush)
    }

    ws = new CoreCWebSocket<LogEvent>(
      '/logs',
      {},
      (evt) => {
        statusStore.touchStream(streamId)
        // level >= 4 are warnings and errors
        if (evt.level >= 4) {
          pending.push(evt)
          scheduleFlush()
        }
      },
      sink,
      (dropped) => statusStore.reportDropped(streamId, dropped),
    )

    return () => {
      ws?.destroy()
      statusStore.unregisterStream(streamId)
      if (rafId !== null) cancelAnimationFrame(rafId)
      pending.length = 0
    }
  }, [id])

  return null
}
