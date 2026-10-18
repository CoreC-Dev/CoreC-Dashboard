/**
 * Rule → driver dependency scan (UX audit C-A3).
 *
 * Rules reference drivers only through their match DSL — there is no
 * structural `source` field — so "which rules lose their data source
 * when this driver is deleted?" is answered by parsing the clause
 * shapes the DSL actually supports (==, !=, >, <, >=, <=, contains, =~):
 *
 *   - `driver == "plc1"` / `driver contains "plc"` / a `driver =~ <regex>`
 *     clause depend on the driver directly (== and contains use the
 *     engine's own semantics: exact and substring; =~ is evaluated, and
 *     an uncompilable regex conservatively counts as a dependency);
 *   - `driver != "x"` and a bare truthy `driver` do NOT single this
 *     driver out — the rule keeps matching other drivers' points;
 *   - a rule with NO driver clause at all still consumes this driver's
 *     data through its tags (`tag == "temperature"`); such a rule is
 *     listed only when no OTHER configured driver also owns that tag;
 *   - `SUB-RULE:group` matches are resolved one level deep through the
 *     configured rule-groups (RULE-SET references external files and is
 *     skipped — it cannot be scanned from here).
 *
 * All functions are pure; the delete-confirm dialog feeds them the
 * union of the working and saved configs so pending (unapplied) rules
 * warn too.
 */
import type { CoreCConfig, RuleConfig } from '@/types/config'

export interface DriverDependencyInput {
  /** The driver being deleted. */
  driver: { name: string; tags?: readonly { name: string }[] }
  /** Every configured driver (working ∪ saved) — used to test whether a
   *  tag clause survives via another driver. */
  allDrivers: readonly { name: string; tags?: { name: string }[] }[]
  /** Rules to scan (working ∪ saved, deduped by name upstream). */
  rules: readonly RuleConfig[]
  /** Configured rule-groups for SUB-RULE resolution. */
  groups?: Record<string, RuleConfig[]>
}

interface MatchClause {
  field: string
  op: string
  literal: string
}

// field OP "literal" | field OP /regex/ — the DSL's quoted-literal and
// regex-literal clause shapes.
const CLAUSE_RE = /(\w+)\s*(==|!=|>=|<=|>|<|contains|=~)\s*(?:"([^"]*)"|\/((?:[^/\\]|\\.)+)\/)/g

function extractClauses(match: string): MatchClause[] {
  const clauses: MatchClause[] = []
  CLAUSE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = CLAUSE_RE.exec(match)) !== null) {
    clauses.push({ field: m[1]!, op: m[2]!, literal: m[3] ?? m[4] ?? '' })
  }
  return clauses
}

/** Does a driver-field clause single out `name`? */
function driverClauseReferences(clause: MatchClause, name: string): boolean {
  switch (clause.op) {
    case '==':
      return clause.literal === name
    case 'contains':
      return name.includes(clause.literal)
    case '=~':
      try {
        return new RegExp(clause.literal).test(name)
      } catch {
        return true // broken regex — warn rather than stay silent
      }
    default:
      return false // != and friends point AWAY from this driver
  }
}

/** Tag-clause semantics against a set of tag names. */
function tagClauseReferences(clause: MatchClause, tagNames: readonly string[]): boolean {
  switch (clause.op) {
    case '==':
      return tagNames.includes(clause.literal)
    case 'contains':
      return tagNames.some((t) => t.includes(clause.literal))
    case '=~':
      try {
        const re = new RegExp(clause.literal)
        return tagNames.some((t) => re.test(t))
      } catch {
        return true
      }
    default:
      return false
  }
}

function matchReferencesDriver(
  match: string,
  driver: DriverDependencyInput['driver'],
  allDrivers: DriverDependencyInput['allDrivers'],
): boolean {
  if (!match || match === 'ALL') return false
  const clauses = extractClauses(match)
  const driverClauses = clauses.filter((c) => c.field === 'driver')
  if (driverClauses.length > 0) {
    return driverClauses.some((c) => driverClauseReferences(c, driver.name))
  }
  // A bare truthy `driver` matches any driver's points — deleting one
  // driver does not orphan the rule. Literals are stripped first so a
  // quoted value like "driver-temp" cannot masquerade as the field.
  const stripped = match.replace(/"[^"]*"/g, '').replace(/\/(?:[^/\\]|\\.)+\//g, '')
  if (/\bdriver\b/.test(stripped)) return false
  // No driver restriction: the rule may still consume this driver's
  // data through its tags — but only if no other driver owns them.
  const myTags = (driver.tags ?? []).map((t) => t.name)
  if (myTags.length === 0) return false
  const others = allDrivers.filter((d) => d.name !== driver.name)
  const othersTags = new Set(others.flatMap((d) => (d.tags ?? []).map((t) => t.name)))
  const uniqueTags = myTags.filter((t) => !othersTags.has(t))
  if (uniqueTags.length === 0) return false
  return clauses.filter((c) => c.field === 'tag').some((c) => tagClauseReferences(c, uniqueTags))
}

/** Rules (with SUB-RULE:group resolution) that depend on the driver. */
export function rulesDependingOnDriver(input: DriverDependencyInput): RuleConfig[] {
  const { driver, allDrivers, rules, groups } = input

  const matchDepends = (match: string, visited: ReadonlySet<string>): boolean => {
    const sub = /^(?:SUB-RULE|RULE-SET):(.+)$/.exec(match.trim())
    if (sub?.[1] && match.trim().startsWith('SUB-RULE:')) {
      const groupName = sub[1]
      if (visited.has(groupName)) return false
      const subRules = groups?.[groupName] ?? []
      return subRules.some((r) => matchDepends(r.match, new Set([...visited, groupName])))
    }
    return matchReferencesDriver(match, driver, allDrivers)
  }

  return rules.filter((r) => matchDepends(r.match, new Set()))
}

/** Working ∪ saved rule sets, groups and drivers for the delete scan. */
export interface DependencyScanSources {
  rules: RuleConfig[]
  groups: Record<string, RuleConfig[]>
  allDrivers: { name: string; tags?: { name: string }[] }[]
}

/**
 * Merge the working and saved rule sets (and rule-groups) by name for
 * the delete scan: a rule created in the working config but not yet
 * applied is exactly the one the operator would be surprised to break.
 * Working-config entries win the name collision — they are what the
 * next apply would put on the server. Driver duplicates also resolve to
 * the working-config entry (the store's own upsert semantics).
 */
export function unionRulesForDependencyScan(
  working: CoreCConfig | null,
  saved: CoreCConfig | null,
): DependencyScanSources {
  const byName = new Map<string, RuleConfig>()
  for (const src of [saved?.rules ?? [], working?.rules ?? []]) {
    for (const r of src) byName.set(r.name, r)
  }
  const driverByName = new Map<string, { name: string; tags?: { name: string }[] }>()
  for (const src of [saved?.drivers ?? [], working?.drivers ?? []]) {
    for (const d of src) driverByName.set(d.name, { name: d.name, tags: d.tags })
  }
  return {
    rules: [...byName.values()],
    groups: { ...(saved?.['rule-groups'] ?? {}), ...(working?.['rule-groups'] ?? {}) },
    allDrivers: [...driverByName.values()],
  }
}
