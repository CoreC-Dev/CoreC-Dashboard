import { z } from 'zod'
import { create } from 'zustand'
import { safePersist, safePersistSession, safeReadSession } from '@/lib/storage'

import type { CoreCInstance } from '@/types/models'

// Re-export for backward compat (TD-ARCH-006 — canonical location is types/models.ts).
export type { CoreCInstance }

/**
 * Zod schema for validating imported instances (TD-SEC-011).
 * Strips unknown keys (zod default) so cached fields like lastKnownInfo
 * are silently dropped. Requires valid baseUrl (http/https) and non-empty
 * id/name. Secret is optional (stripped exports omit it).
 */
const importInstanceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  baseUrl: z
    .string()
    .min(1)
    .regex(/^https?:\/\//),
  secret: z.string().default(''),
  color: z.string().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
  createdAt: z.string().optional(),
  sortOrder: z.number().optional(),
  lastConnectedAt: z.string().optional(),
})

/** Reject objects containing prototype-polluting keys (TD-SEC-009). */
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
function rejectProtoKeys(obj: unknown): void {
  if (typeof obj !== 'object' || obj === null) return
  if (Array.isArray(obj)) {
    for (const item of obj) rejectProtoKeys(item)
    return
  }
  for (const key of Object.keys(obj)) {
    if (PROTO_KEYS.has(key)) throw new Error(`Forbidden key: ${key}`)
    rejectProtoKeys((obj as Record<string, unknown>)[key])
  }
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
  exportInstances: (includeSecrets?: boolean) => string
  importInstances: (json: string, mode?: 'merge' | 'replace') => { added: number; skipped: number }
  clearAll: () => void
}

const STORAGE_KEY = 'corec_instances'
/**
 * Secrets are stored in sessionStorage (per-tab, cleared on tab close)
 * instead of localStorage, so an XSS attack cannot harvest persisted
 * API credentials across browser sessions. The non-sensitive instance
 * metadata (name, baseUrl, color, etc.) remains in localStorage for
 * persistence across sessions; only the secret is ephemeral.
 */
const SECRETS_STORAGE_KEY = 'corec_instance_secrets'

/** Strip the secret field from an instance for safe persistent storage. */
function stripSecret(instance: CoreCInstance): Omit<CoreCInstance, 'secret'> & { secret?: string } {
  const { secret: _secret, ...rest } = instance
  return rest
}

function loadInstances(): CoreCInstance[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        // Merge secrets from sessionStorage back into instances.
        const secrets = loadSecrets()
        return parsed.map((inst: CoreCInstance) => ({
          ...inst,
          secret: secrets[inst.id] ?? inst.secret ?? '',
        }))
      }
    }
  } catch (e) {
    console.error('Failed to parse instance storage', e)
  }
  return []
}

/** Load the id→secret map from sessionStorage. */
function loadSecrets(): Record<string, string> {
  try {
    const raw = safeReadSession(SECRETS_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed
    }
  } catch {
    /* best-effort */
  }
  return {}
}

function persistInstances(instances: CoreCInstance[]): void {
  // Store non-sensitive metadata in localStorage (persistent).
  const safeInstances = instances.map((i) => stripSecret(i))
  safePersist(STORAGE_KEY, JSON.stringify(safeInstances))
  // Store secrets in sessionStorage (ephemeral, per-tab).
  const secrets: Record<string, string> = {}
  for (const inst of instances) {
    if (inst.secret) {
      secrets[inst.id] = inst.secret
    }
  }
  safePersistSession(SECRETS_STORAGE_KEY, JSON.stringify(secrets))
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

  exportInstances: (includeSecrets = false) => {
    const instances = includeSecrets ? get().instances : get().instances.map(stripSecret)
    return JSON.stringify(instances, null, 2)
  },

  importInstances: (json, mode = 'merge') => {
    let raw: unknown
    try {
      raw = JSON.parse(json)
      if (!Array.isArray(raw)) throw new Error('Not an array')
      rejectProtoKeys(raw)
    } catch {
      return { added: 0, skipped: 0 }
    }

    const existing = mode === 'replace' ? [] : get().instances
    const existingIds = new Set(existing.map((i) => i.id))
    const existingNames = new Set(existing.map((i) => i.name))

    let added = 0
    let skipped = 0
    const next = [...existing]
    for (const item of raw) {
      // Validate with zod — strips unknown keys, rejects invalid shapes (TD-SEC-011)
      const parsed = importInstanceSchema.safeParse(item)
      if (!parsed.success) {
        skipped++
        continue
      }
      const inst = parsed.data
      // Skip duplicates by id or name
      if (existingIds.has(inst.id) || existingNames.has(inst.name)) {
        skipped++
        continue
      }
      const maxSort = next.reduce((max, i) => Math.max(max, i.sortOrder), 0)
      next.push({
        id: inst.id,
        name: inst.name,
        baseUrl: inst.baseUrl,
        secret: inst.secret,
        color: inst.color,
        notes: inst.notes,
        tags: inst.tags,
        createdAt: inst.createdAt ?? new Date().toISOString(),
        sortOrder: inst.sortOrder ?? maxSort + 1,
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
