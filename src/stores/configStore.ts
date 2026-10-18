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
  DerivedTagConfig,
  DriverConfig,
  RuleConfig,
  RuleProviderConfig,
  TransportConfig,
} from '@/types/config'

/**
 * True when "Create" (resetToEmpty) or "Apply" would risk wiping a server
 * config we have never seen: the auto-seed fetch has not succeeded AND no
 * saved baseline exists (UX audit D-16 — AppShell's own comment warns that
 * applying without seeding "silently shuts down the control plane").
 *
 * Consumers can use it as a stable boolean Zustand selector:
 *   const blocked = useConfigStore((s) => isSeedBlocked(s))
 */
export function isSeedBlocked(s: Pick<ConfigStoreState, 'savedConfig' | 'seedStatus'>): boolean {
  return !s.savedConfig && (s.seedStatus === 'loading' || s.seedStatus === 'failed')
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
  /** Status of the auto-seed from GET /configs/raw (UX audit D-16). The
   *  store owns it so every "Create"/"Apply" entry — on any admin page —
   *  can consult one shared truth about whether the server config was
   *  ever loaded. 'idle' = auto-load not started (pure path-B / tests). */
  seedStatus: 'idle' | 'loading' | 'ready' | 'failed'
  /** Why the auto-seed failed (fetch error or parse error). Diagnostic raw
   *  string; user-facing copy is i18n'd at the display sites. */
  seedError: string | null

  // ─── Loading ──────────────────────────────────────────────────────

  /** Load config from a YAML string (path B: uploaded file or pasted YAML).
   *  Returns the error message on failure, or null on success — so callers
   *  can react to the result synchronously without reading store.getState(). */
  loadFromYaml: (yaml: string) => string | null
  /** Seed the store from the live server config (auto-load on admin mount).
   *  If workingConfig is null, seeds both workingConfig and savedConfig.
   *  If workingConfig exists but savedConfig is null (race: resetToEmpty was
   *  called before auto-load completed), backfills savedConfig and merges the
   *  global section (api.listen/secret) into workingConfig so it is not
   *  silently dropped on the next Apply. No-op if both are already set. */
  seedFromServer: (yaml: string) => string | null
  /** Start a new empty config, preserving the global section (api.listen/secret)
   *  from savedConfig when available so infrastructure settings are not lost.
   *  Returns false (no state change) when the server config has not been
   *  loaded and no baseline exists — starting from scratch then would let
   *  the next Apply PUT a config that wipes the running control plane
   *  (D-16). Callers that open editors on "Create" should treat false as
   *  "do not proceed". */
  resetToEmpty: () => boolean
  /** Record that the GET /configs/raw auto-seed fetch is in flight (D-16). */
  markSeedLoading: () => void
  /** Record that the auto-seed succeeded — Create/Apply are safe. */
  markSeedReady: () => void
  /** Record why the auto-seed failed — Create/Apply stay blocked until a
   *  retry succeeds (or a config is loaded manually, which sets a baseline). */
  markSeedFailed: (error: string) => void

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
  upsertDerivedTag: (tag: DerivedTagConfig) => boolean
  removeDerivedTag: (name: string) => void

  // ─── Section updates ──────────────────────────────────────────────

  /** Update a single field inside the global section (shallow path: 'log-level', 'api.listen', etc.). */
  updateGlobalField: (path: string, value: unknown) => void
  /** Update a single field inside the node section. */
  updateNodeField: (path: string, value: unknown) => void

  // ─── Save / revert ────────────────────────────────────────────────

  /** Mark the current workingConfig as saved (call after successful PUT).
   *  Only correct when the PUT payload WAS the working config (list-page
   *  applies). For YAML-mode applies see markSavedFromYaml. */
  markSaved: () => void
  /** Record a successful PUT /configs whose payload was the given YAML —
   *  which may differ from the working config (YAML-mode hot reload).
   *  The saved baseline becomes the parsed applied YAML (server truth).
   *  The working config is adopted wholesale only when it has no divergent
   *  edits; otherwise unapplied form edits stay pending and dirty remains
   *  true, so the unsaved-changes banner keeps telling the truth (C-D1).
   *  Returns the parse error message on failure (state unchanged), or null. */
  markSavedFromYaml: (yaml: string) => string | null
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
  findDerivedTag: (name: string) => DerivedTagConfig | undefined
  /** Check name uniqueness in the working config. */
  isDriverNameUnique: (name: string) => boolean
  isTransportNameUnique: (name: string) => boolean
  isRuleNameUnique: (name: string) => boolean
  isRuleProviderNameUnique: (name: string) => boolean
  isRuleGroupNameUnique: (name: string) => boolean
  isDerivedTagNameUnique: (name: string) => boolean
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
    seedStatus: 'idle',
    seedError: null,

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

    seedFromServer: (yaml: string) => {
      try {
        const config = parseConfigYaml(yaml)
        const { workingConfig, savedConfig } = get()
        if (!workingConfig) {
          // Store not initialised — seed both working and saved.
          set({ workingConfig: config, savedConfig: config, dirty: false, error: null })
        } else if (!savedConfig) {
          // Race: resetToEmpty ran before auto-load completed.  Backfill
          // savedConfig (diff baseline) and merge global so api.listen/secret
          // are not silently dropped on the next Apply.
          const global = workingConfig.global ?? config.global
          set({ workingConfig: { ...workingConfig, global }, savedConfig: config, error: null })
        }
        // If both are already set, the store was seeded from a prior visit — no-op.
        return null
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err)
        set({ error: message })
        return message
      }
    },

    resetToEmpty: () => {
      const { savedConfig, seedStatus, seedError } = get()
      if (isSeedBlocked({ savedConfig, seedStatus })) {
        // D-16: the server config was never loaded (fetch in flight or
        // failed) and there is no baseline. Starting an empty working
        // config here would let the next Apply PUT a near-empty document
        // and silently shut down the running control plane. Block instead.
        set({
          error:
            seedError ??
            (seedStatus === 'loading'
              ? 'server config is still loading'
              : 'server config could not be loaded'),
        })
        return false
      }
      const global = savedConfig?.global
      set({
        workingConfig: global ? { global } : {},
        savedConfig,
        dirty: true,
        error: null,
      })
      return true
    },

    markSeedLoading: () => set({ seedStatus: 'loading' }),
    markSeedReady: () => set({ seedStatus: 'ready', seedError: null }),
    markSeedFailed: (error: string) => set({ seedStatus: 'failed', seedError: error }),

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

    // C-D1: a YAML-mode hot reload PUTs the editor text, which can differ
    // from the configStore working config (the form side). The old code
    // called markSaved(), which snapped the baseline to the working config —
    // marking form edits that were never sent as "saved" and dismissing the
    // unsaved-changes banner. Instead: baseline = what the server actually
    // accepted; the form side keeps its unapplied edits pending.
    markSavedFromYaml: (yaml: string) => {
      try {
        const applied = parseConfigYaml(yaml)
        const { workingConfig, savedConfig } = get()
        // Adopt the applied YAML wholesale when the form side has nothing
        // pending: either it is clean (working == last saved baseline) or its
        // edits were included in the applied YAML (user bridged form → YAML
        // before applying). Only genuinely pending, unsent edits are kept.
        const formIsClean = !workingConfig || configEqual(workingConfig, savedConfig)
        const editsIncluded = !!workingConfig && configEqual(workingConfig, applied)
        if (formIsClean || editsIncluded) {
          set({ workingConfig: applied, savedConfig: applied, dirty: false, error: null })
        } else {
          // Form edits exist that the applied YAML does not include. Keep
          // them in the working config and only move the saved baseline.
          set({ savedConfig: applied, dirty: true, error: null })
        }
        return null
      } catch (err: unknown) {
        // The server accepted the config but our parser rejects it (schema
        // skew). Change nothing: keeping the stale baseline means the next
        // apply diff shows MORE changes, which is the safe direction.
        const message = err instanceof Error ? err.message : String(err)
        set({ error: message })
        return message
      }
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
