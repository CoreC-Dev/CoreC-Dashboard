/**
 * CoreC Config YAML utilities.
 *
 * Provides typed parse/dump plus single-entity upsert/remove helpers.
 * CoreC 单资源创建/更新经 PUT /configs 全量回写；删除另有
 * DELETE /{drivers,transports,rules}/{name}。
 *
 * All entity mutations are pure: they return a NEW CoreCConfig object and
 * never mutate the input, so callers can build optimistic-update snapshots
 * safely.
 */
import { dump, JSON_SCHEMA, load } from 'js-yaml'
import { configEqual } from '@/lib/configHelpers'
import type {
  CoreCConfig,
  DerivedTagConfig,
  DriverConfig,
  RuleConfig,
  RuleProviderConfig,
  TransportConfig,
} from '@/types/config'

/**
 * Reject objects containing prototype-polluting keys (__proto__, constructor,
 * prototype) at any nesting depth. js-yaml's safe schema
 * prevents code execution but does not strip these keys from mappings.
 */
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function rejectProtoKeys(obj: unknown, path = ''): void {
  if (typeof obj !== 'object' || obj === null) return
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      rejectProtoKeys(obj[i], `${path}[${i}]`)
    }
    return
  }
  for (const key of Object.keys(obj)) {
    if (PROTO_KEYS.has(key)) {
      throw new Error(`Prototype-polluting key "${key}" at ${path || 'root'} is not allowed`)
    }
    rejectProtoKeys((obj as Record<string, unknown>)[key], path ? `${path}.${key}` : key)
  }
}

