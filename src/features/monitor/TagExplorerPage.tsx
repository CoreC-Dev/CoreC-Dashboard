import { useVirtualizer } from '@tanstack/react-virtual'
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  type UTCTimestamp,
} from 'lightweight-charts'
import { Activity, AlertCircle, Loader2, RefreshCw, Search, Send, X } from 'lucide-react'
import type React from 'react'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDrivers, useTags, useWriteTag } from '@/api/hooks'
import { CoreCWebSocket } from '@/api/websocket'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { QualityLabel } from '@/lib/constants'
import { cn } from '@/lib/utils'
import { validateValue } from '@/lib/writeValidation'
import type { DataPoint } from '@/types/models'

const ROW_HEIGHT = 44
const MAX_TREND_SAMPLES = 100

/** Fixed percentage column widths — header and rows share these so columns
 *  stay aligned inside the virtualized (display:block) table. */
const COLS = {
  tag: '20%',
  driver: '12%',
  group: '10%',
  value: '14%',
  type: '10%',
  quality: '10%',
  timestamp: '16%',
  actions: '8%',
} as const

/**
 * Composite identity for a physical tag point.
 *
 * CoreC's REST `/tags` cache is keyed by tag NAME only, so the same tag name
 * served by two different drivers (or devices) collides. The WS stream carries
 * the full {driver, device, tag} tuple, so we key the live merge map by all
 * three to keep cross-driver same-name tags distinct.
 */
const tagKey = (p: Pick<DataPoint, 'driver' | 'device' | 'tag'>): string =>
  `${p.driver}::${p.device ?? ''}::${p.tag}`

const isNumericType = (type: string): boolean =>
  type.startsWith('int') || type.startsWith('uint') || type.startsWith('float')

const toSeconds = (ts: string | undefined): number => {
  if (!ts) return Math.floor(Date.now() / 1000)
  const parsed = Date.parse(ts)
  return Number.isNaN(parsed) ? Math.floor(Date.now() / 1000) : Math.floor(parsed / 1000)
}

interface TrendSample {
  time: number
  value: number
}

interface TagRowProps {
  point: DataPoint
  start: number
  flashTick: number
  onOpen: (point: DataPoint) => void
  onWrite: (point: DataPoint) => void
}

