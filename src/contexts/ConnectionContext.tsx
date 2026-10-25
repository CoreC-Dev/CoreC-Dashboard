import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type React from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { setActiveConnection } from '@/api/activeConnection'
import { ApiError, apiRequest } from '@/api/client'
import { getServerInfo } from '@/api/endpoints'
import { useConfigStore } from '@/stores/configStore'
import { useConnectionStore } from '@/stores/connectionStore'
import type { ProbeErrorKind } from '@/stores/instanceStore'
import { PROBE_ERROR_I18N_KEYS, useInstanceStore } from '@/stores/instanceStore'
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

/**
 * Sink the currently-mounted provider registers so the shared
 * per-instance QueryClient caches can notify it when a query or mutation
 * is answered with 401. Only one provider is mounted at a time (the
 * per-instance route tree), so a module-level ref is sufficient.
 */
let notifyAuthExpired: (() => void) | null = null

/** In-instance re-probe cadence, aligned with the homepage probe. */
const PROBE_INTERVAL_MS = 15_000

/**
 * Classify a probe/transport failure into the store's probe-error kind
 *: a 401 from the authenticated endpoint means the API key is
 * wrong; an abort means the probe timed out; anything else (DNS/CORS/
 * connection refused/5xx) means the instance is unreachable.
 */
function probeErrorKindOf(err: unknown): ProbeErrorKind {
  if (err instanceof ApiError && err.status === 401) return 'unauthorized'
  // Duck-typed on `.name`: DOMException (fetch's abort rejection) does
  // not extend Error in every runtime.
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as { name?: unknown }).name === 'AbortError'
  ) {
    return 'timeout'
  }
  return 'unreachable'
}

function getQueryClient(instanceId: string): QueryClient {
  let client = queryClientCache.get(instanceId)
  if (!client) {
    // Any query or mutation answered with 401 flips the provider
    // into the auth-expired state — a key that stops being accepted
    // mid-session must not leave the operator on a silent zombie UI
    // where every request fails but the indicator stays green.
    const onCacheError = (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) notifyAuthExpired?.()
    }
    client = new QueryClient({
      defaultOptions: {
        queries: {
          retry: 1,
          refetchOnWindowFocus: false,
          staleTime: 3000,
        },
      },
      queryCache: new QueryCache({ onError: onCacheError }),
      mutationCache: new MutationCache({ onError: onCacheError }),
    })
    queryClientCache.set(instanceId, client)
  }
  return client
}

/**
 * Full-screen overlay for the auth-expired state. Rendered by the
 * provider INSTEAD of the children, so the whole instance UI is replaced
 * by one actionable prompt: re-enter the key, or go back to the list.
 * Deliberately raw HTML — contexts sit below the components layer in the
 * dependency hierarchy (structure-lint), so components/ui is off-limits.
 */
