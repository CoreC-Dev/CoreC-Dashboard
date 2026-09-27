import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Mock fetch for revalidate tests
const mockFetch = vi.fn()
globalThis.fetch = mockFetch as unknown as typeof globalThis.fetch

// Import store once — it's a singleton
import { useConnectionStore } from './connectionStore'

// Reset helper: restores the store to a clean disconnected state
const resetStore = () => {
  useConnectionStore.setState({
    baseUrl: 'http://127.0.0.1:9090',
    secret: '',
    isConnected: false,
    isConnecting: false,
    lastError: null,
    serverVersion: null,
    serverName: null,
  })
}

describe('useConnectionStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    mockFetch.mockReset()
    resetStore()
  })

  it('initializes with default URL and no secret', () => {
    const state = useConnectionStore.getState()
    expect(state.baseUrl).toBe('http://127.0.0.1:9090')
    expect(state.secret).toBe('')
    expect(state.isConnected).toBe(false)
  })

  it('setConnection stores cleaned URL and secret in localStorage', () => {
    useConnectionStore.getState().setConnection('http://example.com:9090///', 'mysecret')
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'corec_connection',
      JSON.stringify({ baseUrl: 'http://example.com:9090', secret: 'mysecret' }),
    )
    expect(useConnectionStore.getState().baseUrl).toBe('http://example.com:9090')
    expect(useConnectionStore.getState().secret).toBe('mysecret')
    expect(useConnectionStore.getState().lastError).toBeNull()
  })

  it('setConnection trims trailing slashes from URL', () => {
    useConnectionStore.getState().setConnection('  http://example.com:9090/  ', 'secret')
    expect(useConnectionStore.getState().baseUrl).toBe('http://example.com:9090')
  })

  it('setConnected sets server info and clears connecting state', () => {
    useConnectionStore.getState().setConnected(true, { name: 'corec-node', version: '1.0.0' })
    const state = useConnectionStore.getState()
    expect(state.isConnected).toBe(true)
    expect(state.isConnecting).toBe(false)
    expect(state.serverName).toBe('corec-node')
    expect(state.serverVersion).toBe('1.0.0')
    expect(state.lastError).toBeNull()
  })

  it('setConnected(false) sets error message', () => {
    useConnectionStore.getState().setConnected(false)
    expect(useConnectionStore.getState().isConnected).toBe(false)
    expect(useConnectionStore.getState().isConnecting).toBe(false)
    expect(useConnectionStore.getState().lastError).toBe('Disconnected')
  })

  it('setError clears connection and connecting states', () => {
    useConnectionStore.getState().setConnected(true, { name: 'node' })
    useConnectionStore.getState().setError('Something went wrong')
    const state = useConnectionStore.getState()
    expect(state.isConnected).toBe(false)
    expect(state.isConnecting).toBe(false)
    expect(state.lastError).toBe('Something went wrong')
  })

  it('clearAuth removes localStorage and resets auth state', () => {
    useConnectionStore.getState().setConnection('http://example.com:9090', 'secret')
    useConnectionStore.getState().clearAuth()
    const state = useConnectionStore.getState()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('corec_connection')
    expect(state.secret).toBe('')
    expect(state.isConnected).toBe(false)
    expect(state.isConnecting).toBe(false)
    expect(state.serverName).toBeNull()
    expect(state.serverVersion).toBeNull()
    expect(state.lastError).toContain('Authentication failed')
  })

  it('disconnect removes localStorage and clears all state', () => {
    useConnectionStore.getState().setConnection('http://example.com:9090', 'secret')
    useConnectionStore.getState().setConnected(true, { name: 'node', version: '1.0' })
    useConnectionStore.getState().disconnect()
    const state = useConnectionStore.getState()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('corec_connection')
    expect(state.secret).toBe('')
    expect(state.isConnected).toBe(false)
    expect(state.isConnecting).toBe(false)
    expect(state.serverName).toBeNull()
    expect(state.lastError).toBeNull()
  })

  it('revalidate does nothing when no secret is set', async () => {
    await useConnectionStore.getState().revalidate()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(useConnectionStore.getState().isConnecting).toBe(false)
  })

  it('revalidate succeeds and sets connected state', async () => {
    useConnectionStore.setState({
      baseUrl: 'http://localhost:9090',
      secret: 'test123',
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ name: 'corec-prod', version: '2.1.0' }),
    })
    await useConnectionStore.getState().revalidate()
    const state = useConnectionStore.getState()
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:9090/',
      expect.objectContaining({
        headers: { Authorization: 'Bearer test123' },
        signal: expect.any(AbortSignal),
      }),
    )
    expect(state.isConnected).toBe(true)
    expect(state.isConnecting).toBe(false)
    expect(state.serverName).toBe('corec-prod')
    expect(state.serverVersion).toBe('2.1.0')
  })

  it('revalidate handles non-ok response', async () => {
    useConnectionStore.setState({
      baseUrl: 'http://localhost:9090',
      secret: 'test123',
    })
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    await useConnectionStore.getState().revalidate()
    const state = useConnectionStore.getState()
    expect(state.isConnected).toBe(false)
    expect(state.isConnecting).toBe(false)
    expect(state.lastError).toContain('401')
  })

  it('revalidate handles fetch errors', async () => {
    useConnectionStore.setState({
      baseUrl: 'http://localhost:9090',
      secret: 'test123',
    })
    mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await useConnectionStore.getState().revalidate()
    const state = useConnectionStore.getState()
    expect(state.isConnected).toBe(false)
    expect(state.isConnecting).toBe(false)
    expect(state.lastError).toBe('Failed to fetch')
  })
})
