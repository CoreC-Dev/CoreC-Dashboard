/**
 * Config Working-Copy Store
 *
 * The architectural backbone for all configuration editing in the Dashboard.
 * Holds a local working copy of the full CoreCConfig and provides entity
 * CRUD actions that delegate to the pure helpers in configYaml.ts.
 *
 * This store is decision-independent — it works identically under both
 * backend paths:
 *   - Path A (GET /configs/raw): the server's raw YAML is fed straight to
 *     loadFromYaml(); user edits locally; saveConfig() PUTs the YAML back.
 *   - Path B (pure frontend): loadFromYaml() parses an uploaded YAML or
 *     the user starts from scratch; edits locally; saveConfig() PUTs.
 *
 * Dirty tracking: `savedConfig` is the last successfully applied snapshot.
 * `workingConfig` is what the user is editing. `dirty` = they differ.
 * `revert()` discards working changes back to the last saved state.
 *
 * Safety: because PUT /configs is a full hot-reload (non-atomic, suspends
 * the engine), the UI must never auto-save. All saves are explicit user
 * actions with a confirmation dialog showing the YAML diff.
 */
import { create } from 'zustand'
import {
  dumpConfigYaml,
  findDriver,
  findRule,
  findRuleGroup,
  findRuleProvider,
  findTransport,
  isDriverNameUnique,
  isRuleGroupNameUnique,
  isRuleNameUnique,
  isRuleProviderNameUnique,
  isTransportNameUnique,
  parseConfigYaml,
  removeDriver,
  removeRule,
  removeRuleGroup,
  removeRuleProvider,
  removeTransport,
  upsertDriver,
  upsertRule,
  upsertRuleGroup,
  upsertRuleProvider,
  upsertTransport,
} from '@/lib/configYaml'
import type {
  CoreCConfig,
  DriverConfig,
  RuleConfig,
  RuleProviderConfig,
  TransportConfig,
} from '@/types/config'

/**
 * Set a value at a dotted path inside a plain object (shallow clone per level).
 * Example: setNestedPath(obj, 'api.listen', '0.0.0.0:9090')
 *          → obj.api = { ...obj.api, listen: '0.0.0.0:9090' }
 * When value is undefined, the key is deleted from its parent.
 */
function setNestedPath(root: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  if (parts.length === 0) return
  let current = root
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!
    const child = current[key]
    if (typeof child !== 'object' || child === null || Array.isArray(child)) {
      current[key] = {}
    } else {
      current[key] = { ...child }
    }
    current = current[key] as Record<string, unknown>
  }
  const lastKey = parts[parts.length - 1]!
  if (value === undefined) {
    delete current[lastKey]
  } else {
    current[lastKey] = value
  }
}

export interface ConfigStoreState {
  /** The config the user is currently editing (may have unsaved changes). */
  workingConfig: CoreCConfig | null
  /** The last successfully applied config (for diff/revert). null = never saved. */
  savedConfig: CoreCConfig | null
  /** True when workingConfig differs from savedConfig (has unsaved changes). */
  dirty: boolean
  /** Error message from the last failed operation (parse error, etc.). */
  error: string | null

  // ─── Loading ──────────────────────────────────────────────────────

  /** Load config from a YAML string (path B: uploaded file or pasted YAML). */
  loadFromYaml: (yaml: string) => void
  /** Start a new empty config (blank-slate creation). */
  resetToEmpty: () => void

  // ─── Entity CRUD (delegate to configYaml.ts pure helpers) ─────────

  upsertDriver: (driver: DriverConfig) => boolean
  removeDriver: (name: string) => void
  upsertTransport: (transport: TransportConfig) => boolean
  removeTransport: (name: string) => void
  upsertRule: (rule: RuleConfig) => boolean
  removeRule: (name: string) => void
  upsertRuleProvider: (provider: RuleProviderConfig) => boolean
  removeRuleProvider: (name: string) => void
  upsertRuleGroup: (name: string, rules: RuleConfig[]) => boolean
  removeRuleGroup: (name: string) => void

  // ─── Section updates ──────────────────────────────────────────────

  /** Update a single field inside the global section (shallow path: 'log-level', 'api.listen', etc.). */
  updateGlobalField: (path: string, value: unknown) => void
  /** Update a single field inside the node section. */
  updateNodeField: (path: string, value: unknown) => void

  // ─── Save / revert ────────────────────────────────────────────────

  /** Mark the current workingConfig as saved (call after successful PUT). */
  markSaved: () => void
  /** Discard working changes, revert to the last saved config. */
  revert: () => void
  /** Reset the store to its initial empty state (clears working + saved config, dirty, error). */
  reset: () => void

  // ─── Derived getters (not reactive; call on demand) ───────────────

  /** Dump the working config to a YAML string for PUT /configs. */
  getWorkingYaml: () => string | null
  /** Dump the saved config to YAML (for diff baseline). */
  getSavedYaml: () => string | null
  /** Find a driver/transport/rule by name in the working config. */
  findDriver: (name: string) => DriverConfig | undefined
  findTransport: (name: string) => TransportConfig | undefined
  findRule: (name: string) => RuleConfig | undefined
  findRuleProvider: (name: string) => RuleProviderConfig | undefined
  findRuleGroup: (name: string) => RuleConfig[] | undefined
  /** Check name uniqueness in the working config. */
  isDriverNameUnique: (name: string) => boolean
  isTransportNameUnique: (name: string) => boolean
  isRuleNameUnique: (name: string) => boolean
  isRuleProviderNameUnique: (name: string) => boolean
  isRuleGroupNameUnique: (name: string) => boolean
}

