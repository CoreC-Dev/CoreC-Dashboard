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
})
