// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useConfigHistory } from '@/hooks/useConfigHistory'

describe('useConfigHistory', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('starts with empty history when localStorage is empty', () => {
    const { result } = renderHook(() => useConfigHistory())
    expect(result.current.history).toEqual([])
  })

  it('adds a snapshot and persists to localStorage', () => {
    const { result } = renderHook(() => useConfigHistory())
    act(() => {
      result.current.addSnapshot('yaml: test', 'PUT /configs')
    })
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].yaml).toBe('yaml: test')
    expect(result.current.history[0].action).toBe('PUT /configs')
    expect(result.current.history[0].timestamp).toBeTypeOf('number')
    const stored = JSON.parse(localStorage.getItem('corec_config_history') || '[]')
    expect(stored).toHaveLength(1)
  })

  it('caps history at 10 entries', () => {
    const { result } = renderHook(() => useConfigHistory())
    for (let i = 0; i < 15; i++) {
      act(() => {
        result.current.addSnapshot(`yaml-${i}`)
      })
    }
    expect(result.current.history).toHaveLength(10)
    // Most recent first
    expect(result.current.history[0].yaml).toBe('yaml-14')
  })

  it('loads existing history from localStorage on init', () => {
    const existing = [{ timestamp: 1000, yaml: 'old-yaml', action: 'PUT /configs' }]
    localStorage.setItem('corec_config_history', JSON.stringify(existing))
    const { result } = renderHook(() => useConfigHistory())
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].yaml).toBe('old-yaml')
  })

  it('tolerates malformed localStorage data', () => {
    localStorage.setItem('corec_config_history', 'not-json')
    const { result } = renderHook(() => useConfigHistory())
    expect(result.current.history).toEqual([])
  })

  it('filters out entries with wrong shape', () => {
    const malformed = [
      { timestamp: 1000, yaml: 'valid', action: 'PUT /configs' },
      { timestamp: 'not-a-number', yaml: 'invalid' },
      { yaml: 'missing-timestamp' },
      null,
    ]
    localStorage.setItem('corec_config_history', JSON.stringify(malformed))
    const { result } = renderHook(() => useConfigHistory())
    expect(result.current.history).toHaveLength(1)
    expect(result.current.history[0].yaml).toBe('valid')
  })
})
