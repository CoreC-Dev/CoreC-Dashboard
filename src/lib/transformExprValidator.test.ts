import { describe, expect, it } from 'vitest'
import { validateTransformExpression } from './transformExprValidator'

describe('validateTransformExpression', () => {
  // ─── Valid expressions ─────────────────────────────────────────
  it('accepts simple value reference', () => {
    expect(validateTransformExpression('value').valid).toBe(true)
  })

  it('accepts multiplication', () => {
    expect(validateTransformExpression('value * 1.8 + 32').valid).toBe(true)
  })

  it('accepts division', () => {
    expect(validateTransformExpression('value / 1000').valid).toBe(true)
  })

  it('accepts subtraction', () => {
    expect(validateTransformExpression('value - 273.15').valid).toBe(true)
  })

  it('accepts grouped expression', () => {
    expect(validateTransformExpression('(value - 32) * 5 / 9').valid).toBe(true)
  })

  it('accepts nested parentheses', () => {
    expect(validateTransformExpression('((value + 1) * 2) - 3').valid).toBe(true)
  })

  it('accepts leading unary minus', () => {
    expect(validateTransformExpression('-value').valid).toBe(true)
  })

  it('accepts unary minus in parentheses', () => {
    expect(validateTransformExpression('-(value + 1)').valid).toBe(true)
  })

  it('accepts decimal literals', () => {
    expect(validateTransformExpression('value * 3.14159').valid).toBe(true)
  })

  it('accepts pure literal expression (with warning)', () => {
    const r = validateTransformExpression('42')
    expect(r.valid).toBe(true)
    expect(r.warnings.some((w) => w.includes('does not reference'))).toBe(true)
  })

  // ─── Empty ──────────────────────────────────────────────────────
  it('rejects empty expression', () => {
    expect(validateTransformExpression('').valid).toBe(false)
    expect(validateTransformExpression('   ').valid).toBe(false)
  })

  // ─── Syntax errors ─────────────────────────────────────────────
  it('rejects unbalanced parentheses (unclosed)', () => {
    const r = validateTransformExpression('(value + 1')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('unclosed'))).toBe(true)
  })

  it('rejects unbalanced parentheses (extra close)', () => {
    const r = validateTransformExpression('value + 1)')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('before'))).toBe(true)
  })

  it('rejects dangling operator at end', () => {
    const r = validateTransformExpression('value *')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('ends with'))).toBe(true)
  })

  it('rejects expression starting with * or +', () => {
    expect(validateTransformExpression('* value').valid).toBe(false)
    expect(validateTransformExpression('+ value').valid).toBe(false)
  })

  it('rejects empty parentheses', () => {
    const r = validateTransformExpression('value * ()')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('empty parentheses'))).toBe(true)
  })

  it('rejects consecutive operators', () => {
    const r = validateTransformExpression('value * * 2')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('consecutive'))).toBe(true)
  })

  it('rejects invalid characters', () => {
    const r = validateTransformExpression('value & 1')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('invalid characters'))).toBe(true)
  })

  // ─── Warnings ──────────────────────────────────────────────────
  it('warns about constant expressions', () => {
    const r = validateTransformExpression('42 + 1')
    expect(r.warnings.some((w) => w.includes('constant'))).toBe(true)
  })

  it('does not warn when value is referenced', () => {
    const r = validateTransformExpression('value * 2')
    expect(r.warnings.some((w) => w.includes('constant'))).toBe(false)
  })

  it('warns about division by zero', () => {
    const r = validateTransformExpression('value / 0')
    expect(r.warnings.some((w) => w.includes('division by zero'))).toBe(true)
  })
})
