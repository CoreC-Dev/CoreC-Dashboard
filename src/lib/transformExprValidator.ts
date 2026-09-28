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
  // Valid: digits, + - * / ( ) . whitespace, the word "value", and scientific
  // notation exponents (e/E) — e.g. "value * 1e3" must not leave 'e' behind.
  // Remove float literals (including exponent) first, then digits/operators.
  const withoutValue = trimmed.replace(/\bvalue\b/g, '')
  const withoutFloats = withoutValue.replace(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g, '')
  const remaining = withoutFloats.replace(/[+\-*/().\s]/g, '')
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

  // Structural sanity check for pure-literal expressions (no `value`).
  // We substitute 'value' with a numeric literal; if the result contains only
  // digits/operators, a pure-literal expression should reduce to a number.
  // This replaces an earlier `new Function(...)` eval which — although gated
  // by an alphabetic-char pre-check — could be bypassed via JSFuck-style
  // symbol combinations (self-XSS anti-pattern). [L-6]
  const testExprRaw = trimmed.replace(/\bvalue\b/g, '1')
  // Strip float-with-exponent literals (e.g. 1e3, 1.5e-10) to '1' BEFORE the
  // letter check, so scientific notation does not trip the /[a-zA-Z]/ guard
  // and silently disable the detector. [H-6/L-6 interaction]
  const testExpr = testExprRaw.replace(/(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g, '1')
  if (!/[a-zA-Z]/.test(testExpr)) {
    // Detect two adjacent operands with no operator between them. After
    // substituting value→1 and stripping float literals, this manifests as
    // two number-like tokens separated only by whitespace OR by a paren
    // boundary (e.g. "(1) 2", "2 (1)", "1 (2)"). The old
    // `new Function(\`return (1 2)\`)` caught these via JS SyntaxError;
    // the structural replacement must restore that coverage.
    if (/\d\)?\s+\(?\d/.test(testExpr)) {
      if (errors.length === 0) {
        errors.push('expression has a syntax error — two operands with no operator between them')
      }
    }
    // Also catch a dangling operator or empty parens as a final gate (these
    // are already checked above, but this ensures the expression is complete
    // before accepting it as a constant).
    else if (/[+\-*/]\s*$/.test(testExpr) || /\(\s*\)/.test(testExpr)) {
      if (errors.length === 0) {
        errors.push('expression has a syntax error — check operators and parentheses')
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
