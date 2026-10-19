/**
 * SUB-RULE reference scanning & rewriting (UX audit C-B5).
 *
 * Renaming a rule group silently invalidates every `SUB-RULE:old-name`
 * match out there — top-level rules AND other groups' sub-rules — until
 * the next apply fails. These pure helpers find those references before
 * the rename and rewrite them when the operator opts in.
 *
 * Reference shapes recognized (mirroring the editor's quick-fill chips):
 *   match: "SUB-RULE:group-a"
 *   match: 'SUB-RULE:group-a && value > 80'
 * A prefix-safe boundary (`(?![\w-])`) keeps renaming "group-a" from
 * touching "group-ab" or "group-a-2".
 */
import type { CoreCConfig, RuleConfig } from '@/types/config'

export interface SubRuleRef {
  /** The rule whose match references the group. */
  ruleName: string
  /** Which rules collection holds it — null = top-level rules. */
  inGroup: string | null
  /** The full match expression containing the reference. */
  match: string
}

const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Does this match expression reference `groupName` via SUB-RULE? */
export function matchReferencesSubRule(match: string, groupName: string): boolean {
  if (!match) return false
  return new RegExp(`SUB-RULE:${escapeRegExp(groupName)}(?![\\w-])`).test(match)
}

/** Rewrite every `SUB-RULE:oldName` reference in a match to `SUB-RULE:newName`. */
export function rewriteSubRuleRefs(match: string, oldName: string, newName: string): string {
  if (!match) return match
  return match.replace(
    new RegExp(`SUB-RULE:${escapeRegExp(oldName)}(?![\\w-])`, 'g'),
    `SUB-RULE:${newName}`,
  )
}

/**
 * Every rule (top-level + inside other groups) whose match references
 * `groupName` via SUB-RULE. The renamed group's own rules are skipped —
 * they move with the group, they don't dangle.
 */
export function findSubRuleReferences(config: CoreCConfig | null, groupName: string): SubRuleRef[] {
  if (!config) return []
  const refs: SubRuleRef[] = []
  for (const rule of config.rules ?? []) {
    if (matchReferencesSubRule(rule.match ?? '', groupName)) {
      refs.push({ ruleName: rule.name, inGroup: null, match: rule.match })
    }
  }
  for (const [group, rules] of Object.entries(config['rule-groups'] ?? {})) {
    if (group === groupName) continue
    for (const rule of rules) {
      if (matchReferencesSubRule(rule.match ?? '', groupName)) {
        refs.push({ ruleName: rule.name, inGroup: group, match: rule.match })
      }
    }
  }
  return refs
}

/**
 * Apply the reference rewrite across a rules array (top-level or one
 * group's) — returns the same array when nothing references the old name.
 */
export function rewriteRuleListRefs(
  rules: RuleConfig[],
  oldName: string,
  newName: string,
): RuleConfig[] {
  return rules.map((r) =>
    matchReferencesSubRule(r.match ?? '', oldName)
      ? { ...r, match: rewriteSubRuleRefs(r.match ?? '', oldName, newName) }
      : r,
  )
}
