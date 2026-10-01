// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue'

describe('useDebouncedValue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('initial', 300))
    expect(result.current).toBe('initial')
  })

  it('does not update before the delay', () => {
    const { result } = renderHook(({ val }) => useDebouncedValue(val, 300), {
      initialProps: { val: 'a' },
    })
    act(() => {
      result.current // touch
    })
    vi.advanceTimersByTime(100)
    expect(result.current).toBe('a')
  })

  it('updates after the delay', () => {
    const { result, rerender } = renderHook(({ val }) => useDebouncedValue(val, 300), {
      initialProps: { val: 'a' },
    })
    rerender({ val: 'b' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('b')
  })

  it('only reflects the latest value after rapid changes', () => {
    const { result, rerender } = renderHook(({ val }) => useDebouncedValue(val, 300), {
      initialProps: { val: 'a' },
    })
    rerender({ val: 'b' })
    vi.advanceTimersByTime(100)
    rerender({ val: 'c' })
    vi.advanceTimersByTime(100)
    rerender({ val: 'd' })
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe('d')
  })

  it('works with numbers', () => {
    const { result, rerender } = renderHook(({ val }) => useDebouncedValue(val, 100), {
      initialProps: { val: 0 },
    })
    rerender({ val: 42 })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe(42)
  })
})