// memo'd so a WS update to one tag re-renders only that row. The callbacks
// below (openTrend / handleWriteClick) are stabilized with useCallback, and
// unchanged rows keep the same `point` reference (setTagMap spreads the map
// without touching other keys), so unaffected rows bail out of re-rendering.
const TagRow = memo(function TagRow({ point, start, flashTick, onOpen, onWrite }: TagRowProps) {
  const { t } = useTranslation()
  const overlayRef = useRef<HTMLDivElement>(null)

  // Replay a 1s primary-tint flash whenever this row receives a fresh WS
  // update. WAAPI animates only opacity, so the tint color comes from the
  // `bg-primary/10` Tailwind class and stays theme-aware.
  useEffect(() => {
    if (flashTick <= 0) return
    const el = overlayRef.current
    if (!el) return
    const anim = el.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 1000,
      easing: 'ease-out',
      fill: 'forwards',
    })
    return () => anim.cancel()
  }, [flashTick])

  const q = QualityLabel[point.quality] ?? QualityLabel[0]

  return (
    <tr
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: ROW_HEIGHT,
        transform: `translateY(${start}px)`,
      }}
      tabIndex={0}
      aria-label={`${point.driver}:${point.tag} — ${point.value}`}
      className="flex items-center cursor-pointer border-b border-border/60 hover:bg-muted/30 transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      onClick={() => onOpen(point)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(point)
        }
      }}
    >
      <td
        className="px-4 py-2.5 shrink-0 min-w-0 truncate font-mono font-semibold text-foreground"
        style={{ width: COLS.tag }}
      >
        {point.tag}
      </td>
      <td
        className="px-4 py-2.5 shrink-0 min-w-0 truncate font-mono text-muted-foreground"
        style={{ width: COLS.driver }}
      >
        {point.driver}
      </td>
      <td
        className="px-4 py-2.5 shrink-0 min-w-0 truncate text-muted-foreground"
        style={{ width: COLS.group }}
      >
        {point.group || '-'}
      </td>
      <td className="px-4 py-2.5 shrink-0 min-w-0 overflow-hidden" style={{ width: COLS.value }}>
        <span className="inline-block font-mono text-sm font-bold bg-muted/60 px-2 py-0.5 rounded text-foreground truncate max-w-full align-middle">
          {typeof point.value === 'boolean'
            ? point.value
              ? t('tags.trueValue')
              : t('tags.falseValue')
            : String(point.value)}
        </span>
      </td>
      <td className="px-4 py-2.5 shrink-0 min-w-0" style={{ width: COLS.type }}>
        <Badge variant="outline" className="font-mono text-[10px] py-0 h-4">
          {point.type}
        </Badge>
      </td>
      <td className="px-4 py-2.5 shrink-0 min-w-0" style={{ width: COLS.quality }}>
        <Badge variant="outline" className={cn('text-[10px]', q.color)}>
          {t(q.key)}
        </Badge>
      </td>
      <td
        className="px-4 py-2.5 shrink-0 min-w-0 truncate text-muted-foreground font-mono text-[11px]"
        style={{ width: COLS.timestamp }}
      >
        {point.timestamp ? new Date(point.timestamp).toLocaleTimeString() : '-'}
        {point.is_stale && (
          <span className="ml-1.5 text-[10px] text-amber-400 border border-amber-500/30 px-1 rounded">
            {t('tags.stale')}
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 shrink-0 min-w-0 text-right" style={{ width: COLS.actions }}>
        <Button
          variant="ghost"
          size="sm"
          onClick={(e) => {
            e.stopPropagation()
            onWrite(point)
          }}
          className="h-7 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10"
        >
          <Send className="w-3 h-3 mr-1" />
          <span>{t('tags.write')}</span>
        </Button>
      </td>
      {flashTick > 0 && (
        <div
          ref={overlayRef}
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-primary/10"
        />
      )}
    </tr>
  )
})

