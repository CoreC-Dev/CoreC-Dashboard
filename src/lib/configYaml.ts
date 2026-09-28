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

// ─── Driver entity helpers ───────────────────────────────────────────

/** Find a driver by name. Returns undefined if absent. */
export function findDriver(config: CoreCConfig, name: string): DriverConfig | undefined {
  return config.drivers?.find((d) => d.name === name)
}

/**
 * Add or replace a driver in the config (keyed by name).
 * Returns a new config object; the input is not mutated.
 */
export function upsertDriver(config: CoreCConfig, driver: DriverConfig): CoreCConfig {
  const drivers = [...(config.drivers ?? [])]
  const idx = drivers.findIndex((d) => d.name === driver.name)
  if (idx >= 0) {
    drivers[idx] = driver
  } else {
    drivers.push(driver)
  }
  return { ...config, drivers }
}

/** Remove a driver by name. No-op if absent. Returns a new config object. */
export function removeDriver(config: CoreCConfig, name: string): CoreCConfig {
  const drivers = (config.drivers ?? []).filter((d) => d.name !== name)
  return { ...config, drivers }
}

// ─── Transport entity helpers ────────────────────────────────────────

export function findTransport(config: CoreCConfig, name: string): TransportConfig | undefined {
  return config.transports?.find((t) => t.name === name)
}

export function upsertTransport(config: CoreCConfig, transport: TransportConfig): CoreCConfig {
  const transports = [...(config.transports ?? [])]
  const idx = transports.findIndex((t) => t.name === transport.name)
  if (idx >= 0) {
    transports[idx] = transport
  } else {
    transports.push(transport)
  }
  return { ...config, transports }
}

export function removeTransport(config: CoreCConfig, name: string): CoreCConfig {
  const transports = (config.transports ?? []).filter((t) => t.name !== name)
  return { ...config, transports }
}

// ─── Rule entity helpers ─────────────────────────────────────────────

export function findRule(config: CoreCConfig, name: string): RuleConfig | undefined {
  return config.rules?.find((r) => r.name === name)
}

/**
 * Add or replace a rule in the config (keyed by name).
 * NOTE: CoreC evaluates rules in priority order (lowest number = highest
 * priority). Callers may reorder by priority after upsert if needed.
 */
export function upsertRule(config: CoreCConfig, rule: RuleConfig): CoreCConfig {
  const rules = [...(config.rules ?? [])]
  const idx = rules.findIndex((r) => r.name === rule.name)
  if (idx >= 0) {
    rules[idx] = rule
  } else {
    rules.push(rule)
  }
  return { ...config, rules }
}

export function removeRule(config: CoreCConfig, name: string): CoreCConfig {
  const rules = (config.rules ?? []).filter((r) => r.name !== name)
  return { ...config, rules }
}

// ─── Name-uniqueness validation (mirrors config.validate) ────────────

/** Returns true if `name` is unique among existing drivers (case-sensitive). */
export function isDriverNameUnique(config: CoreCConfig, name: string): boolean {
  return !(config.drivers ?? []).some((d) => d.name === name)
}

export function isTransportNameUnique(config: CoreCConfig, name: string): boolean {
  return !(config.transports ?? []).some((t) => t.name === name)
}

export function isRuleNameUnique(config: CoreCConfig, name: string): boolean {
  return !(config.rules ?? []).some((r) => r.name === name)
}

// ─── Rule Providers (rule-providers[]) ────────────────────────────────

/** Find a rule provider by name. */
export function findRuleProvider(
  config: CoreCConfig,
  name: string,
): RuleProviderConfig | undefined {
  return config['rule-providers']?.find((p) => p.name === name)
}

/** Add or replace a rule provider (keyed by name). */
export function upsertRuleProvider(config: CoreCConfig, provider: RuleProviderConfig): CoreCConfig {
  const providers = [...(config['rule-providers'] ?? [])]
  const idx = providers.findIndex((p) => p.name === provider.name)
  if (idx >= 0) {
    providers[idx] = provider
  } else {
    providers.push(provider)
  }
  return { ...config, 'rule-providers': providers }
}

/** Remove a rule provider by name. */
export function removeRuleProvider(config: CoreCConfig, name: string): CoreCConfig {
  const providers = (config['rule-providers'] ?? []).filter((p) => p.name !== name)
  return { ...config, 'rule-providers': providers }
}

/** Check rule-provider name uniqueness. */
export function isRuleProviderNameUnique(config: CoreCConfig, name: string): boolean {
  return !(config['rule-providers'] ?? []).some((p) => p.name === name)
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

/** Rename a rule group (moves the rules to a new key, removes the old one). */
export function renameRuleGroup(
  config: CoreCConfig,
  oldName: string,
  newName: string,
): CoreCConfig {
  const groups = { ...(config['rule-groups'] ?? {}) }
  const rules = groups[oldName]
  if (rules === undefined) return config
  delete groups[oldName]
  groups[newName] = rules
  return { ...config, 'rule-groups': groups }
}

/** Check rule-group name uniqueness. */
export function isRuleGroupNameUnique(config: CoreCConfig, name: string): boolean {
  return !(config['rule-groups'] && name in config['rule-groups'])
}
