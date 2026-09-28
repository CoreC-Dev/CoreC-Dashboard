import { checkBalancedParens, type ValidationResult } from './exprShared'

/**
 * Rule expression syntax validator
 *
 * Lightweight client-side syntax check for CoreC rule match expressions.
 * CoreC uses expr-lang/expr (compiled at load time via rule/expr.go) with
 * a thin DSL translation layer. This validator does NOT replicate the full
 * expr-lang compiler — it catches common syntax mistakes before the user
 * applies the config, reducing round-trips to the server.
 *
 * Supported DSL syntax (from rule/expr.go):
 *   field == 'value'        string equality
 *   field != 'value'        string inequality
 *   field =~ 'regex'        regex match
 *   field !~ 'regex'        regex non-match
 *   field contains 'substr' substring containment
 *   field suffix 'suffix'   suffix match
 *   field prefix 'prefix'   prefix match
 *   value > 90              numeric comparison
 *   value == true           boolean equality
 *   value in 50..100        numeric range check
 *   expr && expr            logical AND
 *   expr || expr            logical OR
 *   !expr                   logical NOT
 *   (expr)                  grouping
 *   ALL                     special: match all
 *   SUB-RULE:group-name     special: delegate to sub-rule group
 *
 * Valid fields: driver, device, group, tag, quality, type, value
 */
// Re-exported alias so existing test imports (`ExprValidationResult`) stay valid.
export type ExprValidationResult = ValidationResult

/** Valid field names in the rule expression DSL. */
export const VALID_FIELDS = [
  'driver',
  'device',
  'group',
  'tag',
  'quality',
  'type',
  'value',
] as const

/**
 * Validates a CoreC rule match expression for basic syntax correctness.
 * Returns {valid, errors, warnings}. Pure function — no side effects.
 */
export function validateRuleExpression(expr: string): ExprValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  const trimmed = expr.trim()
  if (!trimmed) {
    return { valid: false, errors: ['expression cannot be empty'], warnings }
  }

  // Special case: ALL (case-insensitive)
  if (trimmed.toUpperCase() === 'ALL') {
    return { valid: true, errors, warnings }
  }

  // Special case: SUB-RULE:group-name
  if (/^SUB-RULE:/i.test(trimmed)) {
    const groupName = trimmed.slice('SUB-RULE:'.length).trim()
    if (!groupName) {
      errors.push('SUB-RULE: requires a group name (e.g. SUB-RULE:my-group)')
    }
    return { valid: errors.length === 0, errors, warnings }
  }

  // Strip string literals before structural checks so their contents (parens,
  // operator-like words, field-like tokens, range-like text) don't produce
  // false errors. e.g. `tag == '(test)'` must not be flagged for unbalanced
  // parens, `tag == 'value in limit'` must not have `in` parsed as an
  // operator, and `tag =~ 'value in 50..'` must not false-positive on the
  // range check. Replace each single-quoted literal with a placeholder token.
  // [H-5]
  const stripped = trimmed.replace(/'[^']*'/g, "''")

  // Check for balanced parentheses (on the stripped expression)
  errors.push(...checkBalancedParens(stripped))

  // Check for balanced single quotes (on the original expression)
  const singleQuotes = (trimmed.match(/'/g) ?? []).length
  if (singleQuotes % 2 !== 0) {
    errors.push('unbalanced single quotes — string literals must be closed')
  }

  // Check for valid field names (word before an operator) — run on the
  // stripped expression so field-like words inside string literals don't
  // produce false "unknown field" warnings. [H-5]
  // Pattern: word followed by operator
  const fieldOpPattern = /(\w+)\s*(==|!=|=~|!~|>|<|>=|<=|contains|suffix|prefix|in)\s*/g
  let match: RegExpExecArray | null
  while ((match = fieldOpPattern.exec(stripped)) !== null) {
    const field = match[1]
    // Skip numeric literals (e.g. "50" in "50..100")
    if (/^\d+$/.test(field)) continue
    // Skip boolean literals
    if (field === 'true' || field === 'false') continue
    // Skip keywords
    if (field === 'not' || field === 'and' || field === 'or') continue
    if (!VALID_FIELDS.includes(field as (typeof VALID_FIELDS)[number])) {
      // Could be a false positive from complex expressions; add as warning
      warnings.push(`unknown field "${field}" — valid fields: ${VALID_FIELDS.join(', ')}`)
    }
  }

  // Check for double-quoted strings (CoreC DSL uses single quotes)
  // — run on `stripped` so double-quotes inside single-quoted literals (e.g.
  // `tag == 'say "hi"'`) don't false-positive. [H-5]
  if (/"[^"]*"/.test(stripped)) {
    warnings.push('double-quoted strings detected — CoreC DSL uses single quotes')
  }

  // Check for common typos in operators — run on `stripped` so the words
  // "matchs"/"contain" inside string literals don't false-positive. [H-5]
  if (/\bmatchs\b/i.test(stripped)) {
    errors.push('typo: "matchs" → use "matches" (via =~ operator)')
  }
  if (/\bcontain\b/i.test(stripped) && !/\bcontains\b/i.test(stripped)) {
    warnings.push('"contain" → use "contains" for substring matching')
  }

  // Check for incomplete range expressions (value in 50.. without upper bound)
  // — run on `stripped` so range-like text inside string literals (e.g.
  // `tag == 'value in 50..'`) doesn't false-positive. [H-5]
  if (/\bin\s+\d+\.\.\s*(?!\d)/.test(stripped)) {
    errors.push('incomplete range: "in A..B" requires both bounds (e.g. value in 50..100)')
  }

  // Check for dangling logical operators — run on `stripped` so operators
  // inside single-quoted literals (e.g. `tag == ' &&)'`) don't false-positive. [H-5]
  if (/(^|\s)(&&|\|\|)\s*($|\))/.test(stripped)) {
    errors.push('dangling logical operator (&& or ||) at end of expression')
  }
  // The START check is safe on `trimmed` — a literal can't put `&&` at
  // column 0 of the whole expression — but we run it on `stripped` too for
  // consistency. [H-5]
  if (/^\s*(&&|\|\|)/.test(stripped)) {
    errors.push('expression starts with logical operator (&& or ||)')
  }

  return { valid: errors.length === 0, errors, warnings }
}
