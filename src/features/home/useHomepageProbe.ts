import { useEffect, useRef } from 'react'
import { getDriverConnectionSummary, getTransportConnectionSummary } from '@/lib/connectionInfo'
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
 * This is the "simultaneous multi-instance monitor" — all instances are
 * probed in parallel every REFRESH_INTERVAL ms.
 */

const REFRESH_INTERVAL = 15_000 // 15 seconds
const REQUEST_TIMEOUT = 8_000 // 8 seconds per request

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
  const headers = { Authorization: `Bearer ${instance.secret}` }

  // Fetch GET / and GET /stats and GET /tags and GET /rules and GET /configs/raw in parallel
  const [infoRes, statsRes, tagsRes, rulesRes, rawCfgRes] = await Promise.allSettled([
    fetchWithTimeout(`${base}/`, {}, REQUEST_TIMEOUT, signal),
    fetchWithTimeout(`${base}/stats`, { headers }, REQUEST_TIMEOUT, signal),
    fetchWithTimeout(`${base}/tags`, { headers }, REQUEST_TIMEOUT, signal),
    fetchWithTimeout(`${base}/rules`, { headers }, REQUEST_TIMEOUT, signal),
    fetchWithTimeout(`${base}/configs/raw`, { headers }, REQUEST_TIMEOUT, signal),
  ])

  // GET / must succeed — otherwise the instance is unreachable
  if (infoRes.status !== 'fulfilled' || !infoRes.value.ok) {
    throw new Error('Unreachable')
  }

  const info = await infoRes.value.json()
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
          } catch {
            if (!active) return
            setProbeResultRef.current(inst.id, false, undefined, 'Connection failed')
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