/** Deep equality check for config objects (structural, not reference). */
function configEqual(a: CoreCConfig | null, b: CoreCConfig | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  } catch {
    return false
  }
}

export const useConfigStore = create<ConfigStoreState>((set, get) => {
  // Commit a new working config: swap it in, recompute dirty against the last
  // saved snapshot, and clear any prior error. Shared by every entity-CRUD and
  // section-update action below — load/markSaved/revert use different shapes.
  const commit = (next: CoreCConfig): void =>
    set({ workingConfig: next, dirty: !configEqual(next, get().savedConfig), error: null })

  return {
    workingConfig: null,
    savedConfig: null,
    dirty: false,
    error: null,

    // ─── Loading ──────────────────────────────────────────────────────

    loadFromYaml: (yaml: string) => {
      try {
        const config = parseConfigYaml(yaml)
        set({
          workingConfig: config,
          savedConfig: config,
          dirty: false,
          error: null,
        })
      } catch (err: unknown) {
        set({
          error: err instanceof Error ? err.message : String(err),
        })
      }
    },

    resetToEmpty: () => {
      set({
        workingConfig: {},
        savedConfig: null,
        dirty: true,
        error: null,
      })
    },

    // ─── Entity CRUD ──────────────────────────────────────────────────

    upsertDriver: (driver: DriverConfig) => {
      const { workingConfig } = get()
      if (!workingConfig) {
        set({ error: 'No working config loaded' })
        return false
      }
      const next = upsertDriver(workingConfig, driver)
      commit(next)
      return true
    },

    removeDriver: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeDriver(workingConfig, name)
      commit(next)
    },

    upsertTransport: (transport: TransportConfig) => {
      const { workingConfig } = get()
      if (!workingConfig) {
        set({ error: 'No working config loaded' })
        return false
      }
      const next = upsertTransport(workingConfig, transport)
      commit(next)
      return true
    },

    removeTransport: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeTransport(workingConfig, name)
      commit(next)
    },

    upsertRule: (rule: RuleConfig) => {
      const { workingConfig } = get()
      if (!workingConfig) {
        set({ error: 'No working config loaded' })
        return false
      }
      const next = upsertRule(workingConfig, rule)
      commit(next)
      return true
    },

    removeRule: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeRule(workingConfig, name)
      commit(next)
    },

    upsertRuleProvider: (provider: RuleProviderConfig) => {
      const { workingConfig } = get()
      if (!workingConfig) {
        set({ error: 'No working config loaded' })
        return false
      }
      const next = upsertRuleProvider(workingConfig, provider)
      commit(next)
      return true
    },

    removeRuleProvider: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeRuleProvider(workingConfig, name)
      commit(next)
    },

    upsertRuleGroup: (name: string, rules: RuleConfig[]) => {
      const { workingConfig } = get()
      if (!workingConfig) {
        set({ error: 'No working config loaded' })
        return false
      }
      if (!name.trim()) {
        set({ error: 'Rule group name cannot be empty' })
        return false
      }
      const next = upsertRuleGroup(workingConfig, name.trim(), rules)
      commit(next)
      return true
    },

    removeRuleGroup: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeRuleGroup(workingConfig, name)
      commit(next)
    },

    // ─── Section updates ──────────────────────────────────────────────

    updateGlobalField: (path: string, value: unknown) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const global = { ...(workingConfig.global ?? {}) } as Record<string, unknown>
      setNestedPath(global, path, value)
      const next = { ...workingConfig, global }
      commit(next)
    },

    updateNodeField: (path: string, value: unknown) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const node = { ...(workingConfig.node ?? {}) } as Record<string, unknown>
      setNestedPath(node, path, value)
      const next = { ...workingConfig, node }
      commit(next)
    },

    // ─── Save / revert ────────────────────────────────────────────────

    markSaved: () => {
      const { workingConfig } = get()
      set({ savedConfig: workingConfig ? structuredClone(workingConfig) : null, dirty: false })
    },

    revert: () => {
      const { savedConfig } = get()
      set({
        workingConfig: savedConfig ? structuredClone(savedConfig) : null,
        dirty: false,
        error: null,
      })
    },

    reset: () => {
      set({ workingConfig: null, savedConfig: null, dirty: false, error: null })
    },

    // ─── Derived getters ──────────────────────────────────────────────

    getWorkingYaml: () => {
      const { workingConfig } = get()
      if (!workingConfig) return null
      return dumpConfigYaml(workingConfig)
    },

    getSavedYaml: () => {
      const { savedConfig } = get()
      if (!savedConfig) return null
      return dumpConfigYaml(savedConfig)
    },

    findDriver: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return undefined
      return findDriver(workingConfig, name)
    },

    findTransport: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return undefined
      return findTransport(workingConfig, name)
    },

    findRule: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return undefined
      return findRule(workingConfig, name)
    },

    findRuleProvider: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return undefined
      return findRuleProvider(workingConfig, name)
    },

    findRuleGroup: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return undefined
      return findRuleGroup(workingConfig, name)
    },

    isDriverNameUnique: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return true
      return isDriverNameUnique(workingConfig, name)
    },

    isTransportNameUnique: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return true
      return isTransportNameUnique(workingConfig, name)
    },

    isRuleNameUnique: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return true
      return isRuleNameUnique(workingConfig, name)
    },

    isRuleProviderNameUnique: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return true
      return isRuleProviderNameUnique(workingConfig, name)
    },

    isRuleGroupNameUnique: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return true
      return isRuleGroupNameUnique(workingConfig, name)
    },
  }
})
