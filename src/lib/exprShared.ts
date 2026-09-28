/**
 * Shared scaffolding for expression validators.
 *
 * ruleExprValidator.ts (rule match DSL) and transformExprValidator.ts
 * (arithmetic transform DSL) both validate user-entered expression strings
 * and share the same result shape and balanced-parentheses check. This
 * module centralizes that duplication so the two validators stay in sync.
 *
 * The paren checker is byte-for-byte behavior-identical to the inline loops
 * it replaces: it scans left-to-right, tracks nesting depth, emits a single
 * "closing before opening" error (and stops) when depth would go negative,
 * and emits a single "N unclosed" error when depth remains positive at EOF.
 */

/** Result shape returned by both expression validators. */
export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Check a string for balanced parentheses.
 *
 * Returns an errors array (empty when balanced). At most one error is
 * produced — the two possible strings are:
 *   - 'unbalanced parentheses: closing ")" before opening "("'
 *   - 'unbalanced parentheses: N unclosed "("'
 *
 * On a closing ")" that drives depth below zero, pushes the first error and
 * stops scanning (mirrors the original inline `break` behaviour).
 */
export function checkBalancedParens(s: string): string[] {
  const errors: string[] = []
  let parenDepth = 0
  for (const ch of s) {
    if (ch === '(') parenDepth++
    else if (ch === ')') {
      parenDepth--
      if (parenDepth < 0) {
        errors.push('unbalanced parentheses: closing ")" before opening "("')
        break
      }
    }
  }
  if (parenDepth > 0) {
    errors.push(`unbalanced parentheses: ${parenDepth} unclosed "("`)
  }
  return errors
}
