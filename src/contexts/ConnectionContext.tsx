import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type React from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { setActiveConnection } from '@/api/activeConnection'
import { getServerInfo } from '@/api/endpoints'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { useInstanceStore } from '@/stores/instanceStore'
import type { CoreCInstance } from '@/types/models'

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

// Per-instance QueryClient cache. Keyed by instance ID so switching instances
// gives a fresh cache and switching back restores the previous one.
const queryClientCache = new Map<string, QueryClient>()

// Track the last instance whose config store was reset, so navigating away
// and returning to the same instance preserves in-progress edits.
let lastResetInstanceId: string | null = null

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

  // Mirror isConnected to the connection store so api/hooks can read it
  // without importing this context (breaks api↔contexts cycle, TD-ARCH-002).
  const setConnected = useConnectionStore((s) => s.setConnected)
  useEffect(() => {
    setConnected(isConnected)
  }, [isConnected, setConnected])
  useEffect(() => {
    return () => setConnected(false)
  }, [setConnected])

  const queryClient = useMemo(() => getQueryClient(instanceId), [instanceId])

  // Evict the per-instance QueryClient from the module-level cache when the
  // provider unmounts, so deleted/removed instances don't leak QueryClient
  // objects (each holds cached query data) indefinitely.
  useEffect(() => {
    return () => {
      queryClientCache.delete(instanceId)
    }
  }, [instanceId])

  // Reset the config working-copy store when the active instance changes so a
  // stale dirty working config from the previous instance's admin pages doesn't
  // leak into the new one. Track the last-reset instanceId at module scope so
  // leaving and returning to the same instance preserves in-progress edits
  // (the provider unmounts/remounts on navigation, but the store is module-level).
  // biome-ignore lint/correctness/useExhaustiveDependencies: instanceId is an intentional trigger — reset the store only when the instance actually changes, not a value read in the body.
  useEffect(() => {
    if (lastResetInstanceId !== instanceId) {
      useConfigStore.getState().reset()
      lastResetInstanceId = instanceId
    }
  }, [instanceId])

  // Set the active connection whenever the instance changes.
  useEffect(() => {
    if (instance) {
      setActiveConnection({
        instanceId: instance.id,
        baseUrl: instance.baseUrl,
        secret: instance.secret,
        useProxy: instance.useProxy,
      })
    } else {
      setActiveConnection(null)
    }
    return () => {
      setActiveConnection(null)
    }
  }, [instance])

  // Probe the connection.
  // Use primitive deps (id, baseUrl, secret) instead of the full instance object
  // to avoid re-running the probe when setProbeResult updates the store and
  // creates a new instance object reference (which would cancel the in-flight
  // probe and restart it, leaving isConnecting stuck at true / yellow dot).
  // biome-ignore lint/correctness/useExhaustiveDependencies: probeNonce is an intentional re-probe trigger
  useEffect(() => {
    if (!instance) {
      setIsConnecting(false)
      setIsConnected(false)
      setError('Instance not found')
      return
    }

    const instanceId = instance.id
    let cancelled = false
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000)

    setIsConnecting(true)
    setProbing(instanceId, true)

    getServerInfo({ signal: ctrl.signal })
      .then((info) => {
        if (cancelled) return
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
        setServerInfo(info)
        setProbeResult(instanceId, true, info)
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
        setProbeResult(instanceId, false, undefined, errMsg)
      })
      .finally(() => {
        if (!cancelled) setProbing(instanceId, false)
        clearTimeout(timeoutId)
      })

    return () => {
      cancelled = true
      ctrl.abort()
      clearTimeout(timeoutId)
      // Always reset probing on unmount — otherwise the homepage card
      // shows a stuck yellow "connecting" dot after navigating away.
      setProbing(instanceId, false)
    }
  }, [instance?.id, instance?.baseUrl, instance?.secret, probeNonce, setProbeResult, setProbing])

  const reconnect = useCallback(() => setProbeNonce((n) => n + 1), [])

  const ctxValue = useMemo<ConnectionContextValue>(
    () => ({
      instance: instance ?? null,
      isConnected,
      isConnecting,
      error,
      serverInfo,
      reconnect,
    }),
    [instance, isConnected, isConnecting, error, serverInfo, reconnect],
  )

  return (
    <ConnectionContext.Provider value={ctxValue}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ConnectionContext.Provider>
  )
}
