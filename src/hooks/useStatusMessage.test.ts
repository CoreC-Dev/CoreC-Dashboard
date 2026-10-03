// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStatusMessage } from '@/hooks/useStatusMessage'

describe('useStatusMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts with null status', () => {
    const { result } = renderHook(() => useStatusMessage())
    expect(result.current.statusMsg).toBeNull()
  })

  it('sets a status message', () => {
    const { result } = renderHook(() => useStatusMessage())
    act(() => {
      result.current.setStatusMsg({ type: 'success', text: 'Saved' })
    })
    expect(result.current.statusMsg).toEqual({ type: 'success', text: 'Saved' })
  })

  it('auto-dismisses after the timeout', () => {
    const { result } = renderHook(() => useStatusMessage(1000))
    act(() => {
      result.current.setStatusMsg({ type: 'error', text: 'Failed' })
    })
    expect(result.current.statusMsg).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.statusMsg).toBeNull()
  })

  it('replaces previous message when a new one is set', () => {
    const { result } = renderHook(() => useStatusMessage(10000))
    act(() => {
      result.current.setStatusMsg({ type: 'success', text: 'First' })
    })
    act(() => {
      result.current.setStatusMsg({ type: 'error', text: 'Second' })
    })
    expect(result.current.statusMsg).toEqual({ type: 'error', text: 'Second' })
  })

  it('can clear status by setting null', () => {
    const { result } = renderHook(() => useStatusMessage(10000))
    act(() => {
      result.current.setStatusMsg({ type: 'success', text: 'Saved' })
    })
    act(() => {
      result.current.setStatusMsg(null)
    })
    expect(result.current.statusMsg).toBeNull()
  })
})
