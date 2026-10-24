import { describe, expect, it } from 'vitest'
import {
  findSubRuleReferences,
  matchReferencesSubRule,
  rewriteRuleListRefs,
  rewriteSubRuleRefs,
} from '@/lib/subRuleRefs'
import type { CoreCConfig, RuleConfig } from '@/types/config'

const rule = (name: string, match: string): RuleConfig => ({
  name,
  match,
  action: 'drop',
  priority: 100,
})

const CONFIG: CoreCConfig = {
  rules: [
    rule('top-exact', 'SUB-RULE:group-a'),
    rule('top-compound', 'SUB-RULE:group-a && value > 80'),
    rule('top-other', 'SUB-RULE:group-b'),
    rule('top-untouched', 'driver == "plc1"'),
  ],
  'rule-groups': {
    'group-a': [rule('inner-1', 'tag == "temp"')],
    'group-b': [rule('nested', 'SUB-RULE:group-a && value > 80')],
    'group-ab': [rule('prefix-trap', 'SUB-RULE:group-ab')],
  },
}

describe('matchReferencesSubRule', () => {
  it('matches exact and compound references', () => {
    expect(matchReferencesSubRule('SUB-RULE:group-a', 'group-a')).toBe(true)
    expect(matchReferencesSubRule('SUB-RULE:group-a && value > 80', 'group-a')).toBe(true)
  })

  it('does not match other groups or prefix collisions', () => {
    expect(matchReferencesSubRule('SUB-RULE:group-b', 'group-a')).toBe(false)
    expect(matchReferencesSubRule('SUB-RULE:group-ab', 'group-a')).toBe(false)
    expect(matchReferencesSubRule('SUB-RULE:group-a-2', 'group-a')).toBe(false)
    expect(matchReferencesSubRule('', 'group-a')).toBe(false)
  })
})

describe('findSubRuleReferences', () => {
  it('lists top-level and cross-group references, skipping the group itself', () => {
    const refs = findSubRuleReferences(CONFIG, 'group-a')
    expect(refs.map((r) => r.ruleName).sort()).toEqual(['nested', 'top-compound', 'top-exact'])
    expect(refs.find((r) => r.ruleName === 'nested')?.inGroup).toBe('group-b')
    expect(refs.find((r) => r.ruleName === 'top-exact')?.inGroup).toBeNull()
  })

  it('returns empty for an unreferenced group or null config', () => {
    expect(findSubRuleReferences(CONFIG, 'group-a')).toHaveLength(3)
    expect(findSubRuleReferences(CONFIG, 'group-c')).toEqual([])
    expect(findSubRuleReferences(null, 'group-a')).toEqual([])
  })
})

describe('rewrite helpers', () => {
  it('rewrites only the named group, prefix-safely', () => {
    expect(rewriteSubRuleRefs('SUB-RULE:group-a && value > 80', 'group-a', 'group-z')).toBe(
      'SUB-RULE:group-z && value > 80',
    )
    expect(rewriteSubRuleRefs('SUB-RULE:group-ab', 'group-a', 'group-z')).toBe('SUB-RULE:group-ab')
  })

  it('rewrites rule lists in place and leaves others untouched', () => {
    const rules = CONFIG.rules ?? []
    const out = rewriteRuleListRefs(rules, 'group-a', 'group-z')
    expect(out.find((r) => r.name === 'top-exact')?.match).toBe('SUB-RULE:group-z')
    expect(out.find((r) => r.name === 'top-compound')?.match).toBe('SUB-RULE:group-z && value > 80')
    expect(out.find((r) => r.name === 'top-other')?.match).toBe('SUB-RULE:group-b')
    // Original array is not mutated.
    expect(rules.find((r) => r.name === 'top-exact')?.match).toBe('SUB-RULE:group-a')
  })
})
