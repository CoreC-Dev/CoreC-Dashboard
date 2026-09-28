import { describe, expect, it } from 'vitest'
import { parsePrometheusMetrics } from './prometheus'

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
