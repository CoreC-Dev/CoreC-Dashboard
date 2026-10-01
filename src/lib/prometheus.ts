export interface MetricEntry {
  name: string
  labels: Record<string, string>
  value: number
}

export function parsePrometheusMetrics(raw: string): MetricEntry[] {
  const lines = raw.split('\n')
  const results: MetricEntry[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // metric_name{label="val",...} 123.45
    // or metric_name 123.45
    // The label section is delimited by the opening brace and the matching
    // closing brace. A naive [^}]* would truncate at the first '}' inside a
    // label value (e.g. my_metric{label="val_}"} 1). We scan for the real
    // closing brace by respecting quoted strings: a '}' inside quotes does
    // not terminate the label block. [M-4]
    const nameMatch = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/)
    if (!nameMatch) continue
    const name = nameMatch[1]
    let rest = trimmed.slice(nameMatch[0].length)

    let rawLabels: string | undefined
    if (rest.startsWith('{')) {
      // Find the closing brace that is NOT inside a quoted string.
      let inString = false
      let closeIdx = -1
      for (let i = 1; i < rest.length; i++) {
        const ch = rest[i]
        if (ch === '"' && rest[i - 1] !== '\\') inString = !inString
        else if (ch === '}' && !inString) {
          closeIdx = i
          break
        }
      }
      if (closeIdx === -1) continue // malformed — no closing brace
      rawLabels = rest.slice(1, closeIdx)
      rest = rest.slice(closeIdx + 1)
    }

    const valueMatch = rest.match(/^\s+([^\s]+)/)
    if (!valueMatch) continue
    const rawVal = valueMatch[1]
    const val = parseFloat(rawVal)
    if (Number.isNaN(val)) continue

    const labels: Record<string, string> = {}
    if (rawLabels) {
      // Label values are quoted; extract key="value" pairs while respecting
      // escaped quotes and '}' characters inside the value.
      const labelRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g
      let m: RegExpExecArray | null
      while ((m = labelRegex.exec(rawLabels)) !== null) {
        // Unescape standard Prometheus escapes: \" \\ \n
        labels[m[1]] = m[2].replace(/\\(.)/g, '$1')
      }
    }

    results.push({ name, labels, value: val })
  }

  return results
}

/**
 * A single cumulative bucket from a Prometheus histogram.
 *
 * `le` is the upper bound (the `le="..."` label value). The final
 * overflow bucket is exposed by Prometheus as `le="+Inf"` and decoded
 * here as `le: Infinity`. `count` is the cumulative number of
 * observations with value ≤ le.
 */
export interface HistogramBucket {
  le: number
  count: number
}

/**
 * A decoded Prometheus histogram: the base metric name (e.g.
 * `corec_read_latency_seconds`), its cumulative buckets sorted by `le`
 * ascending, plus the total `_count` and `_sum` companion series.
 */
export interface Histogram {
  name: string
  buckets: HistogramBucket[]
  count: number | null
  sum: number | null
}

/**
 * Group parsed Prometheus metrics into histograms by collecting every
 * `<base>_bucket{le="..."}` line (plus the `<base>_count` / `<base>_sum`
 * companions) under `<base>`. Buckets are sorted by `le` ascending so
 * they are ready for {@link estimateQuantile}. The `le="+Inf"` bucket is
 * represented as `le: Infinity`.
 *
 * A `_bucket` line without an `le` label is skipped. A histogram entry
 * is created whenever any of `_bucket`, `_count`, or `_sum` is present
 * for a base name, so callers can still read count/sum even when the
 * backend does not expose bucket boundaries.
 */
export function extractHistograms(metrics: MetricEntry[]): Map<string, Histogram> {
  const map = new Map<string, Histogram>()
  const ensure = (base: string): Histogram => {
    let h = map.get(base)
    if (!h) {
      h = { name: base, buckets: [], count: null, sum: null }
      map.set(base, h)
    }
    return h
  }

  for (const m of metrics) {
    if (m.name.endsWith('_bucket')) {
      const base = m.name.slice(0, -'_bucket'.length)
      const leRaw = m.labels.le
      if (leRaw === undefined) continue
      const le = leRaw === '+Inf' || leRaw === 'Inf' ? Infinity : parseFloat(leRaw)
      if (Number.isNaN(le)) continue
      ensure(base).buckets.push({ le, count: m.value })
    } else if (m.name.endsWith('_count')) {
      ensure(m.name.slice(0, -'_count'.length)).count = m.value
    } else if (m.name.endsWith('_sum')) {
      ensure(m.name.slice(0, -'_sum'.length)).sum = m.value
    }
  }

  for (const h of map.values()) {
    h.buckets.sort((a, b) => a.le - b.le)
  }
  return map
}

/**
 * Estimate a quantile (0–1) from a Prometheus histogram using linear
 * interpolation between bucket boundaries. `buckets` must be sorted by
 * `le` ascending (as {@link extractHistograms} returns). `count` is the
 * total observation count; when `null`, the largest bucket count is
 * used as the total.
 *
 * Returns `null` when the distribution cannot be estimated (no buckets
 * or zero observations). When the target rank falls inside the `+Inf`
 * overflow bucket, the last finite bucket boundary is returned as a
 * conservative estimate (one cannot interpolate toward infinity).
 */
export function estimateQuantile(
  buckets: HistogramBucket[],
  count: number | null,
  quantile: number,
): number | null {
  if (buckets.length === 0) return null

  const total = count !== null ? count : buckets[buckets.length - 1].count
  if (total <= 0) return null
  if (quantile <= 0) return 0
  if (quantile >= 1) {
    const lastFinite = lastFiniteBoundary(buckets)
    return lastFinite !== null ? lastFinite : null
  }

  const target = quantile * total
  let prevCount = 0
  let prevLe = 0
  for (const bucket of buckets) {
    if (bucket.count >= target) {
      if (Number.isFinite(bucket.le)) {
        const span = bucket.count - prevCount
        if (span <= 0) return prevLe
        const fraction = (target - prevCount) / span
        return prevLe + fraction * (bucket.le - prevLe)
      }
      // Target falls in the +Inf overflow bucket — anchor on the last
      // finite boundary (cannot interpolate toward infinity).
      return prevLe
    }
    prevCount = bucket.count
    if (Number.isFinite(bucket.le)) prevLe = bucket.le
  }

  // target exceeds every bucket count — return the last finite boundary.
  return lastFiniteBoundary(buckets)
}

/** Upper bound of the last finite bucket, or null if none are finite. */
function lastFiniteBoundary(buckets: HistogramBucket[]): number | null {
  for (let i = buckets.length - 1; i >= 0; i--) {
    if (Number.isFinite(buckets[i].le)) return buckets[i].le
  }
  return null
}