/** Parse a CoreC YAML document into a typed config object. Throws on invalid YAML. */
export function parseConfigYaml(yaml: string): CoreCConfig {
  const parsed = load(yaml, { schema: JSON_SCHEMA })
  if (parsed === undefined || parsed === null) {
    return {}
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Config root must be a YAML mapping (object), got ${typeof parsed}`)
  }
  rejectProtoKeys(parsed)
  return parsed as CoreCConfig
}

/** Dump options chosen to match CoreC's config style: no line wrapping, no refs. */
const DUMP_OPTS = {
  lineWidth: -1,
  noRefs: true,
  // sortKeys defaults to false → preserve insertion order for readability.
} as const

/** Serialize a typed config object back to a YAML string acceptable to CoreC. */
export function dumpConfigYaml(config: CoreCConfig): string {
  try {
    return dump(config, DUMP_OPTS)
  } catch (err) {
    // js-yaml identifies plain objects by realm-local prototype identity, so a
    // structurally plain config that crossed a realm boundary (iframe, worker,
    // test VM) is rejected as "unacceptable". Config is JSON data by contract;
    // normalize through JSON and retry once, then rethrow the original error.
    try {
      return dump(JSON.parse(JSON.stringify(config)) as CoreCConfig, DUMP_OPTS)
    } catch {
      throw err
    }
  }
}

/**
 * Whether a raw YAML document differs (semantically, not textually) from a
 * config object. Used by the Config Center to detect divergence between the
 * Monaco editor content and the configStore working copy:
 * the two are manually bridged states, and hot-reloading the YAML while the
 * form side holds unsent edits must be gated, not silently merged.
 *
 * - A YAML string that cannot be parsed counts as diverged.
 * - A null/undefined working config counts as NOT diverged (the form side
 *   has nothing at risk).
 */
export function yamlDiffersFromConfig(yaml: string, working: CoreCConfig | null): boolean {
  if (!working) return false
  try {
    return !configEqual(parseConfigYaml(yaml), working)
  } catch {
    return true
  }
}

// The four array-keyed entities — drivers[], transports[], rules[], and
// 'rule-providers'[] — each expose the same find/upsert/remove/isNameUnique
// quadruple, differing only in the config key and element type. This factory
// captures the shared logic; each named export below is a thin wrapper.
// rule-groups uses a Record shape (not an array) and is handled separately
// below.

/** Minimal shape required of an array-entity element (all four satisfy this). */
interface NamedEntity {
  name: string
}

function makeArrayEntityHelpers<E extends NamedEntity>(opts: {
  read: (config: CoreCConfig) => E[] | undefined
  write: (config: CoreCConfig, arr: E[]) => CoreCConfig
}): {
  find: (config: CoreCConfig, name: string) => E | undefined
  upsert: (config: CoreCConfig, entity: E) => CoreCConfig
  remove: (config: CoreCConfig, name: string) => CoreCConfig
  isNameUnique: (config: CoreCConfig, name: string) => boolean
} {
  const list = (config: CoreCConfig): E[] => opts.read(config) ?? []
  return {
    find: (config, name) => list(config).find((e) => e.name === name),
    upsert: (config, entity) => {
      const arr = [...list(config)]
      const idx = arr.findIndex((e) => e.name === entity.name)
      if (idx >= 0) {
        arr[idx] = entity
      } else {
        arr.push(entity)
      }
      return opts.write(config, arr)
    },
    remove: (config, name) =>
      opts.write(
        config,
        list(config).filter((e) => e.name !== name),
      ),
    isNameUnique: (config, name) => !list(config).some((e) => e.name === name),
  }
}

const driverHelpers = makeArrayEntityHelpers<DriverConfig>({
  read: (config) => config.drivers,
  write: (config, drivers) => ({ ...config, drivers }),
})

export function findDriver(config: CoreCConfig, name: string): DriverConfig | undefined {
  return driverHelpers.find(config, name)
}

/**
 * Add or replace a driver in the config (keyed by name).
 * Returns a new config object; the input is not mutated.
 */
export function upsertDriver(config: CoreCConfig, driver: DriverConfig): CoreCConfig {
  return driverHelpers.upsert(config, driver)
}

export function removeDriver(config: CoreCConfig, name: string): CoreCConfig {
  return driverHelpers.remove(config, name)
}

const transportHelpers = makeArrayEntityHelpers<TransportConfig>({
  read: (config) => config.transports,
  write: (config, transports) => ({ ...config, transports }),
})

export function findTransport(config: CoreCConfig, name: string): TransportConfig | undefined {
  return transportHelpers.find(config, name)
}

export function upsertTransport(config: CoreCConfig, transport: TransportConfig): CoreCConfig {
  return transportHelpers.upsert(config, transport)
}

export function removeTransport(config: CoreCConfig, name: string): CoreCConfig {
  return transportHelpers.remove(config, name)
}

const ruleHelpers = makeArrayEntityHelpers<RuleConfig>({
  read: (config) => config.rules,
  write: (config, rules) => ({ ...config, rules }),
})

export function findRule(config: CoreCConfig, name: string): RuleConfig | undefined {
  return ruleHelpers.find(config, name)
}

/**
 * Add or replace a rule in the config (keyed by name).
 * NOTE: CoreC evaluates rules in priority order (lowest number = highest
 * priority). Callers may reorder by priority after upsert if needed.
 */
export function upsertRule(config: CoreCConfig, rule: RuleConfig): CoreCConfig {
  return ruleHelpers.upsert(config, rule)
}

export function removeRule(config: CoreCConfig, name: string): CoreCConfig {
  return ruleHelpers.remove(config, name)
}

/** Returns true if `name` is unique among existing drivers (case-sensitive). */
export function isDriverNameUnique(config: CoreCConfig, name: string): boolean {
  return driverHelpers.isNameUnique(config, name)
}

export function isTransportNameUnique(config: CoreCConfig, name: string): boolean {
  return transportHelpers.isNameUnique(config, name)
}

export function isRuleNameUnique(config: CoreCConfig, name: string): boolean {
  return ruleHelpers.isNameUnique(config, name)
}

const ruleProviderHelpers = makeArrayEntityHelpers<RuleProviderConfig>({
  read: (config) => config['rule-providers'],
  write: (config, providers) => ({ ...config, 'rule-providers': providers }),
})

export function findRuleProvider(
  config: CoreCConfig,
  name: string,
): RuleProviderConfig | undefined {
  return ruleProviderHelpers.find(config, name)
}

export function upsertRuleProvider(config: CoreCConfig, provider: RuleProviderConfig): CoreCConfig {
  return ruleProviderHelpers.upsert(config, provider)
}

export function removeRuleProvider(config: CoreCConfig, name: string): CoreCConfig {
  return ruleProviderHelpers.remove(config, name)
}

export function isRuleProviderNameUnique(config: CoreCConfig, name: string): boolean {
  return ruleProviderHelpers.isNameUnique(config, name)
}

export function findRuleGroup(config: CoreCConfig, name: string): RuleConfig[] | undefined {
  return config['rule-groups']?.[name]
}

export function upsertRuleGroup(
  config: CoreCConfig,
  name: string,
  rules: RuleConfig[],
): CoreCConfig {
  const groups = { ...(config['rule-groups'] ?? {}) }
  groups[name] = rules
  return { ...config, 'rule-groups': groups }
}

export function removeRuleGroup(config: CoreCConfig, name: string): CoreCConfig {
  const groups = { ...(config['rule-groups'] ?? {}) }
  delete groups[name]
  return { ...config, 'rule-groups': groups }
}

export function isRuleGroupNameUnique(config: CoreCConfig, name: string): boolean {
  return !(config['rule-groups'] && name in config['rule-groups'])
}

const derivedTagHelpers = makeArrayEntityHelpers<DerivedTagConfig>({
  read: (config) => config['derived-tags'],
  write: (config, tags) => ({ ...config, 'derived-tags': tags }),
})

export function findDerivedTag(config: CoreCConfig, name: string): DerivedTagConfig | undefined {
  return derivedTagHelpers.find(config, name)
}

export function upsertDerivedTag(config: CoreCConfig, tag: DerivedTagConfig): CoreCConfig {
  return derivedTagHelpers.upsert(config, tag)
}

export function removeDerivedTag(config: CoreCConfig, name: string): CoreCConfig {
  return derivedTagHelpers.remove(config, name)
}

export function isDerivedTagNameUnique(config: CoreCConfig, name: string): boolean {
  return derivedTagHelpers.isNameUnique(config, name)
}
