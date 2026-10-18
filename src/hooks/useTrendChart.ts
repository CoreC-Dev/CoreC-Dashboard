import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  LineSeries,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useCallback, useEffect, useRef } from 'react'
import { isNumericType, type TrendSample } from '@/lib/tagExplorer'
import { useThemeStore } from '@/stores/themeStore'
import type { DataPoint } from '@/types/models'

interface UseTrendChartOptions {
  /** Tag currently shown in the trend drawer (null when closed). */
  trendTag: DataPoint | null
  /** Buffered trend samples pushed into the chart series. */
  trendSamples: TrendSample[]
}

interface UseTrendChartResult {
  /** Attach to the chart container <div>. */
  chartContainerRef: React.RefObject<HTMLDivElement | null>
  /** Jump the time scale back to the live edge after the operator panned or
   *  zoomed into history — lightweight-charts only auto-follows while the
   *  newest bar is at the visible right edge (audit 待验证-1 verification:
   *  no scrollToRealTime/fitContent call existed anywhere before this). */
  scrollToLive: () => void
}

/**
 * Map buffered samples to lightweight-charts line data. A sample without a
 * value is a whitespace point — the line BREAKS there instead of drawing a
 * fabricated segment across the pause gap (B08). Pure; unit-tested.
 */
export const toLineData = (samples: TrendSample[]) =>
  samples.map((s) =>
    s.value === undefined
      ? { time: s.time as UTCTimestamp }
      : { time: s.time as UTCTimestamp, value: s.value },
  )

/**
 * Lightweight-charts trend chart lifecycle for the TagExplorer trend drawer.
 *
 * Creates the chart once per tag selection (and again on theme change, since
 * the canvas reads CSS variables at creation time), then pushes buffered
 * samples into the series whenever they change. Extracted verbatim from
 * TagExplorerPage — no behavior change.
 */
export function useTrendChart({
  trendTag,
  trendSamples,
}: UseTrendChartOptions): UseTrendChartResult {
  // Track the resolved theme so the lightweight-charts canvas re-creates
  // when the user toggles light/dark. The chart reads CSS custom properties
  // via getComputedStyle at creation time; without this dependency, a theme
  // switch leaves the chart with stale colors until a full page refresh.
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme)

  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Line'> | null>(null)

  // Create the trend chart once per tag selection. Data is pushed in by the
  // separate [trendSamples] effect below so the chart isn't rebuilt on every
  // sample (which would flicker).
  // resolvedTheme is in the dep array because lightweight-charts renders to a
  // <canvas> that reads CSS variables at creation time; toggling the theme
  // changes those variables, so we must recreate the chart. The linter can't
  // trace this indirect dependency through getComputedStyle.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resolvedTheme triggers chart recreation via CSS variable reads
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
      autoSize: true,
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

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [trendTag, resolvedTheme])

  // Push buffered samples into the chart series whenever they change.
  // Whitespace samples (no value) break the line across pause gaps (B08).
  useEffect(() => {
    if (!seriesRef.current) return
    seriesRef.current.setData(toLineData(trendSamples))
  }, [trendSamples])

  const scrollToLive = useCallback(() => {
    chartRef.current?.timeScale().scrollToRealTime()
  }, [])

  return { chartContainerRef, scrollToLive }
}
