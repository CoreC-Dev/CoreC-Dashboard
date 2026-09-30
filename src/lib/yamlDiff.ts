/**
 * Shared line-level YAML diff via longest-common-subsequence.
 *
 * Two callers use this:
 *  - ConfigCenterPage  — needs line numbers for gutter display
 *  - ConfigApplyConfirmationDialog — only needs type + text
 *
 * The rich `DiffLine` type includes line numbers; callers that don't
 * need them can ignore the `oldLineNo`/`newLineNo` fields.
 */
export interface DiffLine {
  type: 'equal' | 'added' | 'removed'
  text: string
  oldLineNo: number | null
  newLineNo: number | null
}

/** Line-by-line diff via LCS backtracking. O(m×n) — fine for config YAMLs. */
export function computeLcsDiff(oldStr: string, newStr: string): DiffLine[] {
  const oldLines = oldStr.split('\n')
  const newLines = newStr.split('\n')
  const m = oldLines.length
  const n = newLines.length

  // dp[i][j] = length of the LCS of oldLines[i..] and newLines[j..]
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const result: DiffLine[] = []
  let i = 0
  let j = 0
  let oldNo = 1
  let newNo = 1
  while (i < m && j < n) {
    if (oldLines[i] === newLines[j]) {
      result.push({ type: 'equal', text: oldLines[i], oldLineNo: oldNo++, newLineNo: newNo++ })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: 'removed', text: oldLines[i], oldLineNo: oldNo++, newLineNo: null })
      i++
    } else {
      result.push({ type: 'added', text: newLines[j], oldLineNo: null, newLineNo: newNo++ })
      j++
    }
  }
  while (i < m) {
    result.push({ type: 'removed', text: oldLines[i], oldLineNo: oldNo++, newLineNo: null })
    i++
  }
  while (j < n) {
    result.push({ type: 'added', text: newLines[j], oldLineNo: null, newLineNo: newNo++ })
    j++
  }
  return result
}
