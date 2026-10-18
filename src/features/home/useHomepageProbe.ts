import { useEffect, useRef } from 'react'
import { resolveProxyMode } from '@/api/proxyMode'
import { getDriverConnectionSummary, getTransportConnectionSummary } from '@/lib/connectionInfo'
import type { ProbeErrorKind } from '@/stores/instanceStore'
import { useInstanceStore } from '@/stores/instanceStore'
import type { CoreCConfig } from '@/types/config'
import type { CoreCInstance } from '@/types/models'

/**
 * Homepage probe — periodically checks ALL instances in parallel.
 *
 * For each instance, fetches GET / (server info) + GET /stats (engine stats)
 * + GET /tags (tag count) and stores the results in lastKnownInfo so the
 * InstanceCard can display live metrics.
 *
 * A-01: /stats lives inside CoreC's Bearer auth group (hub/route/router.go)
 * while GET / is public — a 401 on /stats with a healthy GET / means the
 * address is right but the API key is wrong, and is recorded distinctly
 * from an unreachable server.
 *
 * This is the "simultaneous multi-instance monitor" — all instances are
 * probed in parallel every REFRESH_INTERVAL ms.
 */

const REFRESH_INTERVAL = 15_000 // 15 seconds
const REQUEST_TIMEOUT = 8_000 // 8 seconds per request

/** Probe failure carrying a machine-readable kind (stored, translated at render). */
class ProbeError extends Error {
  constructor(readonly kind: ProbeErrorKind) {
    super(kind)
  }
}

/**
 * True when a fetch rejection was caused by an abort (timeout / unmount).
 * Duck-typed on `.name` because DOMException (what fetch rejects with on
 * abort) does not extend Error in every runtime.
 */
function isAbortError(reason: unknown): boolean {
  return (
    typeof reason === 'object' &&
    reason !== null &&
    (reason as { name?: unknown }).name === 'AbortError'
  )
}

interface StatsData {
  drivers: number
  transports: number
  rules: number
  total_read: number
  total_publish: number
  total_errors: number
  total_dropped: number
  points_per_sec: number
  tag_count?: number
  driver_stats?: Record<
    string,
    {
      name: string
      type: string
      state: number
      tag_count: number
      read_count: number
      error_count: number
    }
  >
  transport_stats?: Record<
    string,
    {
      name: string
      type: string
      state: number
      published: number
      received: number
      failed: number
    }
  >
}

