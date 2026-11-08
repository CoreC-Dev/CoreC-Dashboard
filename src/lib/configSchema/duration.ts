/**
 * Go duration-string validation — the one value format CoreC and this schema
 * tree share.
 *
 * The authoritative grammar is Go's `time.ParseDuration`:
 *
 *     duration := [+-]? segment+
 *     segment  := number unit
 *     number   := [0-9]+ ("." [0-9]*)? | "." [0-9]+
 *     unit     := "ns" | "us" | "µs" | "μs" | "ms" | "s" | "m" | "h"
 *
 * Three quirks a naive pattern misses, each of which REJECTS a value the server
 * accepts. A false alarm costs as much as a miss here: the operator cannot save
 * a config CoreC would have taken, and learns to distrust the form.
 *
 *   - the integer part may be empty. ".5s" is 500ms, and "5.s" is 5s. The old
 *     pattern required at least one leading digit;
 *   - the microsecond unit is spelled two ways. "µs" is U+00B5 MICRO SIGN and
 *     "μs" is U+03BC GREEK SMALL LETTER MU. They are visually identical and Go
 *     accepts both (it carries two byte prefixes for exactly this reason);
 *   - a sign applies to the WHOLE duration, not per segment. "-1h30m" is -90m,
 *     and Go rejects "-1h-30m".
 *
 * Both exported predicates below are built from the same two patterns, so the
 * "is it valid" and the "how many ms is it" answers cannot drift apart.
 */
import { z } from 'zod'

/** One <number><unit> segment. At least one digit must be present. */
const SEGMENT_BODY = String.raw`(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:ns|us|µs|μs|ms|s|m|h)`

/** A whole duration: optional sign, one or more segments, nothing else. */
const GO_DURATION_RE = new RegExp(`^[+-]?${SEGMENT_BODY}(?:${SEGMENT_BODY})*$`)

/** The same segments, for walking through an already-validated string. */
const SEGMENT_RE_G = new RegExp(SEGMENT_BODY, 'g')

/** The numeric prefix of one segment, for reading its value back. */
const SEGMENT_NUM_RE = /^([0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:ns|us|µs|μs|ms|s|m|h)$/

/** True when the string is syntactically a Go duration (no range check). */
export function isDurationSyntax(v: string): boolean {
  return GO_DURATION_RE.test(v)
}

/**
 * True when every numeric part of the duration is zero ("0", "0s", "0h0m",
 * "0.0s"). Assumes the string is syntactically valid.
 */
function isZeroDuration(v: string): boolean {
  const body = v.replace(/^[+-]/, '')
  const nums = body.match(/[0-9]+(?:\.[0-9]*)?|\.[0-9]+/g) ?? []
  return nums.length > 0 && nums.every((n) => Number.parseFloat(n) === 0)
}

/**
 * True when `v` is a valid Go duration string describing a positive span. Empty
 * is allowed: it means "unset", and the server keeps its default.
 *
 * Zero and negative are rejected because every field this guards is a period the
 * engine waits or throttles by, and the server treats `dur <= 0` as "not
 * configured" — it falls back to the default in silence. A "0s" accepted here
 * would be a switch that looks set and does nothing.
 */
export function isValidGoDuration(v: string | undefined): boolean {
  if (!v) return true // empty = unset, valid (server uses default)
  if (!isDurationSyntax(v)) return false
  if (v.startsWith('-')) return false
  return !isZeroDuration(v)
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

const UNIT_TO_MS: Record<string, number> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3, // U+00B5 MICRO SIGN
  μs: 1e-3, // U+03BC GREEK SMALL LETTER MU -- the other spelling Go accepts
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
}

/**
 * durationToMs converts a Go duration string to milliseconds, or null when it is
 * not one.
 *
 * Its reach must equal isValidGoDuration's, and it is built from the same two
 * pieces so it cannot help but: a value the validator accepts but this cannot read
 * would come back null, and null means "unset" to every caller -- a field silently
 * treated as absent exactly where the operator set it.
 *
 * Empty returns null too, and that is the same answer as "unset", not "0ms":
 * callers asking "is this heartbeat shorter than that interval?" must branch on
 * null rather than compare it as zero.
 */
export function durationToMs(v: string | undefined): number | null {
  if (!v) return null
  if (!isDurationSyntax(v)) return null

  const sign = v.startsWith('-') ? -1 : 1
  const body = v.replace(/^[+-]/, '')

  let total = 0
  for (const seg of body.match(SEGMENT_RE_G) ?? []) {
    const parts = SEGMENT_NUM_RE.exec(seg)
    if (parts === null) return null
    const unit = seg.slice(parts[1].length)
    total += Number.parseFloat(parts[1]) * UNIT_TO_MS[unit]
  }
  return sign * total
}
