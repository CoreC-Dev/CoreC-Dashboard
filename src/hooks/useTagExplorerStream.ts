import { useCallback, useEffect, useRef, useState } from 'react'
import { CoreCWebSocket, makeStreamId, useWsStatusStore } from '@/api/hooks'
import {
  appendTrendSamples,
  insertPauseGap,
  isNumericType,
  MAX_TREND_SAMPLES,
  type TrendSample,
  tagKey,
  toSeconds,
} from '@/lib/tagExplorer'
import type { DataPoint } from '@/types/models'

interface UseTagExplorerStreamOptions {
  /** REST snapshot of all tags (re-fetched by the page every
   * TAG_SNAPSHOT_POLL_MS; each NEW object reconciles the live map). */
  initialTags: Record<string, DataPoint> | undefined
  /** Active driver filter ('all' = every driver); drives the WS params. */
  selectedDriver: string
  /** Called with the number of tags a snapshot reconcile DISCOVERED
   * (filled keys the live map lacked) — the initial seed does not fire
   * it. Wire it to a transient "new tags" notice. */
  onTagsDiscovered?: (count: number) => void
}

interface UseTagExplorerStreamResult {
  /** Live tag map keyed by composite tagKey() (driver::device::tag). */
  tagMap: Record<string, DataPoint>
  /** Per-row flash tick; bumping retriggers the row's flash animation. */
  flashTick: Record<string, number>
  /** Buffered trend samples for the open drawer's chart. */
  trendSamples: TrendSample[]
  /** Direct setter for seeding/resetting trend samples on open/close. */
  setTrendSamples: React.Dispatch<React.SetStateAction<TrendSample[]>>
  /** Drop staged trend samples so a pending RAF can't leak them into a new
   *  trend session. Does NOT cancel the shared RAF (tag/flash flushes remain
   *  valid). */
  discardPendingTrend: () => void
  /** The tag currently shown in the trend drawer. */
  trendTag: DataPoint | null
  /** Set the trend tag. Updates the internal ref synchronously so the WS
   *  onmessage callback sees the new value on the very next message —
   *  without the one-tick lag a passive effect would introduce. */
  setTrendTag: (tag: DataPoint | null) => void
  /** Whether the trend chart is paused (stops staging new samples). */
  trendPaused: boolean
  /** Toggle pause/resume for the trend chart. */
  setTrendPaused: React.Dispatch<React.SetStateAction<boolean>>
}

/**
 * Live tag stream state for TagExplorerPage.
 *
 * Owns the high-frequency `/tags/stream` WebSocket subscription, the
 * rAF-batched merge into the tag map, the per-row flash-tick counters, and the
 * buffered trend samples for the open drawer. The REST snapshot is seeded once
 * (WS values are always fresher, so never overwritten); a manual Refresh
 * re-enables a single re-seed.
 *
 * Extracted verbatim from TagExplorerPage — no behavior change.
 */
