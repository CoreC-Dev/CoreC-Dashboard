// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it } from 'vitest'
import { useTagWrite } from '@/hooks/useTagWrite'
import type { DataPoint } from '@/types/models'

const point = (over: Partial<DataPoint> = {}): DataPoint => ({
  driver: 'plc1',
  device: '',
  tag: 'pump',
  value: null,
  type: 'string',
  quality: 0,
  timestamp: '2026-01-01T12:00:00Z',
  ...over,
})

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

describe('useTagWrite prefill', () => {
  it('does not turn a never-collected null into the literal "null"', () => {
    const { result } = renderHook(() => useTagWrite(), { wrapper })

    act(() => result.current.openWrite(point({ value: null })))

    expect(result.current.writeValue).toBe('')
  })

  it('still prefills a real value', () => {
    const { result } = renderHook(() => useTagWrite(), { wrapper })

    act(() => result.current.openWrite(point({ value: 42, type: 'int16' })))

    expect(result.current.writeValue).toBe('42')
  })
})
