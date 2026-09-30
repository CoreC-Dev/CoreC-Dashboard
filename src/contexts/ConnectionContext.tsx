import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type React from 'react'
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { setActiveConnection } from '@/api/activeConnection'
import { getServerInfo } from '@/api/endpoints'
import type { CoreCInstance } from '@/stores/instanceStore'
import { useInstanceStore } from '@/stores/instanceStore'

export interface ConnectionContextValue {
  /** The active instance (null if not found). */
  instance: CoreCInstance | null
  /** Whether the connection probe succeeded. */
  isConnected: boolean
  /** Whether the connection probe is in flight. */
  isConnecting: boolean
  /** Last connection error message. */
  error: string | null
  /** Server info from the last successful probe. */
  serverInfo: { name?: string; version?: string; status?: string; uptime?: string } | null
  /** Manually re-trigger the connection probe. */
  reconnect: () => void
}

const ConnectionContext = createContext<ConnectionContextValue | null>(null)

/** Hook to access the current instance's connection state. */
export function useConnection(): ConnectionContextValue {
  const ctx = useContext(ConnectionContext)
  if (!ctx) {
    throw new Error('useConnection must be used within a ConnectionProvider')
  }
  return ctx
}

/** Hook for components that may or may not be inside an instance route. */
export function useConnectionSafe(): ConnectionContextValue | null {
  return useContext(ConnectionContext)
}

// Per-instance QueryClient cache. Keyed by instance ID so switching instances
// gives a fresh cache and switching back restores the previous one.
const queryClientCache = new Map<string, QueryClient>()

function getQueryClient(instanceId: string): QueryClient {
  let client = queryClientCache.get(instanceId)
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          refetchOnWindowFocus: false,
          staleTime: 3000,
        },
      },
    })
    queryClientCache.set(instanceId, client)
  }
  return client
}

/**
 * ConnectionProvider — mounts at `/corec/:id/*` and:
 * 1. Looks up the instance by ID from the instance store.
 * 2. Sets the module-level active connection (so apiRequest / WebSocket work).
 * 3. Probes the connection (GET /) and tracks isConnected / isConnecting / error.
 * 4. Provides a per-instance QueryClient so caches are isolated per instance.
 * 5. Cleans up the active connection on unmount (leaving the instance route).
 */
export const ConnectionProvider: React.FC<{
  instanceId: string
  children: React.ReactNode
}> = ({ instanceId, children }) => {
  const instance = useInstanceStore((s) => s.instances.find((i) => i.id === instanceId))
  const setProbeResult = useInstanceStore((s) => s.setProbeResult)
  const setProbing = useInstanceStore((s) => s.setProbing)

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverInfo, setServerInfo] = useState<ConnectionContextValue['serverInfo']>(null)
  const [probeNonce, setProbeNonce] = useState(0)

  const queryClient = useMemo(() => getQueryClient(instanceId), [instanceId])

  // Keep a ref to the current baseUrl+secret so the effect can detect changes.
  const connRef = useRef({ baseUrl: instance?.baseUrl, secret: instance?.secret })

  // Set the active connection whenever the instance changes.
  useEffect(() => {
    if (instance) {
      setActiveConnection({
        instanceId: instance.id,
        baseUrl: instance.baseUrl,
        secret: instance.secret,
      })
      connRef.current = { baseUrl: instance.baseUrl, secret: instance.secret }
    } else {
      setActiveConnection(null)
    }
    return () => {
      setActiveConnection(null)
    }
  }, [instance])

  // Probe the connection.
  // biome-ignore lint/correctness/useExhaustiveDependencies: probeNonce is an intentional re-probe trigger; instance is the full dependency
  useEffect(() => {
    if (!instance) {
      setIsConnecting(false)
      setIsConnected(false)
      setError('Instance not found')
      return
    }

    let cancelled = false
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000)

    setIsConnecting(true)
    setProbing(instance.id, true)

    getServerInfo()
      .then((info) => {
        if (cancelled) return
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
        setServerInfo(info)
        setProbeResult(instance.id, true, info)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const errMsg =
          err instanceof Error
            ? err.name === 'AbortError'
              ? 'Connection timed out'
              : err.message
            : 'Connection failed'
        setIsConnected(false)
        setIsConnecting(false)
        setError(errMsg)
        setProbeResult(instance.id, false, undefined, errMsg)
      })
      .finally(() => {
        if (!cancelled) setProbing(instance.id, false)
        clearTimeout(timeoutId)
      })

    return () => {
      cancelled = true
      ctrl.abort()
      clearTimeout(timeoutId)
    }
  }, [instance, probeNonce, setProbeResult, setProbing])

  const reconnect = () => setProbeNonce((n) => n + 1)

  const ctxValue: ConnectionContextValue = {
    instance: instance ?? null,
    isConnected,
    isConnecting,
    error,
    serverInfo,
    reconnect,
  }

  return (
    <ConnectionContext.Provider value={ctxValue}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConnectionContext.Provider>
  )
}
