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
} from '@/lib/configYaml'
import type { ConfigStoreState } from '../configStore'

/** Derived-getter keys extracted from the God Object (TD-ARCH-003). */
export type GetterSlice = Pick<
  ConfigStoreState,
  | 'getWorkingYaml'
  | 'getSavedYaml'
  | 'findDriver'
  | 'findTransport'
  | 'findRule'
  | 'findRuleProvider'
  | 'findRuleGroup'
  | 'isDriverNameUnique'
  | 'isTransportNameUnique'
  | 'isRuleNameUnique'
  | 'isRuleProviderNameUnique'
  | 'isRuleGroupNameUnique'
>

export function createGetterSlice(
  _set: (partial: Partial<ConfigStoreState>) => void,
  get: () => ConfigStoreState,
): GetterSlice {
  return {
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
}
