import { describe, expect, it } from 'vitest'
import { estimateQuantile, extractHistograms, parsePrometheusMetrics } from '@/lib/prometheus'

describe('parsePrometheusMetrics', () => {
  it('parses gauge and counter metrics correctly', () => {
    const raw = `
# HELP corec_goroutines Number of goroutines currently existing.
# TYPE corec_goroutines gauge
corec_goroutines 24
corec_mem_heap_alloc_bytes 10485760
corec_driver_read_total{driver="plc1",type="modbus-tcp"} 1250
`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed).toHaveLength(3)

    expect(parsed[0].name).toBe('corec_goroutines')
    expect(parsed[0].value).toBe(24)

    expect(parsed[2].name).toBe('corec_driver_read_total')
    expect(parsed[2].labels).toEqual({ driver: 'plc1', type: 'modbus-tcp' })
    expect(parsed[2].value).toBe(1250)
  })

  it('returns empty array for empty input', () => {
    expect(parsePrometheusMetrics('')).toEqual([])
  })

  it('skips comment lines (# HELP, # TYPE)', () => {
    const raw = `# HELP corec_foo Some metric.
# TYPE corec_foo counter
corec_foo 42
`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('corec_foo')
    expect(parsed[0].value).toBe(42)
  })

  it('skips blank lines', () => {
    const raw = `

corec_goroutines 5

`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].value).toBe(5)
  })

  it('parses metrics without labels', () => {
    const raw = `corec_goroutines 10\ncorec_gc_cycles 3\n`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].labels).toEqual({})
    expect(parsed[1].labels).toEqual({})
  })

  it('parses float values', () => {
    const raw = `corec_read_latency_seconds 0.045\n`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed[0].value).toBe(0.045)
  })

  it('parses multiple labels', () => {
    const raw = `http_requests_total{method="POST",handler="/api/write",status="200"} 1042\n`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed[0].labels).toEqual({
      method: 'POST',
      handler: '/api/write',
      status: '200',
    })
  })

  it('skips lines that do not match the metric pattern', () => {
    const raw = `not a metric line\ncorec_valid 1\n123invalid 2\n`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('corec_valid')
  })

  it('handles metric names with underscores and colons', () => {
    const raw = `corec:custom:metric 7\n`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('corec:custom:metric')
  })

  it('handles negative values', () => {
    const raw = `corec_temperature_celsius -15.3\n`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed[0].value).toBe(-15.3)
  })

  it('handles scientific notation values', () => {
    const raw = `corec_nanoseconds 1.5e9\n`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed[0].value).toBe(1.5e9)
  })

  // ─── M-4 regression: `}` inside quoted label values ──────────────
  it('parses labels with } inside quoted values', () => {
    const raw = `my_metric{label="value_}"} 1\n`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('my_metric')
    expect(parsed[0].labels).toEqual({ label: 'value_}' })
    expect(parsed[0].value).toBe(1)
  })

  it('parses labels with escaped quotes inside values', () => {
    const raw = `m{k="a\\"b"} 5\n`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].labels).toEqual({ k: 'a"b' })
  })

  it('parses multiple labels with special chars', () => {
    const raw = `m{a="x}1",b="y}2"} 10\n`
    const parsed = parsePrometheusMetrics(raw)
    expect(parsed[0].labels).toEqual({ a: 'x}1', b: 'y}2' })
  })
})

