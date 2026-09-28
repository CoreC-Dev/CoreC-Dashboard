import { describe, expect, it } from 'vitest'
import { VALID_FIELDS, validateRuleExpression } from './ruleExprValidator'

describe('validateRuleExpression', () => {
  // ─── Special keywords ──────────────────────────────────────────
  it('accepts ALL (case-insensitive)', () => {
    expect(validateRuleExpression('ALL').valid).toBe(true)
    expect(validateRuleExpression('all').valid).toBe(true)
  })

  it('accepts SUB-RULE:group-name', () => {
    expect(validateRuleExpression('SUB-RULE:my-group').valid).toBe(true)
  })

  it('rejects SUB-RULE: without group name', () => {
    const r = validateRuleExpression('SUB-RULE:')
    expect(r.valid).toBe(false)
    expect(r.errors[0]).toContain('requires a group name')
  })

  // ─── Empty ──────────────────────────────────────────────────────
  it('rejects empty expression', () => {
    expect(validateRuleExpression('').valid).toBe(false)
    expect(validateRuleExpression('   ').valid).toBe(false)
  })

  // ─── Valid expressions ─────────────────────────────────────────
  it('accepts string equality', () => {
    expect(validateRuleExpression("tag == 'temperature'").valid).toBe(true)
  })

  it('accepts numeric comparison', () => {
    expect(validateRuleExpression('value > 90').valid).toBe(true)
  })

  it('accepts contains operator', () => {
    expect(validateRuleExpression("tag contains 'temp'").valid).toBe(true)
  })

  it('accepts regex match', () => {
    expect(validateRuleExpression("tag =~ '^temp.*'").valid).toBe(true)
  })

  it('accepts range check', () => {
    expect(validateRuleExpression('value in 50..100').valid).toBe(true)
  })

  it('accepts compound expression with &&', () => {
    expect(validateRuleExpression("tag contains 'temp' && value > 50").valid).toBe(true)
  })

  it('accepts compound expression with ||', () => {
    expect(validateRuleExpression('value > 100 || value < 0').valid).toBe(true)
  })

  it('accepts grouped expression', () => {
    expect(validateRuleExpression("(value > 50 && value < 100) || tag == 'alarm'").valid).toBe(true)
  })

  it('accepts NOT operator', () => {
    expect(validateRuleExpression("!tag contains 'debug'").valid).toBe(true)
  })

  it('accepts prefix/suffix operators', () => {
    expect(validateRuleExpression("tag prefix 'sensor'").valid).toBe(true)
    expect(validateRuleExpression("tag suffix '_01'").valid).toBe(true)
  })

  it('accepts boolean equality', () => {
    expect(validateRuleExpression('value == true').valid).toBe(true)
  })

  // ─── Syntax errors ─────────────────────────────────────────────
  it('rejects unbalanced parentheses (unclosed)', () => {
    const r = validateRuleExpression('(value > 50')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('unclosed'))).toBe(true)
  })

  it('rejects unbalanced parentheses (extra close)', () => {
    const r = validateRuleExpression('value > 50)')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('before'))).toBe(true)
  })

  it('rejects unbalanced single quotes', () => {
    const r = validateRuleExpression("tag == 'temp")
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('quotes'))).toBe(true)
  })

  it('rejects dangling && at end', () => {
    const r = validateRuleExpression('value > 50 &&')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('dangling'))).toBe(true)
  })

  it('rejects expression starting with ||', () => {
    const r = validateRuleExpression('|| value > 50')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('starts with'))).toBe(true)
  })

  it('rejects incomplete range', () => {
    const r = validateRuleExpression('value in 50..')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('range'))).toBe(true)
  })

  // ─── Warnings ──────────────────────────────────────────────────
  it('warns about unknown fields', () => {
    const r = validateRuleExpression("unknown_field == 'x'")
    expect(r.warnings.some((w) => w.includes('unknown field'))).toBe(true)
  })

  it('warns about double-quoted strings', () => {
    const r = validateRuleExpression('tag == "temp"')
    expect(r.warnings.some((w) => w.includes('single quotes'))).toBe(true)
  })

  it('does not warn about valid fields', () => {
    const r = validateRuleExpression("tag == 'temp' && value > 50")
    expect(r.warnings.some((w) => w.includes('unknown field'))).toBe(false)
  })
})

describe('VALID_FIELDS', () => {
  it('contains all 7 valid fields', () => {
    expect(VALID_FIELDS).toEqual(['driver', 'device', 'group', 'tag', 'quality', 'type', 'value'])
  })
})
