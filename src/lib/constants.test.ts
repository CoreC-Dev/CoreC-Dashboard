import { describe, expect, it } from 'vitest'
import {
  ConnState,
  ConnStateLabel,
  DataTypeMap,
  DEFAULT_COREC_URL,
  DriverProtocols,
  Quality,
  QualityLabel,
  TransportProtocols,
} from './constants'

describe('DataTypeMap', () => {
  it('maps numeric type codes to string names', () => {
    expect(DataTypeMap[0]).toBe('bool')
    expect(DataTypeMap[9]).toBe('float32')
    expect(DataTypeMap[10]).toBe('float64')
    expect(DataTypeMap[11]).toBe('string')
  })

  it('has 13 data types (0-12)', () => {
    expect(Object.keys(DataTypeMap)).toHaveLength(13)
  })
})

describe('Quality', () => {
  it('has correct numeric values', () => {
    expect(Quality.Good).toBe(0)
    expect(Quality.Bad).toBe(1)
    expect(Quality.Uncertain).toBe(2)
  })
})

describe('QualityLabel', () => {
  it('has i18n keys for all quality levels', () => {
    expect(QualityLabel[Quality.Good].key).toBe('common.good')
    expect(QualityLabel[Quality.Bad].key).toBe('common.bad')
    expect(QualityLabel[Quality.Uncertain].key).toBe('common.uncertain')
  })

  it('has color classes for all quality levels', () => {
    expect(QualityLabel[Quality.Good].color).toContain('emerald')
    expect(QualityLabel[Quality.Bad].color).toContain('rose')
    expect(QualityLabel[Quality.Uncertain].color).toContain('amber')
  })
})

describe('ConnState', () => {
  it('has correct numeric values', () => {
    expect(ConnState.Disconnected).toBe(0)
    expect(ConnState.Connecting).toBe(1)
    expect(ConnState.Connected).toBe(2)
    expect(ConnState.Error).toBe(3)
  })
})

describe('ConnStateLabel', () => {
  it('has i18n keys for all connection states', () => {
    expect(ConnStateLabel[ConnState.Disconnected].key).toBe('common.disconnected')
    expect(ConnStateLabel[ConnState.Connecting].key).toBe('common.connecting')
    expect(ConnStateLabel[ConnState.Connected].key).toBe('common.connected')
    expect(ConnStateLabel[ConnState.Error].key).toBe('common.error')
  })

  it('has dot colors for all connection states', () => {
    expect(ConnStateLabel[ConnState.Disconnected].dotColor).toContain('bg-')
    expect(ConnStateLabel[ConnState.Connected].dotColor).toContain('bg-emerald')
  })
})

describe('DriverProtocols', () => {
  it('includes modbus-tcp', () => {
    expect(DriverProtocols.some((p) => p.value === 'modbus-tcp')).toBe(true)
  })

  it('includes s7 and opcua', () => {
    expect(DriverProtocols.some((p) => p.value === 's7')).toBe(true)
    expect(DriverProtocols.some((p) => p.value === 'opcua')).toBe(true)
  })

  it('has value and label for each protocol', () => {
    for (const p of DriverProtocols) {
      expect(p.value).toBeTruthy()
      expect(p.label).toBeTruthy()
    }
  })
})

describe('TransportProtocols', () => {
  it('includes mqtt and http', () => {
    expect(TransportProtocols.some((p) => p.value === 'mqtt')).toBe(true)
    expect(TransportProtocols.some((p) => p.value === 'http')).toBe(true)
  })
})

describe('DEFAULT_COREC_URL', () => {
  it('points to localhost:9090', () => {
    expect(DEFAULT_COREC_URL).toBe('http://127.0.0.1:9090')
  })
})
