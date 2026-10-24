/**
 * configSchema/validators.ts — cross-entity validation rules that zod
 * schemas alone can't express (mirrors CoreC config.validate's
 * cross-cutting rules): name uniqueness, target references, data-source
 * presence, transport fallbacks, SUB-RULE cycles.
 */
import { DRIVER_TYPES, TRANSPORT_TYPES } from '@/types/config'

export interface ConfigValidationError {
  path: string
  message: string
}

export interface ConfigValidationResult {
  valid: boolean
  errors: ConfigValidationError[]
  /** Non-blocking warnings (e.g. no data source / no transport in idle mode). */
  warnings: ConfigValidationError[]
}

/** Inbound transport: mqtt with data-topic, or http with webhook-addr. */
export function isInboundTransport(t: { settings?: Record<string, unknown> }): boolean {
  const s = t.settings ?? {}
  const dt = s['data-topic']
  if (typeof dt === 'string' && dt !== '') return true
  const wa = s['webhook-addr']
  if (typeof wa === 'string' && wa !== '') return true
  return false
}

function hasAutoDiscoveryInbound(node: { id?: string; subscribe?: string[] } | undefined): boolean {
  return !!node?.id && !!node?.subscribe && node.subscribe.length > 0
}

/**
 * Check that each rule's target / targets reference an existing transport.
 * Returns the produced errors (in iteration order); byte-identical to the
 * inline loops previously duplicated for top-level `rules` and `rule-groups`.
 * `pathFor(ruleName)` yields the path prefix (without the trailing
 * `.target`/`.targets`), e.g. `rules[foo]` or `rule-groups[g].foo`.
 */
export function checkRuleTargetRefs(
  rules: { name: string; target?: string; targets?: string[] }[],
  transportNames: Set<string>,
  pathFor: (ruleName: string) => string,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = []
  for (const r of rules) {
    if (r.target && !transportNames.has(r.target)) {
      errors.push({
        path: `${pathFor(r.name)}.target`,
        message: `target transport "${r.target}" not found`,
      })
    }
    for (const tgt of r.targets ?? []) {
      if (!transportNames.has(tgt)) {
        errors.push({
          path: `${pathFor(r.name)}.targets`,
          message: `target transport "${tgt}" not found`,
        })
      }
    }
  }
  return errors
}

/** Structural shape used by the cross-entity validators. */
type CrossEntityConfig = {
  node?: { id?: string; subscribe?: string[] }
  drivers?: { name: string; type: string; tags?: { name: string }[] }[]
  transports?: {
    name: string
    type: string
    settings?: Record<string, unknown>
    fallback?: string
  }[]
  rules?: { name: string; target?: string; targets?: string[] }[]
  'rule-groups'?: Record<
    string,
    { name: string; match?: string; target?: string; targets?: string[] }[]
  >
}

/** At least one data source: a driver, an inbound transport, or auto-discovery. */
export function checkDataSourcePresence(
  drivers: { name: string; type: string }[],
  transports: { settings?: Record<string, unknown> }[],
  node: { id?: string; subscribe?: string[] } | undefined,
): ConfigValidationError[] {
  if (
    drivers.length === 0 &&
    !transports.some(isInboundTransport) &&
    !hasAutoDiscoveryInbound(node)
  ) {
    return [
      {
        path: 'drivers',
        message:
          'no data source: configure at least one driver, or an inbound transport (mqtt data-topic / http webhook-addr), or enable auto-discovery with node.subscribe',
      },
    ]
  }
  return []
}

/** At least one transport must be configured. */
export function checkTransportPresence(transports: { name: string }[]): ConfigValidationError[] {
  if (transports.length === 0) {
    return [{ path: 'transports', message: 'at least one transport must be configured' }]
  }
  return []
}

/** Driver name uniqueness + type registry (config.validate:139-155). */
export function checkDriverNames(
  drivers: { name: string; type: string }[],
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = []
  const driverNames = new Set<string>()
  for (const d of drivers) {
    if (driverNames.has(d.name)) {
      errors.push({ path: `drivers[${d.name}]`, message: `duplicate driver name: ${d.name}` })
    }
    driverNames.add(d.name)
    if (DRIVER_TYPES.length > 0 && !DRIVER_TYPES.includes(d.type as never)) {
      errors.push({
        path: `drivers[${d.name}].type`,
        message: `unknown driver type "${d.type}" (registered: ${DRIVER_TYPES.join(', ')})`,
      })
    }
  }
  return errors
}

/** Transport name uniqueness + type registry (config.validate:210-226). */
export function checkTransportNames(transports: { name: string; type: string }[]): {
  names: Set<string>
  errors: ConfigValidationError[]
} {
  const errors: ConfigValidationError[] = []
  const names = new Set<string>()
  for (const t of transports) {
    if (names.has(t.name)) {
      errors.push({ path: `transports[${t.name}]`, message: `duplicate transport name: ${t.name}` })
    }
    names.add(t.name)
    if (TRANSPORT_TYPES.length > 0 && !TRANSPORT_TYPES.includes(t.type as never)) {
      errors.push({
        path: `transports[${t.name}].type`,
        message: `unknown transport type "${t.type}" (registered: ${TRANSPORT_TYPES.join(', ')})`,
      })
    }
  }
  return { names, errors }
}

