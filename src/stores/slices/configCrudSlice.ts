import { configEqual } from '@/lib/configHelpers'
import {
  removeDerivedTag,
  removeDriver,
  removeRule,
  removeRuleGroup,
  removeRuleProvider,
  removeTransport,
  upsertDerivedTag,
  upsertDriver,
  upsertRule,
  upsertRuleGroup,
  upsertRuleProvider,
  upsertTransport,
} from '@/lib/configYaml'
import type { ConfigStoreState } from '@/stores/configStore'
import type {
  CoreCConfig,
  DerivedTagConfig,
  DriverConfig,
  RuleConfig,
  RuleProviderConfig,
  TransportConfig,
} from '@/types/config'

/** CRUD mutation keys of the config store (the type-level slice). */
export type CrudSlice = Pick<
  ConfigStoreState,
  | 'upsertDriver'
  | 'removeDriver'
  | 'upsertTransport'
  | 'removeTransport'
  | 'upsertRule'
  | 'removeRule'
  | 'upsertRuleProvider'
  | 'removeRuleProvider'
  | 'upsertRuleGroup'
  | 'removeRuleGroup'
  | 'upsertDerivedTag'
  | 'removeDerivedTag'
>

// Internal: commit a new working config and recompute dirty.
function commit(
  set: (partial: Partial<ConfigStoreState>) => void,
  get: () => ConfigStoreState,
  next: CoreCConfig,
): void {
  set({ workingConfig: next, dirty: !configEqual(next, get().savedConfig), error: null })
}

export function createCrudSlice(
  set: (partial: Partial<ConfigStoreState>) => void,
  get: () => ConfigStoreState,
): CrudSlice {
  return {
    upsertDriver: (driver: DriverConfig) => {
      const { workingConfig } = get()
      if (!workingConfig) {
        set({ error: 'No working config loaded' })
        return false
      }
      const next = upsertDriver(workingConfig, driver)
      commit(set, get, next)
      return true
    },

    removeDriver: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeDriver(workingConfig, name)
      commit(set, get, next)
    },

    upsertTransport: (transport: TransportConfig) => {
      const { workingConfig } = get()
      if (!workingConfig) {
        set({ error: 'No working config loaded' })
        return false
      }
      const next = upsertTransport(workingConfig, transport)
      commit(set, get, next)
      return true
    },

    removeTransport: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeTransport(workingConfig, name)
      commit(set, get, next)
    },

    upsertRule: (rule: RuleConfig) => {
      const { workingConfig } = get()
      if (!workingConfig) {
        set({ error: 'No working config loaded' })
        return false
      }
      const next = upsertRule(workingConfig, rule)
      commit(set, get, next)
      return true
    },

    removeRule: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeRule(workingConfig, name)
      commit(set, get, next)
    },

    upsertRuleProvider: (provider: RuleProviderConfig) => {
      const { workingConfig } = get()
      if (!workingConfig) {
        set({ error: 'No working config loaded' })
        return false
      }
      const next = upsertRuleProvider(workingConfig, provider)
      commit(set, get, next)
      return true
    },

    removeRuleProvider: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeRuleProvider(workingConfig, name)
      commit(set, get, next)
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
      commit(set, get, next)
      return true
    },

    removeRuleGroup: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeRuleGroup(workingConfig, name)
      commit(set, get, next)
    },

    upsertDerivedTag: (tag: DerivedTagConfig) => {
      const { workingConfig } = get()
      if (!workingConfig) {
        set({ error: 'No working config loaded' })
        return false
      }
      const next = upsertDerivedTag(workingConfig, tag)
      commit(set, get, next)
      return true
    },

    removeDerivedTag: (name: string) => {
      const { workingConfig } = get()
      if (!workingConfig) return
      const next = removeDerivedTag(workingConfig, name)
      commit(set, get, next)
    },
  }
}
