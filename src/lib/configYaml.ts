/**
 * CoreC Config YAML utilities.
 *
 * Provides typed parse/dump plus single-entity upsert/remove helpers that
 * implement the "read full config → modify one entity → PUT /configs"
 * workflow dictated by CoreC's API (no per-resource CRUD endpoints).
 *
 * All entity mutations are pure: they return a NEW CoreCConfig object and
 * never mutate the input, so callers can build optimistic-update snapshots
 * safely.
 */
import { dump, load } from 'js-yaml'
import type {
  CoreCConfig,
  DriverConfig,
  RuleConfig,
  RuleProviderConfig,
  TransportConfig,
} from '@/types/config'

// ─── Parse / dump ────────────────────────────────────────────────────

/** Parse a CoreC YAML document into a typed config object. Throws on invalid YAML. */
export function parseConfigYaml(yaml: string): CoreCConfig {
  const parsed = load(yaml)
  if (parsed === undefined || parsed === null) {
    return {}
  }
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Config root must be a YAML mapping (object), got ${typeof parsed}`)
  }
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
  return dump(config, DUMP_OPTS)
}

// ─── Array entity helpers (driver / transport / rule / rule-provider) ─
// The four array-keyed entities — drivers[], transports[], rules[], and
// 'rule-providers'[] — each expose the same find/upsert/remove/isNameUnique
// quadruple, differing only in the config key and element type. This factory
// captures the shared logic; each named export below is a thin wrapper so the
// public API (consumed by configStore) stays byte-identical to the previous
// hand-written implementations. rule-groups uses a Record shape (not an
// array) and is left as-is below.

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

// ─── Driver entity helpers ───────────────────────────────────────────

const driverHelpers = makeArrayEntityHelpers<DriverConfig>({
  read: (config) => config.drivers,
  write: (config, drivers) => ({ ...config, drivers }),
})

/** Find a driver by name. Returns undefined if absent. */
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

/** Remove a driver by name. No-op if absent. Returns a new config object. */
export function removeDriver(config: CoreCConfig, name: string): CoreCConfig {
  return driverHelpers.remove(config, name)
}

// ─── Transport entity helpers ────────────────────────────────────────

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

// ─── Rule entity helpers ─────────────────────────────────────────────

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

// ─── Name-uniqueness validation (mirrors config.validate) ────────────

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

// ─── Rule Providers (rule-providers[]) ────────────────────────────────

const ruleProviderHelpers = makeArrayEntityHelpers<RuleProviderConfig>({
  read: (config) => config['rule-providers'],
  write: (config, providers) => ({ ...config, 'rule-providers': providers }),
})

/** Find a rule provider by name. */
export function findRuleProvider(
  config: CoreCConfig,
  name: string,
): RuleProviderConfig | undefined {
  return ruleProviderHelpers.find(config, name)
}

/** Add or replace a rule provider (keyed by name). */
export function upsertRuleProvider(config: CoreCConfig, provider: RuleProviderConfig): CoreCConfig {
  return ruleProviderHelpers.upsert(config, provider)
}

/** Remove a rule provider by name. */
export function removeRuleProvider(config: CoreCConfig, name: string): CoreCConfig {
  return ruleProviderHelpers.remove(config, name)
}

/** Check rule-provider name uniqueness. */
export function isRuleProviderNameUnique(config: CoreCConfig, name: string): boolean {
  return ruleProviderHelpers.isNameUnique(config, name)
}

// ─── Rule Groups (rule-groups: Record<string, RuleConfig[]>) ──────────

/** Find a rule group by name. */
export function findRuleGroup(config: CoreCConfig, name: string): RuleConfig[] | undefined {
  return config['rule-groups']?.[name]
}

/** Add or replace a rule group (keyed by group name). */
export function upsertRuleGroup(
  config: CoreCConfig,
  name: string,
  rules: RuleConfig[],
): CoreCConfig {
  const groups = { ...(config['rule-groups'] ?? {}) }
  groups[name] = rules
  return { ...config, 'rule-groups': groups }
}

/** Remove a rule group by name. */
export function removeRuleGroup(config: CoreCConfig, name: string): CoreCConfig {
  const groups = { ...(config['rule-groups'] ?? {}) }
  delete groups[name]
  return { ...config, 'rule-groups': groups }
}

/** Rename a rule group (moves the rules to a new key, removes the old one).
 *  Throws if the target name already exists (and differs from the source) to
 *  prevent silently overwriting an existing group's rules. Callers should
 *  check `isRuleGroupNameUnique` first for a non-throwing guard. [M-2] */
export function renameRuleGroup(
  config: CoreCConfig,
  oldName: string,
  newName: string,
): CoreCConfig {
  const groups = { ...(config['rule-groups'] ?? {}) }
  const rules = groups[oldName]
  if (rules === undefined) return config
  if (oldName !== newName && groups[newName] !== undefined) {
    throw new Error(`Target rule-group name "${newName}" already exists`)
  }
  delete groups[oldName]
  groups[newName] = rules
  return { ...config, 'rule-groups': groups }
}

/** Check rule-group name uniqueness. */
export function isRuleGroupNameUnique(config: CoreCConfig, name: string): boolean {
  return !(config['rule-groups'] && name in config['rule-groups'])
}