/** Transport fallback must reference an existing, distinct transport. */
export function checkTransportFallbacks(
  transports: { name: string; fallback?: string }[],
  transportNames: Set<string>,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = []
  for (const t of transports) {
    if (t.fallback && !transportNames.has(t.fallback)) {
      errors.push({
        path: `transports[${t.name}].fallback`,
        message: `fallback transport "${t.fallback}" not found`,
      })
    }
    // Self-fallback is a no-op (transport falls back to itself = infinite loop)
    if (t.fallback && t.fallback === t.name) {
      errors.push({
        path: `transports[${t.name}].fallback`,
        message: `fallback transport cannot be itself ("${t.name}")`,
      })
    }
  }
  return errors
}

/**
 * Rule groups: validate target refs inside group rules + detect circular
 * SUB-RULE references via DFS (mirrors rule/engine.go:98-112
 * detectCircularSubRules). A rule's match field can be "SUB-RULE:group-name"
 * to delegate to a named sub-rule group; circular chains (A→B→A) are caught.
 */
export function checkSubRuleCycles(
  ruleGroups: Record<
    string,
    { name: string; match?: string; target?: string; targets?: string[] }[]
  >,
  transportNames: Set<string>,
): ConfigValidationError[] {
  const errors: ConfigValidationError[] = []
  const groupNames = Object.keys(ruleGroups)
  if (groupNames.length === 0) return errors

  // Validate target references inside group rules
  for (const [groupName, groupRules] of Object.entries(ruleGroups)) {
    errors.push(
      ...checkRuleTargetRefs(
        groupRules ?? [],
        transportNames,
        (name) => `rule-groups[${groupName}].${name}`,
      ),
    )
  }

  // Detect circular SUB-RULE references via DFS
  const SUB_RULE_PREFIX = 'SUB-RULE:'
  const visited = new Set<string>()
  const inStack = new Set<string>()

  const detectCycle = (name: string, chain: string[]): boolean => {
    if (inStack.has(name)) {
      errors.push({
        path: `rule-groups[${name}]`,
        message: `circular sub-rule reference: ${chain.join(' -> ')} -> ${name}`,
      })
      return true
    }
    if (visited.has(name)) return false
    visited.add(name)
    inStack.add(name)

    const groupRules = ruleGroups[name] ?? []
    let foundCycle = false
    for (const r of groupRules) {
      const matchUpper = (r.match ?? '').toUpperCase()
      if (matchUpper.startsWith(SUB_RULE_PREFIX)) {
        const refName = (r.match ?? '').slice(SUB_RULE_PREFIX.length).trim()
        if (ruleGroups[refName] !== undefined) {
          if (detectCycle(refName, [...chain, name])) {
            foundCycle = true
            break
          }
        } else {
          // Reference to non-existent group
          errors.push({
            path: `rule-groups[${name}].${r.name}.match`,
            message: `SUB-RULE references non-existent group "${refName}"`,
          })
        }
      }
    }

    // Always unwind inStack — even when a cycle was found in a child — so
    // stale entries don't trigger false cycle reports for later top-level
    // iterations that reference this node.
    inStack.delete(name)
    return foundCycle
  }

  for (const name of groupNames) {
    if (!visited.has(name)) {
      detectCycle(name, [])
    }
  }
  return errors
}

/**
 * Validate cross-entity consistency rules that zod schemas can't express.
 * Run this AFTER schema.parse() succeeds (shape/intra-entity checks pass).
 * Mirrors config.validate:122-272. Delegates to named pure validators so
 * each cross-entity rule is testable in isolation.
 */
export function validateConfig(config: unknown): ConfigValidationResult {
  const cfg = config as CrossEntityConfig
  const drivers = cfg.drivers ?? []
  const transports = cfg.transports ?? []
  const rules = cfg.rules ?? []
  const ruleGroups = cfg['rule-groups'] ?? {}

  const errors: ConfigValidationError[] = []
  // Presence checks (data source / transport) are non-blocking warnings,
  // not hard errors: an empty or API-only config is a valid idle startup
  // state for the dashboard-driven workflow. Mirrors the server-side
  // config.IdleWarnings (config/validate.go).
  const warnings: ConfigValidationError[] = []
  warnings.push(...checkDataSourcePresence(drivers, transports, cfg.node))
  warnings.push(...checkTransportPresence(transports))
  errors.push(...checkDriverNames(drivers))
  const { names: transportNames, errors: transportNameErrors } = checkTransportNames(transports)
  errors.push(...transportNameErrors)
  errors.push(...checkTransportFallbacks(transports, transportNames))
  errors.push(...checkRuleTargetRefs(rules, transportNames, (name) => `rules[${name}]`))
  errors.push(...checkSubRuleCycles(ruleGroups, transportNames))

  return { valid: errors.length === 0, errors, warnings }
}
