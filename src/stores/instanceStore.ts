import { z } from 'zod'
import { create } from 'zustand'
import {
  safePersist,
  safeRead,
  safeRemove,
  safeSessionPersist,
  safeSessionRead,
} from '@/lib/storage'

import type { CoreCInstance } from '@/types/models'

// Re-export of types/models.ts CoreCInstance.
export type { CoreCInstance }

/**
 * Zod schema for validating imported instances.
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

/** Reject objects containing prototype-polluting keys. */
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

/** Probe failure kinds recorded per instance in probeErrors. */
export type ProbeErrorKind = 'unauthorized' | 'unreachable' | 'timeout'

/**
 * i18n keys for rendering each probe failure kind; components translate
 * at render time.
 */
export const PROBE_ERROR_I18N_KEYS: Record<ProbeErrorKind, string> = {
  unauthorized: 'instances.probeUnauthorized',
  unreachable: 'instances.probeUnreachable',
  timeout: 'instances.probeTimeout',
}

/** Outcome of an importInstances call. */
export interface ImportResult {
  /** Entries successfully added. */
  added: number
  /** Entries skipped because an instance with the same id/name already exists. */
  skipped: number
  /** Entries that failed per-entry validation (invalid shape — not duplicates). */
  invalid: number
  /** True when the payload itself was unusable (not JSON / not an array / forbidden keys) — nothing was imported. */
  parseError: boolean
}

interface InstanceState {
  instances: CoreCInstance[]
  /** IDs of instances currently being probed (connection test). */
  probing: Record<string, boolean>
  /** Per-instance failure kind from the last probe (null = last probe ok). */
  probeErrors: Record<string, ProbeErrorKind | null>
  /**
   * True when the last persist to localStorage FAILED (quota exceeded /
   * private mode / storage disabled) — the in-memory list will be lost on
   * refresh. Surfaced as a visible warning instead of silent data loss.
   */
  persistFailed: boolean
  /** True = secrets are also written to localStorage (opt-in, XSS-exposed). */
  rememberSecrets: boolean

  addInstance: (data: Omit<CoreCInstance, 'id' | 'createdAt' | 'sortOrder'>) => string
  updateInstance: (id: string, data: Partial<Omit<CoreCInstance, 'id' | 'createdAt'>>) => void
  deleteInstance: (id: string) => void
  getInstance: (id: string) => CoreCInstance | undefined
  reorderInstances: (orderedIds: string[]) => void
  setProbeResult: (
    id: string,
    ok: boolean,
    info?: CoreCInstance['lastKnownInfo'],
    error?: ProbeErrorKind,
  ) => void
  setProbing: (id: string, probing: boolean) => void
  exportInstances: (includeSecrets?: boolean) => string
  importInstances: (json: string, mode?: 'merge' | 'replace') => ImportResult
  clearAll: () => void
  setRememberSecrets: (remember: boolean) => void
}

const STORAGE_KEY = 'corec_instances'
/**
 * Secrets default to sessionStorage (survive reload, not browser restart).
 * rememberSecrets opt-in additionally writes localStorage — readable by
 * any XSS on this origin.
 */
const SECRETS_STORAGE_KEY = 'corec_instance_secrets'
const REMEMBER_SECRETS_KEY = 'corec_remember_secrets'
let rememberSecretsPersisted = safeRead(REMEMBER_SECRETS_KEY) === 'true'

function parseSecretMap(raw: string | null): Record<string, string> {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>
  } catch {
    /* best-effort */
  }
  return {}
}

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
        // Merge secrets from the secret map (sessionStorage authoritative) back into instances.
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

/**
 * Load the id→secret map: sessionStorage authoritative; a localStorage
 * copy is merged in, kept only with rememberSecrets, else removed.
 */
function loadSecrets(): Record<string, string> {
  const fromSession = parseSecretMap(safeSessionRead(SECRETS_STORAGE_KEY))
  const legacy = parseSecretMap(safeRead(SECRETS_STORAGE_KEY))
  const merged = { ...legacy, ...fromSession }
  safeSessionPersist(SECRETS_STORAGE_KEY, JSON.stringify(merged))
  if (rememberSecretsPersisted) {
    safePersist(SECRETS_STORAGE_KEY, JSON.stringify(merged))
  } else {
    safeRemove(SECRETS_STORAGE_KEY)
  }
  return merged
}

/**
 * Persist metadata to localStorage and secrets to sessionStorage
 * (localStorage copy only with rememberSecrets opt-in);
 * false = a write failed → callers flag `persistFailed`.
 */
