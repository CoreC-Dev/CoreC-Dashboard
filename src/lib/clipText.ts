/**
 * clipText.ts — cap a string at a byte budget and say how much was withheld.
 *
 * Budgets are UTF-8 BYTES (not String.length code units), and the truncation
 * notice counts against the budget. Callers pass a byte count and get a byte
 * count.
 */

/** UTF-8 size of one string, without allocating a Buffer per character. */
export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length
}

/**
 * clip caps a tool result at limit BYTES and reports how much it withheld.
 * The notice suffix ("...[truncated N bytes...]") is paid for out of the
 * budget: the kept prefix is limit - suffix bytes. N is the number of bytes
 * withheld, not kept.
 */
/** 单个工具结果的字节上限。 */
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
 * Cutting at a code-point boundary never splits a multi-byte character or a
 * surrogate pair.
 */
export function cutToBytes(s: string, max: number): string {
  if (max <= 0) return ''
  if (byteLength(s) <= max) return s
  // Walk code points, charging each its real UTF-8 cost, so the cut never
  // splits a multi-byte character or a surrogate pair.
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