export function useTagExplorerStream({
  initialTags,
  selectedDriver,
  onTagsDiscovered,
}: UseTagExplorerStreamOptions): UseTagExplorerStreamResult {
  // Live tag map, keyed by the composite tagKey() (driver::device::tag).
  const [tagMap, setTagMap] = useState<Record<string, DataPoint>>({})
  // Per-row update counter; bumping it retriggers the flash animation.
  const [flashTick, setFlashTick] = useState<Record<string, number>>({})
  const [trendSamples, setTrendSamples] = useState<TrendSample[]>([])

  // The trend tag and a ref mirror. The WS onmessage callback (bound once per
  // driver change) reads the ref to stage live samples without a stale closure.
  // setTrendTag updates the ref synchronously to avoid the one-tick lag a
  // passive effect would introduce (residual race).
  const [trendTag, setTrendTagState] = useState<DataPoint | null>(null)
  const trendTagRef = useRef<DataPoint | null>(null)
  const setTrendTag = useCallback((tag: DataPoint | null) => {
    trendTagRef.current = tag
    setTrendTagState(tag)
  }, [])

  // Pause/resume the trend chart. When paused, the WS callback skips staging
  // new trend samples so the operator can inspect a frozen snapshot.
  // On RESUME after a real pause, a value-less GAP sample is appended one
  // second after the last real sample: lightweight-charts breaks the
  // line there, so the paused period renders blank instead of a straight
  // line fabricating the missing data.
  const [trendPaused, setTrendPaused] = useState(false)
  const trendPausedRef = useRef(false)
  useEffect(() => {
    if (trendPaused) {
      trendPausedRef.current = true
      return
    }
    if (!trendPausedRef.current) return
    trendPausedRef.current = false
    setTrendSamples((prev) => {
      const next = insertPauseGap(prev)
      return next.length > MAX_TREND_SAMPLES ? next.slice(next.length - MAX_TREND_SAMPLES) : next
    })
  }, [trendPaused])

  // Snapshot reconcile. Every NEW REST snapshot object (each fetch
  // re-ran: manual refresh, config-reload invalidation, reconnect, or the
  // page's 60s poll) diffs the live map:
  //  - fills keys the live map lacks (new backend tags appear without the
  //    hidden "manual refresh" knowledge) — never overwriting, since WS
  //    values are always fresher than the snapshot;
  //  - drops keys the snapshot no longer carries (deleted tags used to
  //    squat in the table forever). A tag pushed by WS milliseconds before
  //    the snapshot was taken can be removed for one cycle if the registry
  //    hadn't caught up — the next snapshot self-heals;
  //  - reports how many tags it DISCOVERED (not the initial seed) so the
  //    page can show a transient notice.
  const onDiscoveredRef = useRef(onTagsDiscovered)
  onDiscoveredRef.current = onTagsDiscovered
  const lastSnapshotRef = useRef<Record<string, DataPoint> | undefined>(undefined)
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the snapshot object identity only — reconcile must NOT re-run on every rAF tagMap flush; the map is read as of the snapshot's render.
  useEffect(() => {
    if (!initialTags) return
    const isFirstEver = lastSnapshotRef.current === undefined
    const isSameObject = lastSnapshotRef.current === initialTags
    lastSnapshotRef.current = initialTags

    const snapshotKeys = new Set<string>()
    let discovered = 0
    const next = { ...tagMap }
    for (const point of Object.values(initialTags)) {
      const k = tagKey(point)
      snapshotKeys.add(k)
      if (!next[k]) {
        next[k] = point
        discovered += 1
      }
    }
    for (const k of Object.keys(next)) {
      if (!snapshotKeys.has(k)) delete next[k]
    }
    setTagMap(next)
    if (discovered > 0 && !isFirstEver && !isSameObject) {
      onDiscoveredRef.current?.(discovered)
    }
  }, [initialTags])

  // rAF batching for the high-frequency /tags/stream. The WS cap is ~500
  // msg/s, and the per-message handler used to call setTagMap + setFlashTick
  // directly — up to 1000 setState/sec, each triggering a React render pass.
  // Instead, stage incoming points in refs and flush once per animation frame
  // (<=60x/sec) so a burst of messages collapses into a single render. The
  // pending maps are hook-level so they survive the WS effect re-subscribing
  // on a driver switch; the snapshot+clear happens OUTSIDE the setState
  // updater to keep that updater pure (React StrictMode double-invokes
  // updaters in dev, so mutating a ref inside one would drop the update).
  const pendingTagsRef = useRef<Map<string, DataPoint>>(new Map())
  const pendingFlashRef = useRef<Map<string, number>>(new Map())
  // Stage trend samples in a ref and flush them inside the same RAF as the
  // tag/flash updates. Previously setTrendSamples ran synchronously per WS
  // message, bypassing the batching and causing a separate render per message
  // — the lightweight-charts series.update() then spiked under burst traffic.
  const pendingTrendRef = useRef<TrendSample[]>([])
  const flushRef = useRef<number | null>(null)
  // Discard staged trend samples so they cannot leak into a different trend
  // session (openTrend/closeTrend/re-sub). We do NOT cancel the shared RAF
  // here because it also flushes pending tag/flash updates — those remain
  // valid. Clearing the trend buffer is enough: the RAF fires, finds an empty
  // trend buffer, and skips the trend flush.
  const discardPendingTrend = useCallback(() => {
    pendingTrendRef.current = []
  }, [])
  const scheduleFlush = useCallback(() => {
    if (flushRef.current !== null) return // a frame is already scheduled
    flushRef.current = requestAnimationFrame(() => {
      flushRef.current = null
      // Snapshot then clear outside the updater so the updater stays pure.
      if (pendingTagsRef.current.size > 0) {
        const entries = Array.from(pendingTagsRef.current)
        pendingTagsRef.current.clear()
        setTagMap((prev) => {
          const next = { ...prev }
          for (const [k, v] of entries) next[k] = v
          return next
        })
      }
      if (pendingFlashRef.current.size > 0) {
        const entries = Array.from(pendingFlashRef.current)
        pendingFlashRef.current.clear()
        setFlashTick((prev) => {
          const next = { ...prev }
          for (const [k, v] of entries) next[k] = (prev[k] ?? 0) + v
          return next
        })
      }
      if (pendingTrendRef.current.length > 0) {
        const staged = pendingTrendRef.current
        pendingTrendRef.current = []
        // Same-second updates coalesce into the existing sample (last
        // value wins) — no more fabricated last.time + 1 timestamps drifting
        // the chart axis and the exported CSV.
        setTrendSamples((prev) => appendTrendSamples(prev, staged))
      }
    })
  }, [])

  // Subscribe to real-time /tags/stream. The stream pushes ONE DataPoint per
  // message; merge by composite key so same-name tags across drivers/devices
  // don't collide. Also bump the row's flash tick and buffer trend samples for
  // the tag currently shown in the drawer (if numeric).
  //
  // The socket reports its connection status into the global wsStatusStore:
  // a silent freeze after a disconnect/reject is the P0 the
  // store + page banner exist to surface. Message activity pings the store's
  // "last update" timestamp (throttled ≥1s inside the store — this callback
  // runs up to ~500×/s), and limiter drops feed the rate-limit hint.
  useEffect(() => {
    const id = makeStreamId('tags-stream')
    let ws: CoreCWebSocket<DataPoint> | null = null
    const statusStore = useWsStatusStore.getState()
    const sink = statusStore.registerStream(id)
    statusStore.attachReconnect(id, () => ws?.reconnect())
    ws = new CoreCWebSocket<DataPoint>(
      '/tags/stream',
      selectedDriver !== 'all' ? { driver: selectedDriver } : {},
      (point) => {
        statusStore.touchStream(id)
        const key = tagKey(point)
        // Stage the update for the next animation frame instead of setState
        // per message (see scheduleFlush above).
        pendingTagsRef.current.set(key, point)
        pendingFlashRef.current.set(key, (pendingFlashRef.current.get(key) ?? 0) + 1)
        scheduleFlush()

        const sel = trendTagRef.current
        if (sel && !trendPausedRef.current && tagKey(sel) === key && isNumericType(point.type)) {
          const num = Number(point.value)
          if (Number.isNaN(num)) return
          // Stage the trend sample for the next animation frame instead of
          // calling setTrendSamples per message (bypasses batching).
          pendingTrendRef.current.push({ time: toSeconds(point.timestamp), value: num })
          scheduleFlush()
        }
      },
      sink,
      (dropped) => statusStore.reportDropped(id, dropped),
    )
    return () => {
      ws?.destroy()
      statusStore.unregisterStream(id)
      // Cancel a pending frame so we never setState after unmount/re-sub.
      if (flushRef.current !== null) {
        cancelAnimationFrame(flushRef.current)
        flushRef.current = null
      }
      // Discard trend samples staged for the previous stream so they cannot
      // leak into the new driver's trend session.
      discardPendingTrend()
    }
  }, [selectedDriver, scheduleFlush, discardPendingTrend])

  return {
    tagMap,
    flashTick,
    trendSamples,
    setTrendSamples,
    discardPendingTrend,
    trendTag,
    setTrendTag,
    trendPaused,
    setTrendPaused,
  }
}