async function fetchWithTimeout(
  url: string,
  opts: RequestInit = {},
  timeoutMs = REQUEST_TIMEOUT,
  parentSignal?: AbortSignal,
): Promise<Response> {
  const ctrl = new AbortController()
  const timeoutId = setTimeout(() => ctrl.abort(), timeoutMs)
  // Propagate parent abort (e.g. unmount) to this individual request
  if (parentSignal) {
    if (parentSignal.aborted) ctrl.abort()
    else parentSignal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function probeInstance(
  instance: CoreCInstance,
  signal?: AbortSignal,
): Promise<CoreCInstance['lastKnownInfo']> {
  const base = instance.baseUrl.trim().replace(/\/+$/, '')
  const proxyMode = resolveProxyMode(instance.useProxy)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${instance.secret}`,
  }
  if (proxyMode === 'proxy') {
    headers['X-CoreC-Target'] = base
  }

  // Build URL prefix: /corec-proxy in proxy mode, baseUrl in direct mode.
  const urlPrefix = proxyMode === 'proxy' ? '/corec-proxy' : base

  // Fetch GET / and GET /stats and GET /tags and GET /rules and GET /configs/raw in parallel
  const [infoRes, statsRes, tagsRes, rulesRes, rawCfgRes] = await Promise.allSettled([
    fetchWithTimeout(`${urlPrefix}/`, { headers }, REQUEST_TIMEOUT, signal),
    fetchWithTimeout(`${urlPrefix}/stats`, { headers }, REQUEST_TIMEOUT, signal),
    fetchWithTimeout(`${urlPrefix}/tags`, { headers }, REQUEST_TIMEOUT, signal),
    fetchWithTimeout(`${urlPrefix}/rules`, { headers }, REQUEST_TIMEOUT, signal),
    fetchWithTimeout(`${urlPrefix}/configs/raw`, { headers }, REQUEST_TIMEOUT, signal),
  ])

  // GET / must succeed — otherwise the instance is unreachable
  if (infoRes.status !== 'fulfilled' || !infoRes.value.ok) {
    // A rejected fetch means either the 8s timeout / unmount abort fired
    // (AbortError) or the network/DNS/CORS layer failed — keep the two
    // distinguishable (A-01: timeout vs wrong address).
    if (infoRes.status === 'rejected' && isAbortError(infoRes.reason)) {
      throw new ProbeError('timeout')
    }
    throw new ProbeError('unreachable')
  }

  // A-01: GET / is public, /stats is behind the Bearer auth group. A 401
  // here with a healthy GET / means the address is right but the API key
  // is wrong — record it as such instead of silently dropping the stats.
  if (statsRes.status === 'fulfilled' && statsRes.value.status === 401) {
    throw new ProbeError('unauthorized')
  }

  const info = await infoRes.value.json()
  // Guard against non-object responses (e.g., plain string, number, null)
  // which would cause TypeError on property access.
  if (typeof info !== 'object' || info === null) {
    throw new ProbeError('unreachable')
  }
  const result: CoreCInstance['lastKnownInfo'] = {
    name: info.name,
    version: info.version,
    status: info.status,
    uptime: info.uptime,
  }

  // GET /stats — optional, enriches the card
  if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
    const stats = await statsRes.value.json()
    result.stats = {
      drivers: stats.drivers ?? 0,
      transports: stats.transports ?? 0,
      rules: stats.rules ?? 0,
      total_read: stats.total_read ?? 0,
      total_publish: stats.total_publish ?? 0,
      total_errors: stats.total_errors ?? 0,
      total_dropped: stats.total_dropped ?? 0,
      points_per_sec: stats.points_per_sec ?? 0,
      driver_stats: stats.driver_stats,
      transport_stats: stats.transport_stats,
    } as StatsData
  }

  // GET /tags — just need the count
  if (tagsRes.status === 'fulfilled' && tagsRes.value.ok) {
    const tags = await tagsRes.value.json()
    if (result.stats) {
      result.stats.tag_count = Object.keys(tags.tags ?? {}).length
    }
  }

  // GET /rules — for topology display
  if (rulesRes.status === 'fulfilled' && rulesRes.value.ok) {
    const rules = await rulesRes.value.json()
    if (result.stats) {
      result.stats.rule_list = (rules.rules ?? []).map(
        (r: {
          name: string
          match: string
          action: string
          target: string
          disabled: boolean
          hit_count: number
        }) => ({
          name: r.name,
          match: r.match,
          action: r.action,
          target: r.target,
          disabled: r.disabled,
          hit_count: r.hit_count,
        }),
      )
    }
  }

  // GET /configs/raw — parse and derive compact connection-target summaries
  // (host:port / broker / url / webhook-addr) for each driver/transport so the
  // topology rows on the homepage card can show the address. The runtime
  // /stats + /drivers endpoints do not expose connection parameters.
  if (rawCfgRes.status === 'fulfilled' && rawCfgRes.value.ok && result.stats) {
    try {
      const rawText = await rawCfgRes.value.text()
      const cfg: CoreCConfig = (await import('@/lib/configYaml')).parseConfigYaml(rawText)
      const driverNames = Object.keys(result.stats.driver_stats ?? {})
      const transportNames = Object.keys(result.stats.transport_stats ?? {})
      if (driverNames.length > 0) {
        const driverConn: Record<string, string> = {}
        for (const n of driverNames) {
          const summary = getDriverConnectionSummary(cfg, n)
          if (summary) driverConn[n] = summary
        }
        if (Object.keys(driverConn).length > 0) result.stats.driver_conn = driverConn
      }
      if (transportNames.length > 0) {
        const transportConn: Record<string, string> = {}
        for (const n of transportNames) {
          const summary = getTransportConnectionSummary(cfg, n)
          if (summary) transportConn[n] = summary
        }
        if (Object.keys(transportConn).length > 0) result.stats.transport_conn = transportConn
      }
    } catch {
      // Ignore parse errors — connection summaries are best-effort enrichment.
    }
  }

  return result
}

export function useHomepageProbe(): void {
  const instances = useInstanceStore((s) => s.instances)
  const setProbing = useInstanceStore((s) => s.setProbing)
  const setProbeResult = useInstanceStore((s) => s.setProbeResult)
  // Keep latest refs so the interval callback always sees fresh data
  const instancesRef = useRef(instances)
  const setProbingRef = useRef(setProbing)
  const setProbeResultRef = useRef(setProbeResult)
  instancesRef.current = instances
  setProbingRef.current = setProbing
  setProbeResultRef.current = setProbeResult

  useEffect(() => {
    let active = true
    const abortController = new AbortController()
    const { signal } = abortController

    const probeAll = async () => {
      const list = instancesRef.current
      if (list.length === 0) return

      // Mark all as probing
      for (const inst of list) {
        setProbingRef.current(inst.id, true)
      }

      // Probe all in parallel
      await Promise.allSettled(
        list.map(async (inst) => {
          try {
            const info = await probeInstance(inst, signal)
            if (!active) return
            setProbeResultRef.current(inst.id, true, info)
          } catch (err) {
            if (!active) return
            setProbeResultRef.current(
              inst.id,
              false,
              undefined,
              err instanceof ProbeError ? err.kind : 'unreachable',
            )
          } finally {
            if (active) setProbingRef.current(inst.id, false)
          }
        }),
      )
    }

    // Probe immediately on mount, then periodically
    probeAll()
    const intervalId = setInterval(probeAll, REFRESH_INTERVAL)

    return () => {
      active = false
      abortController.abort()
      clearInterval(intervalId)
    }
  }, []) // Empty deps — runs once on mount, refs keep data fresh
}

/**
 * Probe one instance immediately and record the result in the store (A-03).
 * Called by InstancePanel right after add/update so a fresh or edited
 * instance shows its connecting → verdict transition within seconds
 * instead of waiting up to REFRESH_INTERVAL for the next cycle.
 *
 * Deliberately fire-and-forget: the UI follows the store's probing /
 * probeErrors updates, and the periodic probeAll keeps the state fresh
 * afterwards. Never throws — every failure lands in setProbeResult.
 */
export async function probeOneInstance(id: string): Promise<void> {
  const { getInstance, setProbing, setProbeResult } = useInstanceStore.getState()
  const inst = getInstance(id)
  if (!inst) return
  setProbing(id, true)
  try {
    const info = await probeInstance(inst)
    setProbeResult(id, true, info)
  } catch (err) {
    setProbeResult(id, false, undefined, err instanceof ProbeError ? err.kind : 'unreachable')
  } finally {
    setProbing(id, false)
  }
}
