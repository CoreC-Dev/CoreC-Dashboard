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
 *
 * (TD-ARCH-003: split into configCrudSlice + configGetterSlice + pure helpers
 * in lib/configHelpers.ts. This file retains the state shell, loading, section
 * updates, and save/revert.)
 */
import { create } from 'zustand'
import { configEqual, setNestedPath } from '@/lib/configHelpers'
import { parseConfigYaml } from '@/lib/configYaml'
import { createCrudSlice } from '@/stores/slices/configCrudSlice'
import { createGetterSlice } from '@/stores/slices/configGetterSlice'
import type {
  CoreCConfig,
  DriverConfig,
  RuleConfig,
  RuleProviderConfig,
  TransportConfig,
} from '@/types/config'

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

  /** Load config from a YAML string (path B: uploaded file or pasted YAML).
   *  Returns the error message on failure, or null on success — so callers
   *  can react to the result synchronously without reading store.getState(). */
  loadFromYaml: (yaml: string) => string | null
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

export const useConfigStore = create<ConfigStoreState>((set, get) => {
  // Commit a new working config: swap it in, recompute dirty against the last
  // saved snapshot, and clear any prior error.
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
        return null
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        set({
          error: message,
        })
        return message
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

    // ─── Entity CRUD + Derived getters (from slices) ──────────────────

    ...createCrudSlice(set, get),
    ...createGetterSlice(set, get),
  }
})
