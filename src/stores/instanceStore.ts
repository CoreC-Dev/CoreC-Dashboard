import { create } from 'zustand'
import { safePersist } from '@/lib/storage'

/**
 * A saved CoreC instance — a persistent identity for a gateway/edge node
 * the operator manages from the dashboard.
 */
export interface CoreCInstance {
  /** Auto-generated unique identifier (used in routes /corec/:id/*). */
  id: string
  /** User-defined display name (e.g. "1号车间 PLC网关"). */
  name: string
  /** Connection base URL (REST & WebSocket). */
  baseUrl: string
  /** API Bearer secret. */
  secret: string
  /** Optional color accent for the card / status dot. */
  color?: string
  /** Optional free-form notes. */
  notes?: string
  /** Optional grouping tags (e.g. ["车间A"]). */
  tags?: string[]
  /** Last successful connection timestamp (ISO 8601). */
  lastConnectedAt?: string
  /** Last known server info (cached from GET / + GET /stats). */
  lastKnownInfo?: {
    name?: string
    version?: string
    status?: string
    uptime?: string
    /** Stats from GET /stats — fetched by the homepage probe for card display. */
    stats?: {
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
      rule_list?: {
        name: string
        match: string
        action: string
        target: string
        disabled: boolean
        hit_count: number
      }[]
    }
  }
  /** Creation timestamp (ISO 8601). */
  createdAt: string
  /** Sort order for card display. */
  sortOrder: number
}

interface InstanceState {
  instances: CoreCInstance[]
  /** IDs of instances currently being probed (connection test). */
  probing: Record<string, boolean>
  /** Per-instance connection errors from the last probe. */
  probeErrors: Record<string, string | null>

  addInstance: (data: Omit<CoreCInstance, 'id' | 'createdAt' | 'sortOrder'>) => string
  updateInstance: (id: string, data: Partial<Omit<CoreCInstance, 'id' | 'createdAt'>>) => void
  deleteInstance: (id: string) => void
  getInstance: (id: string) => CoreCInstance | undefined
  reorderInstances: (orderedIds: string[]) => void
  setProbeResult: (
    id: string,
    ok: boolean,
    info?: CoreCInstance['lastKnownInfo'],
    error?: string,
  ) => void
  setProbing: (id: string, probing: boolean) => void
  exportInstances: () => string
  importInstances: (json: string, mode?: 'merge' | 'replace') => { added: number; skipped: number }
  clearAll: () => void
}

const STORAGE_KEY = 'corec_instances'

function loadInstances(): CoreCInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    }
  } catch (e) {
    console.error('Failed to parse instance storage', e)
  }
  return []
}

function persistInstances(instances: CoreCInstance[]): void {
  safePersist(STORAGE_KEY, JSON.stringify(instances))
}

function generateId(): string {
  return `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

const initialInstances = loadInstances()

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: initialInstances,
  probing: {},
  probeErrors: {},

  addInstance: (data) => {
    const id = generateId()
    const now = new Date().toISOString()
    const maxSort = get().instances.reduce((max, i) => Math.max(max, i.sortOrder), 0)
    const instance: CoreCInstance = {
      ...data,
      id,
      createdAt: now,
      sortOrder: maxSort + 1,
    }
    const next = [...get().instances, instance]
    persistInstances(next)
    set({ instances: next })
    return id
  },

  updateInstance: (id, data) => {
    const next = get().instances.map((i) => (i.id === id ? { ...i, ...data } : i))
    persistInstances(next)
    set({ instances: next })
  },

  deleteInstance: (id) => {
    const next = get().instances.filter((i) => i.id !== id)
    persistInstances(next)
    const { probing, probeErrors } = get()
    const { [id]: _p, ...restProbing } = probing
    const { [id]: _e, ...restErrors } = probeErrors
    set({ instances: next, probing: restProbing, probeErrors: restErrors })
  },

  getInstance: (id) => get().instances.find((i) => i.id === id),

  reorderInstances: (orderedIds) => {
    const map = new Map(orderedIds.map((id, idx) => [id, idx + 1]))
    const next = get()
      .instances.map((i) => ({ ...i, sortOrder: map.get(i.id) ?? i.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
    persistInstances(next)
    set({ instances: next })
  },

  setProbing: (id, probing) => {
    const { probing: cur } = get()
    set({ probing: { ...cur, [id]: probing } })
  },

  setProbeResult: (id, ok, info, error) => {
    const { probeErrors: curErrors } = get()
    set({ probeErrors: { ...curErrors, [id]: ok ? null : (error ?? 'Connection failed') } })
    if (ok) {
      const next = get().instances.map((i) =>
        i.id === id
          ? {
              ...i,
              lastConnectedAt: new Date().toISOString(),
              lastKnownInfo: info ?? i.lastKnownInfo,
            }
          : i,
      )
      persistInstances(next)
      set({ instances: next })
    }
  },

  exportInstances: () => {
    return JSON.stringify(get().instances, null, 2)
  },

  importInstances: (json, mode = 'merge') => {
    let imported: CoreCInstance[]
    try {
      imported = JSON.parse(json)
      if (!Array.isArray(imported)) throw new Error('Not an array')
    } catch {
      return { added: 0, skipped: 0 }
    }

    const existing = mode === 'replace' ? [] : get().instances
    const existingIds = new Set(existing.map((i) => i.id))
    const existingNames = new Set(existing.map((i) => i.name))

    let added = 0
    let skipped = 0
    const next = [...existing]
    for (const inst of imported) {
      // Skip duplicates by id or name
      if (existingIds.has(inst.id) || existingNames.has(inst.name)) {
        skipped++
        continue
      }
      // Ensure required fields
      if (!inst.id || !inst.name || !inst.baseUrl) {
        skipped++
        continue
      }
      const maxSort = next.reduce((max, i) => Math.max(max, i.sortOrder), 0)
      next.push({
        ...inst,
        sortOrder: inst.sortOrder ?? maxSort + 1,
        createdAt: inst.createdAt ?? new Date().toISOString(),
      })
      added++
    }

    persistInstances(next)
    set({ instances: next })
    return { added, skipped }
  },

  clearAll: () => {
    persistInstances([])
    set({ instances: [], probing: {}, probeErrors: {} })
  },
}))
