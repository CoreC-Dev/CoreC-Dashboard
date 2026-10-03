import { describe, expect, it } from 'vitest'
import { VALID_FIELDS, validateRuleExpression } from '@/lib/ruleExprValidator'

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

  // ─── H-5 regression: string literal contents should be ignored ───
  it('does not false-positive on parens inside string literals', () => {
    expect(validateRuleExpression("tag == ')('").valid).toBe(true)
    expect(validateRuleExpression("tag == '(test'").valid).toBe(true)
    expect(validateRuleExpression("tag == 'test)'").valid).toBe(true)
  })

  it('does not warn about field-like words inside string literals', () => {
    const r = validateRuleExpression("tag == 'foobar in limit'")
    expect(r.warnings.some((w) => w.includes('unknown field'))).toBe(false)
  })

  it('still detects unbalanced parens outside string literals', () => {
    expect(validateRuleExpression('(tag == "temp"').valid).toBe(false)
  })

  // ─── H-5 regression: typo/range checks must use stripped expression ──
  it('does not false-positive on "matchs" inside string literals', () => {
    const r = validateRuleExpression("tag == 'matchs'")
    expect(r.valid).toBe(true)
    expect(r.errors.some((e) => e.includes('matchs'))).toBe(false)
  })

  it('does not false-positive on "contain" inside string literals', () => {
    const r = validateRuleExpression("tag == 'contain'")
    expect(r.warnings.some((w) => w.includes('contain'))).toBe(false)
  })

  it('does not false-positive on range-like text inside string literals', () => {
    const r = validateRuleExpression("tag =~ 'value in 50..'")
    expect(r.valid).toBe(true)
    expect(r.errors.some((e) => e.includes('range'))).toBe(false)
  })

  it('still detects real "matchs" typo outside string literals', () => {
    const r = validateRuleExpression('tag matchs "temp"')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('matchs'))).toBe(true)
  })

  it('still detects real incomplete range outside string literals', () => {
    const r = validateRuleExpression('value in 50..')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('range'))).toBe(true)
  })

  // ─── H-5 re-audit: dangling-logical-operator check must use stripped ──
  it('does not false-positive on dangling && inside string literal', () => {
    const r = validateRuleExpression("tag == ' &&)'")
    expect(r.errors.some((e) => e.includes('dangling logical operator'))).toBe(false)
  })

  it('does not false-positive on dangling || inside string literal', () => {
    const r = validateRuleExpression("tag == 'foo ||)'")
    expect(r.errors.some((e) => e.includes('dangling logical operator'))).toBe(false)
  })

  it('does not false-positive on && inside =~ string literal', () => {
    const r = validateRuleExpression("tag =~ 'x && )'")
    expect(r.errors.some((e) => e.includes('dangling logical operator'))).toBe(false)
  })

  it('still detects real dangling && at end of expression', () => {
    const r = validateRuleExpression('value > 5 &&')
    expect(r.errors.some((e) => e.includes('dangling logical operator'))).toBe(true)
  })

  it('still detects real starting && at beginning', () => {
    const r = validateRuleExpression('&& value > 5')
    expect(r.errors.some((e) => e.includes('starts with logical operator'))).toBe(true)
  })

  // ─── H-5 re-audit: double-quote check must use stripped ─────────
  it('does not warn about double-quotes inside single-quoted literal', () => {
    const r = validateRuleExpression('tag == \'say "hi"\'')
    expect(r.warnings.some((w) => w.includes('double-quoted'))).toBe(false)
  })

  it('still warns about real double-quoted string literals', () => {
    const r = validateRuleExpression('tag == "hello"')
    expect(r.warnings.some((w) => w.includes('double-quoted'))).toBe(true)
  })
})

describe('VALID_FIELDS', () => {
  it('contains all 7 valid fields', () => {
    expect(VALID_FIELDS).toEqual(['driver', 'device', 'group', 'tag', 'quality', 'type', 'value'])
  })
})