export const TagExplorerPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: initialTagsData, refetch, isFetching, isLoading, isError, error } = useTags()
  const { data: driversData } = useDrivers()
  const writeMutation = useWriteTag()

  // Live tag map, keyed by the composite tagKey() (driver::device::tag).
  const [tagMap, setTagMap] = useState<Record<string, DataPoint>>({})
  // Per-row update counter; bumping it retriggers the flash animation.
  const [flashTick, setFlashTick] = useState<Record<string, number>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDriver, setSelectedDriver] = useState<string>('all')
  const [selectedTagForWrite, setSelectedTagForWrite] = useState<DataPoint | null>(null)
  const [writeValue, setWriteValue] = useState('')
  const [writeError, setWriteError] = useState<string | null>(null)

  // Trend drawer state.
  const [trendTag, setTrendTag] = useState<DataPoint | null>(null)
  const [trendSamples, setTrendSamples] = useState<TrendSample[]>([])

  // DOM / chart refs.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  // The WS callback is bound once per driver change; keep a ref to the
  // currently-selected trend tag so it can read the latest value live.
  const trendTagRef = useRef<DataPoint | null>(null)
  const hasSeeded = useRef(false)
  // Drawer panel ref — focused on open so Escape-to-close works without
  // requiring a prior click inside the panel.
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    trendTagRef.current = trendTag
  }, [trendTag])

  // Move focus into the drawer panel when it opens so the keyboard handler
  // below receives Escape without the user first clicking inside the panel.
  useEffect(() => {
    if (trendTag) drawerRef.current?.focus()
  }, [trendTag])

  // Seed the tag map from the REST snapshot ONCE on first load.
  //
  // useTags polls every 5s (refetchInterval: 5000) and returns a fresh object
  // each poll. Re-running setTagMap(initialTagsData.tags) on every poll — as
  // the original [initialTagsData] effect did — overwrites the live WS-merged
  // map and clobbers newer WS updates (the race condition). We seed once, then
  // let WS merges own the live state. A manual Refresh re-enables a single
  // merge to discover newly-added tags without clobbering fresher WS values.
  useEffect(() => {
    if (hasSeeded.current) return
    if (!initialTagsData?.tags) return
    hasSeeded.current = true
    setTagMap((prev) => {
      const next = { ...prev }
      for (const point of Object.values(initialTagsData.tags)) {
        const k = tagKey(point)
        // REST is keyed by tag name only; re-key by the composite identity.
        // Only fill tags the live WS map doesn't already have — WS values are
        // always fresher than the REST snapshot, so never overwrite them.
        if (!next[k]) next[k] = point
      }
      return next
    })
  }, [initialTagsData])

  // rAF batching for the high-frequency /tags/stream. The WS cap is ~500
  // msg/s, and the per-message handler used to call setTagMap + setFlashTick
  // directly — up to 1000 setState/sec, each triggering a React render pass.
  // Instead, stage incoming points in refs and flush once per animation frame
  // (<=60x/sec) so a burst of messages collapses into a single render. The
  // pending maps are component-level so they survive the WS effect
  // re-subscribing on a driver switch; the snapshot+clear happens OUTSIDE the
  // setState updater to keep that updater pure (React StrictMode double-invokes
  // updaters in dev, so mutating a ref inside one would drop the update).
  const pendingTagsRef = useRef<Map<string, DataPoint>>(new Map())
  const pendingFlashRef = useRef<Map<string, number>>(new Map())
  // Stage trend samples in a ref and flush them inside the same RAF as the
  // tag/flash updates. Previously setTrendSamples ran synchronously per WS
  // message (line ~326), bypassing the batching and causing a separate
  // render per message — the lightweight-charts series.update() then spiked
  // under burst traffic. [H-8]
  const pendingTrendRef = useRef<TrendSample[]>([])
  const flushRef = useRef<number | null>(null)
  // Discard any staged trend samples so they cannot leak into a different
  // trend session (openTrend/closeTrend/re-sub). We do NOT cancel the shared
  // RAF here because it also flushes pending tag/flash updates — those remain
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
      // Cancel any pending frame so we never setState after unmount/re-sub.
      if (flushRef.current !== null) {
        cancelAnimationFrame(flushRef.current)
        flushRef.current = null
      }
      // Discard trend samples staged for the previous stream so they cannot
      // leak into the new driver's trend session. [H-8]
      discardPendingTrend()
    }
  }, [selectedDriver, scheduleFlush, discardPendingTrend])

  // Create the trend chart once per tag selection. Data is pushed in by the
  // separate [trendSamples] effect below so the chart isn't rebuilt on every
  // sample (which would flicker).
  useEffect(() => {
    if (!trendTag || !isNumericType(trendTag.type)) return
    const container = chartContainerRef.current
    if (!container) return

    // lightweight-charts renders to a <canvas>, which cannot resolve CSS
    // custom properties (hsl(var(--...)) falls back to defaults — often
    // unreadable on dark themes). Resolve the actual computed color values
    // from the DOM at chart-creation time. The CSS vars store raw HSL
    // channels (e.g. "220 20% 98%"), so we wrap them in hsl().
    const styles = getComputedStyle(container)
    const resolve = (cssVar: string) => {
      const channels = styles.getPropertyValue(cssVar).trim()
      return channels ? `hsl(${channels})` : 'hsl(0 0% 50%)'
    }
    const mutedFg = resolve('--muted-foreground')
    const border = resolve('--border')
    const primary = resolve('--primary')

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 260,
      layout: {
        background: { color: 'transparent' },
        textColor: mutedFg,
      },
      grid: {
        vertLines: { color: border },
        horzLines: { color: border },
      },
      rightPriceScale: { borderColor: border },
      timeScale: { timeVisible: true, secondsVisible: true },
    })
    const series = chart.addSeries(LineSeries, {
      color: primary,
      lineWidth: 2,
    })
    chartRef.current = chart
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth })
      }
    })
    ro.observe(container)

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [trendTag])

  // Push buffered samples into the chart series whenever they change.
  useEffect(() => {
    if (!seriesRef.current) return
    seriesRef.current.setData(
      trendSamples.map((s) => ({ time: s.time as UTCTimestamp, value: s.value })),
    )
  }, [trendSamples])

  const drivers = driversData?.drivers || []
  // Memoize the list derivation so a WS message (setTagMap) doesn't re-run
  // the full Object.values + filter scan on every render without the deps
  // actually changing the inputs. This prevents render thrashing on
  // high-frequency /tags/stream updates.
  const tagsList = useMemo(() => Object.values(tagMap), [tagMap])

  const filteredTags = useMemo(() => {
    const term = searchTerm.toLowerCase()
    return tagsList.filter((pt) => {
      if (selectedDriver !== 'all' && pt.driver !== selectedDriver) return false
      if (term) {
        const match =
          pt.tag.toLowerCase().includes(term) ||
          pt.driver.toLowerCase().includes(term) ||
          pt.group?.toLowerCase().includes(term)
        if (!match) return false
      }
      return true
    })
  }, [tagsList, searchTerm, selectedDriver])

  const rowVirtualizer = useVirtualizer({
    count: filteredTags.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ROW_HEIGHT,
    overscan: 8,
  })

  const openTrend = useCallback(
    (point: DataPoint) => {
      // Discard any samples staged for the previous tag so a pending RAF does
      // not flush them into the new tag's chart (stale-sample leak). [H-8]
      discardPendingTrend()
      // Update the ref synchronously so the WS onmessage callback sees the
      // new tag on the very next message — without this, the ref lags the
      // state by one async tick (passive effect), and a stale-tag sample
      // arriving in that window would be staged and flushed into the new
      // tag's chart. [H-8 residual race]
      trendTagRef.current = point
      setTrendTag(point)
      if (isNumericType(point.type)) {
        const num = Number(point.value)
        setTrendSamples(Number.isNaN(num) ? [] : [{ time: toSeconds(point.timestamp), value: num }])
      } else {
        setTrendSamples([])
      }
    },
    [discardPendingTrend],
  )

  // Stable row-action handlers so memoized TagRow rows whose `point`/`start`/
  // `flashTick` haven't changed can skip re-rendering. Passing an inline arrow
  // as `onWrite` would hand every row a new function reference on each render
  // and defeat the memo above.
  const handleWriteClick = useCallback((point: DataPoint) => {
    setSelectedTagForWrite(point)
    setWriteValue(String(point.value))
  }, [])

  const closeTrend = () => {
    // Discard staged samples so a pending RAF doesn't flush them into a chart
    // that's about to unmount / already cleared. [H-8]
    discardPendingTrend()
    // Clear the ref synchronously so the WS callback stops staging samples
    // immediately (the passive effect lags by one tick). [H-8 residual race]
    trendTagRef.current = null
    setTrendTag(null)
    setTrendSamples([])
  }

  const handleRefresh = () => {
    // Allow a single re-seed from the next REST snapshot to pick up new tags.
    hasSeeded.current = false
    refetch()
  }

  const handleWriteSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTagForWrite) return
    setWriteError(null)

    // Industrial safety: validate the raw input against the tag's data type
    // BEFORE parsing or writing. This catches empty input (Number("") => 0),
    // non-numeric strings (NaN serializes to null in JSON), out-of-range
    // values, and ambiguous bool input — all of which previously wrote a
    // silently-coerced value to a physical actuator.
    const validationError = validateValue(writeValue, selectedTagForWrite.type)
    if (validationError) {
      setWriteError(validationError)
      return
    }

    let parsedVal: string | number | boolean = writeValue
    if (selectedTagForWrite.type === 'bool') {
      parsedVal = writeValue.toLowerCase() === 'true' || writeValue === '1'
    } else if (
      selectedTagForWrite.type.startsWith('int') ||
      selectedTagForWrite.type.startsWith('uint') ||
      selectedTagForWrite.type.startsWith('float')
    ) {
      parsedVal = Number(writeValue)
    }

    try {
      await writeMutation.mutateAsync({
        driver: selectedTagForWrite.driver,
        tag: selectedTagForWrite.tag,
        device: selectedTagForWrite.device,
        value: parsedVal,
        type: selectedTagForWrite.type,
      })
      setSelectedTagForWrite(null)
      setWriteValue('')
    } catch (err: unknown) {
      setWriteError(err instanceof Error ? err.message : t('tags.writeFailed'))
    }
  }

  const trendNumeric = trendTag ? isNumericType(trendTag.type) : false

  // The WS subscription may already be streaming points before the REST
  // snapshot resolves. Only show the loading/error placeholder when we have
  // nothing to render yet — once tagMap has entries (from either source) the
  // live table takes over.
  const showLoading = isLoading && filteredTags.length === 0
  const showError = isError && filteredTags.length === 0

  return (
    <div className="space-y-4">
      {/* Search & Filter Bar */}
      <Card className="border-border/80 bg-card/60 backdrop-blur-sm">
        <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex flex-1 items-center space-x-2 w-full">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
              <Input
                placeholder={t('common.search')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9 text-xs"
              />
            </div>

            {/* Driver Filter */}
            <select
              value={selectedDriver}
              onChange={(e) => setSelectedDriver(e.target.value)}
              className="h-9 px-3 rounded-md border border-input bg-transparent text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">{t('tags.allDrivers')}</option>
              {drivers.map((d) => (
                <option key={d.name} value={d.name}>
                  {d.name} ({d.type})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <div className="text-xs text-muted-foreground font-mono">
              {t('tags.total', { count: filteredTags.length })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
              className="h-9 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tags Data Table (virtualized rows via @tanstack/react-virtual) */}
      <Card className="border-border/80 bg-card/60 overflow-hidden">
        <div className="flex items-center justify-between border-b border-border/80 px-4 py-2">
          <div className="text-xs font-semibold text-foreground">{t('tags.tagsLabel')}</div>
          <div className="text-[11px] text-muted-foreground">{t('tags.clickToOpenTrend')}</div>
        </div>
        {showLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : showError ? (
          <div className="space-y-3 py-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-rose-400" />
            <div className="text-sm font-semibold">{t('common.error')}</div>
            {error instanceof Error && error.message && (
              <div className="mx-auto max-w-md break-all font-mono text-[11px] text-rose-400/80">
                {error.message}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <div ref={setScrollEl} className="overflow-auto max-h-[70vh]">
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 z-10 block bg-muted/80 backdrop-blur-sm border-b border-border/80 uppercase font-semibold text-[10px] text-muted-foreground tracking-wider">
                <tr className="flex items-center">
                  <th className="px-4 py-2.5 shrink-0 overflow-hidden" style={{ width: COLS.tag }}>
                    {t('tags.colTag')}
                  </th>
                  <th
                    className="px-4 py-2.5 shrink-0 overflow-hidden"
                    style={{ width: COLS.driver }}
                  >
                    {t('tags.colDriver')}
                  </th>
                  <th
                    className="px-4 py-2.5 shrink-0 overflow-hidden"
                    style={{ width: COLS.group }}
                  >
                    {t('tags.colGroup')}
                  </th>
                  <th
                    className="px-4 py-2.5 shrink-0 overflow-hidden"
                    style={{ width: COLS.value }}
                  >
                    {t('tags.colValue')}
                  </th>
                  <th className="px-4 py-2.5 shrink-0 overflow-hidden" style={{ width: COLS.type }}>
                    {t('tags.colType')}
                  </th>
                  <th
                    className="px-4 py-2.5 shrink-0 overflow-hidden"
                    style={{ width: COLS.quality }}
                  >
                    {t('tags.colQuality')}
                  </th>
                  <th
                    className="px-4 py-2.5 shrink-0 overflow-hidden"
                    style={{ width: COLS.timestamp }}
                  >
                    {t('tags.colTimestamp')}
                  </th>
                  <th
                    className="px-4 py-2.5 shrink-0 overflow-hidden text-right"
                    style={{ width: COLS.actions }}
                  >
                    {t('tags.colActions')}
                  </th>
                </tr>
              </thead>
              <tbody
                className="block relative"
                style={{ height: rowVirtualizer.getTotalSize(), width: '100%' }}
              >
                {filteredTags.length === 0 ? (
                  <tr className="block">
                    <td className="block py-10 text-center text-muted-foreground">
                      {t('tags.noPoints')}
                    </td>
                  </tr>
                ) : (
                  rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const point = filteredTags[virtualRow.index]
                    const key = tagKey(point)
                    return (
                      <TagRow
                        key={key}
                        point={point}
                        start={virtualRow.start}
                        flashTick={flashTick[key] ?? 0}
                        onOpen={openTrend}
                        onWrite={handleWriteClick}
                      />
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/*
       * Trend drawer.
       *
       * The task brief references the shadcn Sheet component at
       * src/components/ui/sheet.tsx, but that file does not exist in this
       * checkout and the "do not touch any other files" constraint forbids
       * creating it. The drawer is therefore implemented inline as a
       * fixed-position side panel with a backdrop; it delivers the same
       * feature (click a row -> slide-in panel with a lightweight-charts
       * trend of the last N WS samples).
       */}
      {trendTag && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            onClick={closeTrend}
            aria-hidden
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('tags.trendTitle', { tag: trendTag.tag })}
            tabIndex={-1}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeTrend()
            }}
            className="relative h-full w-full max-w-md border-l border-border bg-card shadow-2xl flex flex-col focus:outline-none"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center space-x-2 min-w-0">
                <Activity className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground truncate">
                    {trendTag.tag}
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono truncate">
                    {trendTag.driver}
                    {trendTag.device ? ` · ${trendTag.device}` : ''}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={closeTrend}
                className="h-8 w-8 p-0 shrink-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-auto p-4 space-y-3">
              {trendNumeric ? (
                <>
                  <div className="text-[11px] text-muted-foreground">
                    {t('tags.liveTrend', { count: trendSamples.length, max: MAX_TREND_SAMPLES })}
                  </div>
                  <div ref={chartContainerRef} className="w-full h-[260px]" />
                </>
              ) : (
                <div className="text-xs text-muted-foreground py-12 text-center">
                  {t('tags.noTrendData')}
                </div>
              )}

              <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs font-mono space-y-1">
                <div>
                  <span className="text-muted-foreground">{t('common.type')}: </span>
                  <span className="text-foreground">{trendTag.type}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('common.value')}: </span>
                  <span className="text-foreground">
                    {typeof trendTag.value === 'boolean'
                      ? trendTag.value
                        ? t('tags.trueValue')
                        : t('tags.falseValue')
                      : String(trendTag.value)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('common.quality')}: </span>
                  <span className="text-foreground">
                    {t((QualityLabel[trendTag.quality] ?? QualityLabel[0]).key)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('common.timestamp')}: </span>
                  <span className="text-foreground">
                    {trendTag.timestamp ? new Date(trendTag.timestamp).toLocaleString() : '-'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Write Command Dialog */}
      <Dialog
        open={!!selectedTagForWrite}
        onOpenChange={(open) => !open && setSelectedTagForWrite(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Send className="w-4 h-4 text-primary" />
              <span>{t('tags.writeToTag')}</span>
            </DialogTitle>
            <DialogDescription className="text-xs">{t('tags.writeToTagDesc')}</DialogDescription>
          </DialogHeader>

          {selectedTagForWrite && (
            <form onSubmit={handleWriteSubmit} className="space-y-4 pt-2">
              {writeError && (
                <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{writeError}</span>
                </div>
              )}

              <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs space-y-1 font-mono">
                <div>
                  <span className="text-muted-foreground">{t('common.driver')}: </span>
                  <span className="font-semibold text-foreground">
                    {selectedTagForWrite.driver}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('common.tag')}: </span>
                  <span className="font-semibold text-primary">{selectedTagForWrite.tag}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('common.type')}: </span>
                  <span className="text-foreground">{selectedTagForWrite.type}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {t('tags.newTargetValue')}
                </label>
                <Input
                  type="text"
                  value={writeValue}
                  onChange={(e) => setWriteValue(e.target.value)}
                  placeholder={t('tags.enterValue')}
                  required
                  className="font-mono text-xs"
                />
              </div>

              <div className="p-2.5 rounded bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-500">
                {t('write.confirmWarning')}
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedTagForWrite(null)}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={writeMutation.isPending}
                  className="glow-primary"
                >
                  {writeMutation.isPending ? t('common.loading') : t('write.submit')}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
