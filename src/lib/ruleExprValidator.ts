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
export interface ExprValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

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

/** Valid operators that take a string operand on the right. */
const _STRING_OPS = ['==', '!=', '=~', '!~', 'contains', 'suffix', 'prefix'] as const

/** Valid numeric comparison operators. */
const _NUMERIC_OPS = ['>', '<', '>=', '<='] as const

/** Keywords that are handled specially (not compiled as expressions). */
const _SPECIAL_KEYWORDS = ['ALL', 'SUB-RULE:'] as const

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

  // Check for balanced single quotes (string literals)
  const singleQuotes = (trimmed.match(/'/g) ?? []).length
  if (singleQuotes % 2 !== 0) {
    errors.push('unbalanced single quotes — string literals must be closed')
  }

  // Check for valid field names (word before an operator)
  // Pattern: word followed by operator
  const fieldOpPattern = /(\w+)\s*(==|!=|=~|!~|>|<|>=|<=|contains|suffix|prefix|in)\s*/g
  let match: RegExpExecArray | null
  const foundFields = new Set<string>()
  while ((match = fieldOpPattern.exec(trimmed)) !== null) {
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
    foundFields.add(field)
  }

  // Check for double-quoted strings (CoreC DSL uses single quotes)
  if (/"[^"]*"/.test(trimmed)) {
    warnings.push('double-quoted strings detected — CoreC DSL uses single quotes')
  }

  // Check for common typos in operators
  if (/\bmatchs\b/i.test(trimmed)) {
    errors.push('typo: "matchs" → use "matches" (via =~ operator)')
  }
  if (/\bcontain\b/i.test(trimmed) && !/\bcontains\b/i.test(trimmed)) {
    warnings.push('"contain" → use "contains" for substring matching')
  }

  // Check for incomplete range expressions (value in 50.. without upper bound)
  if (/\bin\s+\d+\.\.\s*(?!\d)/.test(trimmed)) {
    errors.push('incomplete range: "in A..B" requires both bounds (e.g. value in 50..100)')
  }

  // Check for dangling logical operators
  if (/(^|\s)(&&|\|\|)\s*($|\))/.test(trimmed)) {
    errors.push('dangling logical operator (&& or ||) at end of expression')
  }
  if (/^\s*(&&|\|\|)/.test(trimmed)) {
    errors.push('expression starts with logical operator (&& or ||)')
  }

  return { valid: errors.length === 0, errors, warnings }
}