describe('extractHistograms', () => {
  it('collects _bucket, _count, _sum into a histogram', () => {
    const raw = `
corec_read_latency_seconds_bucket{le="0.001"} 2
corec_read_latency_seconds_bucket{le="0.01"} 5
corec_read_latency_seconds_bucket{le="0.1"} 8
corec_read_latency_seconds_bucket{le="+Inf"} 10
corec_read_latency_seconds_count 10
corec_read_latency_seconds_sum 0.25
`
    const hists = extractHistograms(parsePrometheusMetrics(raw))
    const h = hists.get('corec_read_latency_seconds')
    expect(h).toBeDefined()
    expect(h?.count).toBe(10)
    expect(h?.sum).toBe(0.25)
    expect(h?.buckets).toEqual([
      { le: 0.001, count: 2 },
      { le: 0.01, count: 5 },
      { le: 0.1, count: 8 },
      { le: Infinity, count: 10 },
    ])
  })

  it('sorts buckets by le ascending (+Inf last)', () => {
    const raw = `
corec_x_bucket{le="+Inf"} 3
corec_x_bucket{le="0.1"} 3
corec_x_bucket{le="0.001"} 1
`
    const h = extractHistograms(parsePrometheusMetrics(raw)).get('corec_x')!
    expect(h.buckets.map((b) => b.le)).toEqual([0.001, 0.1, Infinity])
  })

  it('skips _bucket lines without an le label', () => {
    const raw = `corec_x_bucket 5\n`
    // No le label → the bucket line is dropped and no histogram entry
    // is created for the base name.
    expect(extractHistograms(parsePrometheusMetrics(raw)).has('corec_x')).toBe(false)
  })

  it('creates an entry from _count/_sum even without buckets', () => {
    const raw = `
corec_x_count 7
corec_x_sum 1.4
`
    const h = extractHistograms(parsePrometheusMetrics(raw)).get('corec_x')!
    expect(h.count).toBe(7)
    expect(h.sum).toBe(1.4)
    expect(h.buckets).toEqual([])
  })

  it('returns an empty map for metrics without histograms', () => {
    const raw = `corec_goroutines 5\n`
    expect(extractHistograms(parsePrometheusMetrics(raw)).size).toBe(0)
  })

  it('handles multiple independent histograms', () => {
    const raw = `
corec_a_bucket{le="0.1"} 1
corec_a_bucket{le="+Inf"} 2
corec_b_bucket{le="0.5"} 3
corec_b_bucket{le="+Inf"} 3
`
    const hists = extractHistograms(parsePrometheusMetrics(raw))
    expect(hists.size).toBe(2)
    expect(hists.get('corec_a')?.buckets).toHaveLength(2)
    expect(hists.get('corec_b')?.buckets).toHaveLength(2)
  })
})

describe('estimateQuantile', () => {
  // Cumulative buckets: 2 obs ≤ 0.001, 5 ≤ 0.01, 8 ≤ 0.1, 10 ≤ +Inf
  const buckets = [
    { le: 0.001, count: 2 },
    { le: 0.01, count: 5 },
    { le: 0.1, count: 8 },
    { le: Infinity, count: 10 },
  ]

  it('returns null for empty buckets', () => {
    expect(estimateQuantile([], 10, 0.5)).toBeNull()
  })

  it('returns null for zero count', () => {
    expect(estimateQuantile(buckets, 0, 0.5)).toBeNull()
  })

  it('estimates p50 with linear interpolation', () => {
    // total=10, target=5. Bucket le=0.01 reaches count 5 (>=5).
    // prevCount=2, prevLe=0.001, span=3, fraction=(5-2)/3=1 → 0.001+1*(0.01-0.001)=0.01
    expect(estimateQuantile(buckets, 10, 0.5)).toBeCloseTo(0.01)
  })

  it('estimates p95 falling in the +Inf bucket as the last finite boundary', () => {
    // target=9.5 → +Inf bucket (count 10 >= 9.5) → return prevLe=0.1
    expect(estimateQuantile(buckets, 10, 0.95)).toBeCloseTo(0.1)
  })

  it('estimates p99 falling in the +Inf bucket as the last finite boundary', () => {
    expect(estimateQuantile(buckets, 10, 0.99)).toBeCloseTo(0.1)
  })

  it('interpolates within the first bucket', () => {
    // target=1 (p10). First bucket le=0.001 count=2 >=1.
    // prevCount=0, prevLe=0, span=2, fraction=0.5 → 0.5*0.001=0.0005
    expect(estimateQuantile(buckets, 10, 0.1)).toBeCloseTo(0.0005)
  })

  it('uses the +Inf bucket count when count is null', () => {
    expect(estimateQuantile(buckets, null, 0.5)).toBeCloseTo(0.01)
  })

  it('returns 0 for quantile <= 0', () => {
    expect(estimateQuantile(buckets, 10, 0)).toBe(0)
  })

  it('returns the last finite boundary for quantile >= 1', () => {
    expect(estimateQuantile(buckets, 10, 1)).toBeCloseTo(0.1)
  })
})
