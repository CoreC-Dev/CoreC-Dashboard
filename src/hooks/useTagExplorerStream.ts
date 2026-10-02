import { useCallback, useEffect, useRef, useState } from 'react'
import { CoreCWebSocket } from '@/api/hooks'
import {
  isNumericType,
  MAX_TREND_SAMPLES,
  type TrendSample,
  tagKey,
  toSeconds,
} from '@/lib/tagExplorer'
import type { DataPoint } from '@/types/models'

interface UseTagExplorerStreamOptions {
  /** REST snapshot of all tags, polled by useTags every 5s. Seeded once. */
  initialTags: Record<string, DataPoint> | undefined
  /** Active driver filter ('all' = every driver); drives the WS params. */
  selectedDriver: string
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
  /** Reset the one-time seed guard so the next REST snapshot re-merges
   *  (used by the manual Refresh button to discover newly-added tags). */
  resetSeed: () => void
  /** The tag currently shown in the trend drawer. */
  trendTag: DataPoint | null
  /** Set the trend tag. Updates the internal ref synchronously so the WS
   *  onmessage callback sees the new value on the very next message —
   *  without the one-tick lag a passive effect would introduce. */
  setTrendTag: (tag: DataPoint | null) => void
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
}: UseTagExplorerStreamOptions): UseTagExplorerStreamResult {
  // Live tag map, keyed by the composite tagKey() (driver::device::tag).
  const [tagMap, setTagMap] = useState<Record<string, DataPoint>>({})
  // Per-row update counter; bumping it retriggers the flash animation.
  const [flashTick, setFlashTick] = useState<Record<string, number>>({})
  const [trendSamples, setTrendSamples] = useState<TrendSample[]>([])

  // The trend tag and a ref mirror. The WS onmessage callback (bound once per
  // driver change) reads the ref to stage live samples without a stale closure.
  // setTrendTag updates the ref synchronously to avoid the one-tick lag a
  // passive effect would introduce (H-8 residual race).
  const [trendTag, setTrendTagState] = useState<DataPoint | null>(null)
  const trendTagRef = useRef<DataPoint | null>(null)
  const setTrendTag = useCallback((tag: DataPoint | null) => {
    trendTagRef.current = tag
    setTrendTagState(tag)
  }, [])

  // Seed-once guard so the 5s REST poll never clobbers fresher WS values.
  const hasSeeded = useRef(false)

  // Seed the tag map from the REST snapshot ONCE on first load.
  //
  // useTags polls every 5s (refetchInterval: 5000) and returns a fresh object
  // each poll. Re-running setTagMap(initialTags) on every poll — as the
  // original [initialTagsData] effect did — overwrites the live WS-merged map
  // and clobbers newer WS updates (the race condition). We seed once, then let
  // WS merges own the live state. A manual Refresh re-enables a single merge
  // to discover newly-added tags without clobbering fresher WS values.
  useEffect(() => {
    if (hasSeeded.current) return
    if (!initialTags) return
    hasSeeded.current = true
    setTagMap((prev) => {
      const next = { ...prev }
      for (const point of Object.values(initialTags)) {
        const k = tagKey(point)
        // REST is keyed by tag name only; re-key by the composite identity.
        // Only fill tags the live WS map doesn't already have — WS values are
        // always fresher than the REST snapshot, so never overwrite them.
        if (!next[k]) next[k] = point
      }
      return next
    })
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
  // [H-8]
  const pendingTrendRef = useRef<TrendSample[]>([])
  const flushRef = useRef<number | null>(null)
  // Discard staged trend samples so they cannot leak into a different trend
  // session (openTrend/closeTrend/re-sub). We do NOT cancel the shared RAF
  // here because it also flushes pending tag/flash updates — those remain
  // valid. Clearing the trend buffer is enough: the RAF fires, finds an empty
  // trend buffer, and skips the trend flush. [H-8]
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
        setTrendSamples((prev) => {
          let next = [...prev]
          for (const s of staged) {
            // lightweight-charts requires strictly-increasing, unique times.
            const last = next[next.length - 1]
            let time = s.time
            if (last && time <= last.time) time = last.time + 1
            next.push({ time, value: s.value })
          }
          if (next.length > MAX_TREND_SAMPLES) next = next.slice(next.length - MAX_TREND_SAMPLES)
          return next
        })
      }
    })
  }, [])

  // Subscribe to real-time /tags/stream. The stream pushes ONE DataPoint per
  // message; merge by composite key so same-name tags across drivers/devices
  // don't collide. Also bump the row's flash tick and buffer trend samples for
  // the tag currently shown in the drawer (if numeric).
  // biome-ignore lint/correctness/useExhaustiveDependencies: trendTagRef is a stable ref; .current changes do not require re-subscription
  useEffect(() => {
    const ws = new CoreCWebSocket<DataPoint>(
      '/tags/stream',
      selectedDriver !== 'all' ? { driver: selectedDriver } : {},
      (point) => {
        const key = tagKey(point)
        // Stage the update for the next animation frame instead of setState
        // per message (see scheduleFlush above).
        pendingTagsRef.current.set(key, point)
        pendingFlashRef.current.set(key, (pendingFlashRef.current.get(key) ?? 0) + 1)
        scheduleFlush()

        const sel = trendTagRef.current
        if (sel && tagKey(sel) === key && isNumericType(point.type)) {
          const num = Number(point.value)
          if (Number.isNaN(num)) return
          // Stage the trend sample for the next animation frame instead of
          // calling setTrendSamples per message (bypasses batching). [H-8]
          pendingTrendRef.current.push({ time: toSeconds(point.timestamp), value: num })
          scheduleFlush()
        }
      },
    )
    return () => {
      ws.destroy()
      // Cancel a pending frame so we never setState after unmount/re-sub.
      if (flushRef.current !== null) {
        cancelAnimationFrame(flushRef.current)
        flushRef.current = null
      }
      // Discard trend samples staged for the previous stream so they cannot
      // leak into the new driver's trend session. [H-8]
      discardPendingTrend()
    }
  }, [selectedDriver, scheduleFlush, discardPendingTrend])

  const resetSeed = useCallback(() => {
    hasSeeded.current = false
  }, [])

  return {
    tagMap,
    flashTick,
    trendSamples,
    setTrendSamples,
    discardPendingTrend,
    resetSeed,
    trendTag,
    setTrendTag,
  }
}
