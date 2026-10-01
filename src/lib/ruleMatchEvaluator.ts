/**
 * Client-side rule match-DSL evaluator.
 *
 * Extracted from RulesPage.tsx so it is independently testable and reusable.
 * This is a naive evaluator for simple match-DSL fragments — it does NOT
 * replicate the full CoreC engine semantics. The UI clearly labels results
 * as estimates.
 *
 * Supports:
 *   - field == "lit" | field != "lit"
 *   - field >=|<=|>|< num
 *   - `field contains "lit"`
 *   - bare field names (truthy check)
 *   - joined by `&&` / `||` (`&&` binds tighter)
 *
 * Anything unparseable is treated as a non-match so operators never get
 * false positives.
 */

export interface SimDataPoint {
  driver: string
  device: string
  group: string
  tag: string
  value: string
  type: string
  quality: string
}

export const getFieldValue = (dp: SimDataPoint, field: string): string | undefined => {
  switch (field) {
    case 'driver':
      return dp.driver
    case 'device':
      return dp.device
    case 'group':
      return dp.group
    case 'tag':
      return dp.tag
    case 'value':
      return dp.value
    case 'type':
      return dp.type
    case 'quality':
      return dp.quality
    default:
      return undefined
  }
}

export const evaluateClause = (clause: string, dp: SimDataPoint): boolean => {
  const c = clause.trim()
  if (!c) return true

  const contains = c.match(/^(\w+)\s+contains\s+"([^"]*)"$/)
  if (contains) {
    const field = contains[1]!
    const lit = contains[2]!
    const v = getFieldValue(dp, field)
    if (v == null) return false
    return v.includes(lit)
  }

  const cmp = c.match(/^(\w+)\s*(==|!=|>=|<=|>|<)\s*("[^"]*"|[\w.-]+)$/)
  if (cmp) {
    const field = cmp[1]!
    const op = cmp[2]!
    const raw = cmp[3]!
    const fv = getFieldValue(dp, field)
    if (fv === undefined) return false

    if (raw.startsWith('"')) {
      const lit = raw.slice(1, -1)
      if (op === '==') return fv === lit
      if (op === '!=') return fv !== lit
      return false
    }

    const lhs = Number(fv)
    const rhs = Number(raw)
    if (Number.isNaN(lhs) || Number.isNaN(rhs)) return false
    switch (op) {
      case '==':
        return lhs === rhs
      case '!=':
        return lhs !== rhs
      case '>':
        return lhs > rhs
      case '>=':
        return lhs >= rhs
      case '<':
        return lhs < rhs
      case '<=':
        return lhs <= rhs
      default:
        return false
    }
  }

  if (/^\w+$/.test(c)) {
    const v = getFieldValue(dp, c)
    return v != null && v !== ''
  }
  return false
}

export const evaluateMatch = (match: string, dp: SimDataPoint): boolean => {
  const expr = match.trim()
  if (!expr) return true
  return expr
    .split('||')
    .some((orPart) => orPart.split('&&').every((andPart) => evaluateClause(andPart, dp)))
}
