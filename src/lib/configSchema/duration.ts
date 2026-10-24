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
