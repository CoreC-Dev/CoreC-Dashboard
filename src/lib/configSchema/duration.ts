/**
 * configSchema/duration.ts — Go duration-string validation (the one
 * value format CoreC and this schema tree share).
 */
import { z } from 'zod'

// Go's time.ParseDuration accepts e.g. "300ms", "1.5h", "2h45m", "500us".
// Format: optional sign, then one or more (float + unit) where unit ∈
// {ns, µs, us, ms, s, m, h}. A leading "0" means zero (rejected as <=0).
// One or more (number + unit) segments, where unit ∈ {ns,µs,us,ms,s,m,h}.
// Matches "30s", "1.5h", "2h45m", "500ms", "10us". A bare "0" is zero (rejected below).
const GO_DURATION_RE = /^[+-]?([0-9]+(\.[0-9]+)?(ns|µs|us|ms|s|m|h))+$/

/** True when every numeric segment in the duration is zero (e.g. "0", "0s", "0h0m"). */
function isZeroDuration(v: string): boolean {
  const nums = v.replace(/^[+-]?/, '').match(/[0-9]+(\.[0-9]+)?/g) ?? []
  return nums.length > 0 && nums.every((n) => Number.parseFloat(n) === 0)
}

/** True when `v` is a valid Go duration string (> 0). Empty string is allowed (means unset). */
export function isValidGoDuration(v: string | undefined): boolean {
  if (!v) return true // empty = unset, valid (server uses default)
  if (!GO_DURATION_RE.test(v)) return false
  // Zero duration (e.g. "0s", "0h0m0s") is rejected by server (dur <= 0).
  if (isZeroDuration(v)) return false
  return true
}

export const durationString = z
  .string()
  .superRefine((v, ctx) => {
    if (!v) return
    if (!isValidGoDuration(v)) {
      ctx.addIssue({
        code: 'custom',
        message: `"${v}" is not a valid positive Go duration (e.g. "30s", "500ms", "1h30m")`,
      })
    }
  })
  .optional()

export const requiredDuration = z
  .string()
  .min(1, { message: 'duration is required' })
  .superRefine((v, ctx) => {
    if (!isValidGoDuration(v)) {
      ctx.addIssue({
        code: 'custom',
        message: `"${v}" is not a valid positive Go duration (e.g. "5s", "1m")`,
      })
    }
  })

/**
 * durationToMs converts a Go duration string ("1.5s", "2h45m", "500us") to
 * milliseconds. Returns null when the string does not parse, so callers can
 * distinguish "unset" from "malformed" instead of comparing against a silent 0.
 */
export function durationToMs(v: string | undefined): number | null {
  if (!v) return null
  const sign = v.startsWith('-') ? -1 : 1
  const body = v.replace(/^[+-]/, '')
  const seg = /([0-9]+(?:\.[0-9]+)?)(ns|us|µs|ms|s|m|h)/g
  const mults: Record<string, number> = {
    ns: 1e-6,
    us: 1e-3,
    µs: 1e-3,
    ms: 1,
    s: 1000,
    m: 60000,
    h: 3600000,
  }
  let total = 0
  let consumed = 0
  let m: RegExpExecArray | null
  while ((m = seg.exec(body)) !== null) {
    total += Number(m[1]) * mults[m[2]]
    consumed += m[0].length
  }
  // Every character must belong to a segment: "1s2" or "2hz" is not a duration.
  if (consumed !== body.length) return null
  return sign * total
}
