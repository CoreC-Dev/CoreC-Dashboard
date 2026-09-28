/**
 * Transform expression syntax validator
 *
 * CoreC rule transform expressions (rule/arith.go) are arithmetic expressions
 * evaluated via expr-lang/expr with a single variable `value` (float64).
 * Supported syntax:
 *   value              the original numeric value
 *   42, 1.8, -3.14     numeric literals
 *   + - * /            arithmetic operators
 *   ( )                grouping
 *
 * The expression must produce a float64 result. CoreC rejects NaN/Inf
 * (division by zero) at runtime, but we can't detect that at config time.
 *
 * This validator catches common syntax errors before applying config.
 */
export interface ArithValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Validates a CoreC transform arithmetic expression for syntax correctness.
 * Returns {valid, errors, warnings}. Pure function — no side effects.
 */
export function validateTransformExpression(expr: string): ArithValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const trimmed = expr.trim()
  if (!trimmed) {
    return { valid: false, errors: ['expression cannot be empty'], warnings }
  }

  // Check for balanced parentheses
  let parenDepth = 0
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '(') parenDepth++
    if (trimmed[i] === ')') parenDepth--
    if (parenDepth < 0) {
      errors.push('unbalanced parentheses: closing ")" before opening "("')
      break
    }
  }
  if (parenDepth > 0) {
    errors.push(`unbalanced parentheses: ${parenDepth} unclosed "("`)
  }

  // Check for invalid characters: after removing valid tokens, nothing should remain.
  // Valid: digits, + - * / ( ) . whitespace, and the word "value"
  const withoutValue = trimmed.replace(/\bvalue\b/g, '')
  const remaining = withoutValue.replace(/[0-9+\-*/().\s]/g, '')
  if (remaining.length > 0) {
    errors.push(
      `invalid characters: ${[...new Set(remaining.split(''))].join(', ')} — only digits, + - * / ( ) . and "value" are allowed`,
    )
  }

  // Check that 'value' is referenced (warning only — pure literal expressions are technically valid)
  if (!/\bvalue\b/.test(trimmed)) {
    warnings.push(
      'expression does not reference "value" — result will be a constant regardless of input',
    )
  }

  // Check for double operators (e.g. "value * * 2", "value + - 3" is OK as unary minus)
  if (/[+\-*/]{2,}/.test(trimmed.replace(/\s/g, ''))) {
    // Allow leading unary minus: "-value", "-(value + 1)"
    const withoutLeadingMinus = trimmed.replace(/^\s*-/, '')
    if (/[+\-*/]{2,}/.test(withoutLeadingMinus.replace(/\s/g, '').replace(/\(-/g, '(~'))) {
      errors.push('consecutive operators detected (e.g. "value * * 2")')
    }
  }

  // Check for dangling operators at end
  if (/[+\-*/]\s*$/.test(trimmed)) {
    errors.push('expression ends with an operator')
  }

  // Check for dangling operators at start (except unary minus)
  if (/^\s*[+*/]/.test(trimmed)) {
    errors.push('expression starts with an operator (only leading "-" is allowed)')
  }

  // Check for empty parentheses
  if (/\(\s*\)/.test(trimmed)) {
    errors.push('empty parentheses "()" are not valid')
  }

  // Check for division by zero literal (warning — may be intentional pattern)
  if (/\/\s*0(?!\.\d*[1-9])/.test(trimmed)) {
    warnings.push('division by zero detected — this will produce an error at runtime')
  }

  // Try to evaluate as a basic sanity check (if it's a pure literal expression)
  // We substitute 'value' with a test value and see if JavaScript can evaluate it
  try {
    const testExpr = trimmed.replace(/\bvalue\b/g, '1.0')
    // Only attempt eval if the expression is simple enough (no unknown identifiers)
    if (!/[a-zA-Z]/.test(testExpr.replace(/\b(?:true|false|null|undefined|NaN|Infinity)\b/g, ''))) {
      // eslint-disable-next-line no-new-func
      const fn = new Function(`"use strict"; return (${testExpr});`)
      const result = fn()
      if (typeof result !== 'number' || Number.isNaN(result)) {
        errors.push('expression does not evaluate to a number')
      }
    }
  } catch {
    // If JS can't parse it, expr-lang likely can't either
    if (errors.length === 0) {
      errors.push('expression has a syntax error — check operators and parentheses')
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