function persistInstances(instances: CoreCInstance[]): boolean {
  // Store non-sensitive metadata in localStorage (persistent).
  const safeInstances = instances.map((i) => stripSecret(i))
  const metaOk = safePersist(STORAGE_KEY, JSON.stringify(safeInstances))
  // Secrets go to sessionStorage; only an explicit opt-in copies them to
  // localStorage. Otherwise any stale long-lived copy is removed.
  const secrets: Record<string, string> = {}
  for (const inst of instances) {
    if (inst.secret) {
      secrets[inst.id] = inst.secret
    }
  }
  const payload = JSON.stringify(secrets)
  const sessionOk = safeSessionPersist(SECRETS_STORAGE_KEY, payload)
  if (rememberSecretsPersisted) {
    return metaOk && sessionOk && safePersist(SECRETS_STORAGE_KEY, payload)
  }
  safeRemove(SECRETS_STORAGE_KEY)
  return metaOk && sessionOk
}

function generateId(): string {
  return `inst_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

const initialInstances = loadInstances()

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: initialInstances,
  probing: {},
  probeErrors: {},
  persistFailed: false,
  rememberSecrets: rememberSecretsPersisted,

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
    const persisted = persistInstances(next)
    set({ instances: next, persistFailed: !persisted })
    return id
  },

  updateInstance: (id, data) => {
    const next = get().instances.map((i) => (i.id === id ? { ...i, ...data } : i))
    const persisted = persistInstances(next)
    set({ instances: next, persistFailed: !persisted })
  },

  deleteInstance: (id) => {
    const next = get().instances.filter((i) => i.id !== id)
    const persisted = persistInstances(next)
    const { probing, probeErrors } = get()
    const { [id]: _p, ...restProbing } = probing
    const { [id]: _e, ...restErrors } = probeErrors
    set({
      instances: next,
      probing: restProbing,
      probeErrors: restErrors,
      persistFailed: !persisted,
    })
  },

  getInstance: (id) => get().instances.find((i) => i.id === id),

  reorderInstances: (orderedIds) => {
    const map = new Map(orderedIds.map((id, idx) => [id, idx + 1]))
    const next = get()
      .instances.map((i) => ({ ...i, sortOrder: map.get(i.id) ?? i.sortOrder }))
      .sort((a, b) => a.sortOrder - b.sortOrder)
    const persisted = persistInstances(next)
    set({ instances: next, persistFailed: !persisted })
  },

  setProbing: (id, probing) => {
    const { probing: cur } = get()
    set({ probing: { ...cur, [id]: probing } })
  },

  setProbeResult: (id, ok, info, error) => {
    const { probeErrors: curErrors } = get()
    set({ probeErrors: { ...curErrors, [id]: ok ? null : (error ?? 'unreachable') } })
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
      const persisted = persistInstances(next)
      set({ instances: next, persistFailed: !persisted })
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
      // The payload itself is unusable.
      return { added: 0, skipped: 0, invalid: 0, parseError: true }
    }

    const existing = mode === 'replace' ? [] : get().instances
    const existingIds = new Set(existing.map((i) => i.id))
    const existingNames = new Set(existing.map((i) => i.name))

    let added = 0
    let skipped = 0
    let invalid = 0
    const next = [...existing]
    for (const item of raw) {
      // Validate with zod — strips unknown keys, rejects invalid shapes.
      // A per-entry validation failure is NOT a duplicate skip.
      const parsed = importInstanceSchema.safeParse(item)
      if (!parsed.success) {
        invalid++
        continue
      }
      const inst = parsed.data
      // Skip duplicates by id or name (check both pre-existing and
      // already-added-from-this-payload entries to catch intra-payload dups)
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
      // Track newly added so subsequent payload items can't duplicate them.
      existingIds.add(inst.id)
      existingNames.add(inst.name)
      added++
    }

    const persisted = persistInstances(next)
    set({ instances: next, persistFailed: !persisted })
    return { added, skipped, invalid, parseError: false }
  },

  setRememberSecrets: (remember) => {
    if (remember === rememberSecretsPersisted) {
      set({ rememberSecrets: remember })
      return
    }
    rememberSecretsPersisted = remember
    if (remember) safePersist(REMEMBER_SECRETS_KEY, 'true')
    else safeRemove(REMEMBER_SECRETS_KEY)
    const persisted = persistInstances(get().instances)
    set({ rememberSecrets: remember, persistFailed: !persisted })
  },

  clearAll: () => {
    const persisted = persistInstances([])
    set({ instances: [], probing: {}, probeErrors: {}, persistFailed: !persisted })
  },
}))
