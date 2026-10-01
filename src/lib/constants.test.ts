import { describe, expect, it } from 'vitest'
import { ConnState, ConnStateLabel, DEFAULT_COREC_URL, Quality, QualityLabel } from './constants'

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

describe('DEFAULT_COREC_URL', () => {
  it('points to localhost:9090', () => {
    expect(DEFAULT_COREC_URL).toBe('http://127.0.0.1:9090')
  })
})
