import { describe, expect, it } from 'vitest'
import { validateTransformExpression } from '@/lib/transformExprValidator'

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

  // ─── H-6 regression: scientific notation ──────────────────────────
  it('accepts scientific notation with lowercase e', () => {
    expect(validateTransformExpression('value * 1e3').valid).toBe(true)
  })

  it('accepts scientific notation with uppercase E', () => {
    expect(validateTransformExpression('value * 1E3').valid).toBe(true)
  })

  it('accepts scientific notation with decimal mantissa and sign', () => {
    expect(validateTransformExpression('value * 1.5e-10').valid).toBe(true)
    expect(validateTransformExpression('value * 2.0E+5').valid).toBe(true)
  })

  it('still rejects invalid characters alongside scientific notation', () => {
    expect(validateTransformExpression('value & 1e3').valid).toBe(false)
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

  // FL-1: binary operator followed by unary minus is valid (e.g. "value * -3")
  it('accepts binary operator followed by unary minus', () => {
    expect(validateTransformExpression('value * -3').valid).toBe(true)
    expect(validateTransformExpression('value + -2').valid).toBe(true)
    expect(validateTransformExpression('value - -1').valid).toBe(true)
    expect(validateTransformExpression('value / -4').valid).toBe(true)
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

  // ─── L-6 regression: missing operators between operands ────────
  it('rejects two operands with no operator (value + number)', () => {
    const r = validateTransformExpression('value 2')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no operator'))).toBe(true)
  })

  it('rejects two operands with no operator (number + value)', () => {
    const r = validateTransformExpression('2 value')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no operator'))).toBe(true)
  })

  it('rejects two operands with no operator (value + value)', () => {
    const r = validateTransformExpression('value value')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no operator'))).toBe(true)
  })

  it('rejects missing operator in a larger expression', () => {
    const r = validateTransformExpression('value 2 + 3')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no operator'))).toBe(true)
  })

  it('still accepts valid multi-term expressions', () => {
    expect(validateTransformExpression('value * 2 + 3').valid).toBe(true)
    expect(validateTransformExpression('1 + 2 + 3').valid).toBe(true)
    expect(validateTransformExpression('(value + 1) * 2').valid).toBe(true)
  })

  // ─── L-6 re-audit: scientific notation bypass ──────────────────
  it('rejects missing operator with scientific notation (value 1e3)', () => {
    const r = validateTransformExpression('value 1e3')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no operator'))).toBe(true)
  })

  it('rejects missing operator with scientific notation (1e3 value)', () => {
    const r = validateTransformExpression('1e3 value')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no operator'))).toBe(true)
  })

  it('rejects missing operator with uppercase E (value 1E3 + 2)', () => {
    const r = validateTransformExpression('value 1E3 + 2')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no operator'))).toBe(true)
  })

  it('still accepts valid scientific notation (value * 1e3)', () => {
    expect(validateTransformExpression('value * 1e3').valid).toBe(true)
    expect(validateTransformExpression('1.5e3 * value').valid).toBe(true)
  })

  // ─── L-6 re-audit: paren-boundary missing operator ─────────────
  it('rejects missing operator across paren boundary ((value + 1) 2)', () => {
    const r = validateTransformExpression('(value + 1) 2')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no operator'))).toBe(true)
  })

  it('rejects missing operator across paren boundary (2 (value + 1))', () => {
    const r = validateTransformExpression('2 (value + 1)')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no operator'))).toBe(true)
  })

  it('rejects missing operator (value (2))', () => {
    const r = validateTransformExpression('value (2)')
    expect(r.valid).toBe(false)
    expect(r.errors.some((e) => e.includes('no operator'))).toBe(true)
  })
})
