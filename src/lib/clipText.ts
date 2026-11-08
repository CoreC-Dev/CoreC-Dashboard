/**
 * clipText.ts — cap a string at a byte budget and say how much was withheld.
 *
 * Byte budgets show up where a string is about to be handed to something that pays
 * for it by the byte (a model's context, a log line, a request body), and the
 * natural mistake is to budget with String.length: that counts UTF-16 code units, so
 * the same ceiling is 64 KiB of ASCII and up to three times that of Chinese, exactly
 * where the content is most expensive to carry. The second mistake is to append the
 * truncation notice outside the budget, which makes every truncated result
 * over-budget by construction and leaves only the untruncated ones inside.
 *
 * Both are fixed here, once, so callers pass a byte count and get a byte count.
 */

/** UTF-8 size of one string, without allocating a Buffer per character. */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

/**
 * clip caps a tool result at limit BYTES and says how much it withheld.
 *
 *   bytes, not .length  The limit is documented in KiB. String.length counts UTF-16
 *                       code units, and a Chinese character is
 *                       three UTF-8 bytes -- so a 64 Ki *characters*
 *                       cap let a CJK payload reach ~196 KiB, three times what the
 *                       sentence says, and a code-unit ceiling is not a byte
 *                       ceiling at all.
 *
 *   the notice counts  The suffix ("...[truncated N bytes...]") is part of the
 *                       tool result the model receives, so slicing at `limit`
 *                       and then appending it produced results up to ~80 bytes long.
 *                       A "hard limit" that every truncated result exceeds by
 *                       construction is not a limit. The suffix is now paid for
 *                       out of the budget: the kept prefix is limit - suffix bytes.
 *
 * N is the number of bytes withheld rather than the number kept, because that is
 * the quantity the reader does not have: they can measure what arrived, and cannot
 * see what did not.
 */
/** 64 KiB: the documented hard cap for one tool result. */
export const MAX_TOOL_BYTES = 64 * 1024

export function clip(s: string, limit = MAX_TOOL_BYTES): string {
  const total = byteLength(s)
  if (total <= limit) return s

  const notice = (withheld: number) =>
    `\n...[truncated ${withheld} bytes; narrow the query by driver/tag to see the rest]`

  // Reserve the notice's own size, then find how much of s fits under limit - notice.
  // The notice shrinks as `withheld` grows (fewer digits), so iterate to a fixed point
  // instead of guessing: starting from the full size and shrinking always converges
  // in two or three passes, because the notice is well under the limit.
  let budget = limit - byteLength(notice(total))
  let kept = s
  for (let pass = 0; pass < 4; pass += 1) {
    kept = cutToBytes(s, Math.max(0, budget))
    const n = notice(total - byteLength(kept))
    if (byteLength(kept) + byteLength(n) <= limit) return kept + n
    budget -= byteLength(notice(total)) - byteLength(n) + 1
    if (budget <= 0) break
  }
  // Degenerate limit: return the notice alone, clipped so the caller never gets
  // more than it asked for.
  const n = notice(total)
  return byteLength(n) > limit ? cutToBytes(n, limit) : n
}

/**
 * cutToBytes returns the longest prefix of s whose UTF-8 encoding fits in max.
 *
 * Cutting at String.length would split a surrogate pair (every emoji, every
 * character outside the BMP) and leave a lone half, which is not a character and
 * which JSON.stringify then escaping-mangles. A tool result that ends in a
 * replacement glyph teaches the model the payload was corrupt.
 */
export function cutToBytes(s: string, max: number): string {
  if (max <= 0) return ''
  if (byteLength(s) <= max) return s
  // Walk code points, charging each its real UTF-8 cost. A byte-wise slice of
  // the encoder's output would split a multi-byte character; slicing at
  // String.length would split a surrogate pair (an emoji, any non-BMP glyph).
  // Either way the model receives a trailing replacement glyph and reads it as
  // local corruption. The loop cannot split an iteration, so it cannot split a
  // character.
  let used = 0
  let end = 0
  for (const ch of s) {
    const cost = byteLength(ch)
    if (used + cost > max) break
    used += cost
    end += ch.length // 1 for BMP, 2 when iteration yields a surrogate pair
  }
  return s.slice(0, end)
}