const AuthExpiredOverlay: React.FC<{
  isReconnecting: boolean
  onReconnect: (secret: string) => void
  onBack: () => void
}> = ({ isReconnecting, onReconnect, onBack }) => {
  const { t } = useTranslation()
  const [secret, setSecret] = useState('')
  // Mirrors instanceSchema's secret minimum (InstanceDialog) so the overlay
  // cannot submit a key the dialog itself would reject.
  const canSubmit = secret.trim().length >= 8 && !isReconnecting

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4">
      <div className="w-full max-w-md rounded-lg squircle border border-border bg-card p-6 space-y-4 shadow-lg">
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-status-error">
            {t('connection.authExpiredTitle')}
          </h2>
          <p className="text-sm text-muted-foreground">{t('connection.authExpiredDesc')}</p>
        </div>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (canSubmit) onReconnect(secret)
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="corec-reauth-secret" className="text-sm font-medium">
              {t('instances.secretToken')}
            </label>
            <input
              id="corec-reauth-secret"
              type="password"
              autoComplete="off"
              placeholder="********"
              className="flex h-9 w-full rounded-md border border-input bg-muted/40 px-3 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onBack}
              className="btn-ripple inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full border border-border bg-card px-5 text-sm font-semibold transition-colors hover:bg-accent hover:text-accent-foreground hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 select-none cursor-pointer"
            >
              {t('connection.backToInstances')}
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="btn-ripple btn-lime inline-flex h-9 items-center justify-center whitespace-nowrap rounded-full px-5 text-sm font-semibold text-primary-foreground transition-colors hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground/50 disabled:pointer-events-none disabled:opacity-50 select-none cursor-pointer"
            >
              {t('connection.reconnect')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * ConnectionProvider — mounts at `/corec/:id/*` and:
 * 1. Looks up the instance by ID from the instance store.
 * 2. Sets the module-level active connection (so apiRequest / WebSocket work).
 * 3. Probes the connection with an authenticated GET /stats (verifies the
 * address AND the API key) on mount and every 15s, tracking
 * isConnected / isConnecting / error.
 * 4. Provides a per-instance QueryClient so caches are isolated per instance;
 * its QueryCache/MutationCache report 401s back to the provider, which
 * swaps the whole UI for a re-enter-key overlay.
 * 5. Cleans up the active connection on unmount (leaving the instance route).
 */
export const ConnectionProvider: React.FC<{
  instanceId: string
  children: React.ReactNode
}> = ({ instanceId, children }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const instance = useInstanceStore((s) => s.instances.find((i) => i.id === instanceId))
  const setProbeResult = useInstanceStore((s) => s.setProbeResult)
  const setProbing = useInstanceStore((s) => s.setProbing)
  const updateInstance = useInstanceStore((s) => s.updateInstance)

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [serverInfo, setServerInfo] = useState<ConnectionContextValue['serverInfo']>(null)
  const [probeNonce, setProbeNonce] = useState(0)
  // Set when the API key is rejected (probe or any query/mutation 401);
  // the provider then renders the re-enter-key overlay instead of the app.
  const [authExpired, setAuthExpired] = useState(false)

  // Mirror isConnected to the connection store so api/hooks can read it
  // without importing this context (breaks api↔contexts cycle).
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
  // No biome-ignore needed: the only reactive value read here is instanceId
  // itself (lastResetInstanceId and useConfigStore are module-level), so the
  // [instanceId] dep list is exhaustive.
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

  // Register the 401 sink so the per-instance QueryClient caches
  // (created at module level, shared across mounts) can flip THIS provider
  // into the auth-expired state. Only one provider is mounted at a time.
  useEffect(() => {
    notifyAuthExpired = () => {
      setIsConnected(false)
      setAuthExpired(true)
      setProbeResult(instanceId, false, undefined, 'unauthorized')
    }
    return () => {
      notifyAuthExpired = null
    }
  }, [instanceId, setProbeResult])

  // Re-probe on the same 15s cadence as the homepage probe so a
  // backend that goes down — or a key that stops being accepted — flips
  // the in-instance indicator within one interval instead of keeping the
  // green dot lit forever. Each nonce bump aborts and restarts the probe
  // effect below; a healthy connection does not flicker (the verdict only
  // changes when a probe actually fails).
  useEffect(() => {
    const intervalId = setInterval(() => setProbeNonce((n) => n + 1), PROBE_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [])

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
      // No raw English error strings in a localized UI — ConnectionGate
      // renders this text verbatim, so it must come from the language pack.
      setError(t('connection.errInstance'))
      return
    }

    const instanceId = instance.id
    let cancelled = false
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), 10_000)

    setIsConnecting(true)
    setProbing(instanceId, true)

    // The probe hits GET /stats, which sits inside CoreC's Bearer
    // auth group (hub/route/router.go) — one request proves both the
    // address (network reachable) and the API key (200 vs 401). GET /
    // (public) is fetched in parallel purely to enrich serverInfo and the
    // homepage card; its failure does not affect the connection verdict.
    Promise.allSettled([
      apiRequest('/stats', { signal: ctrl.signal }),
      getServerInfo({ signal: ctrl.signal }),
    ])
      .then(([statsRes, infoRes]) => {
        if (cancelled) return
        if (statsRes.status === 'rejected') {
          const kind = probeErrorKindOf(statsRes.reason)
          setIsConnected(false)
          setIsConnecting(false)
          setError(t(PROBE_ERROR_I18N_KEYS[kind]))
          // A rejected key gets the full-screen re-enter-key path
          // rather than a bare error line with no way to fix it.
          setAuthExpired(kind === 'unauthorized')
          setProbeResult(instanceId, false, undefined, kind)
          return
        }
        setIsConnected(true)
        setIsConnecting(false)
        setError(null)
        setAuthExpired(false)
        const info = infoRes.status === 'fulfilled' ? infoRes.value : null
        setServerInfo(info)
        setProbeResult(instanceId, true, info ?? undefined)
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
  }, [instance?.id, instance?.baseUrl, instance?.secret, probeNonce, setProbeResult, setProbing, t])

  const reconnect = useCallback(() => setProbeNonce((n) => n + 1), [])

  /**
   * Recover from the auth-expired state. Persisting the new secret
   * updates the store instance, which re-runs the active-connection effect
   * (so apiRequest sends the new Bearer token) and re-triggers the probe;
   * the explicit nonce bump also covers re-submitting an unchanged value.
   */
  const handleReconnectWithSecret = useCallback(
    (secret: string) => {
      if (!instance) return
      const trimmed = secret.trim()
      if (trimmed.length < 8) return
      updateInstance(instance.id, { secret: trimmed })
      setAuthExpired(false)
      setProbeNonce((n) => n + 1)
    },
    [instance, updateInstance],
  )

  const handleBackToInstances = useCallback(() => navigate('/'), [navigate])

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
      <QueryClientProvider client={queryClient}>
        {authExpired && instance ? (
          <AuthExpiredOverlay
            isReconnecting={isConnecting}
            onReconnect={handleReconnectWithSecret}
            onBack={handleBackToInstances}
          />
        ) : (
          children
        )}
      </QueryClientProvider>
    </ConnectionContext.Provider>
  )
}
