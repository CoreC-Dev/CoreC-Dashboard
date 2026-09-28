export interface MetricEntry {
  name: string
  labels: Record<string, string>
  value: number
}

export function parsePrometheusMetrics(raw: string): MetricEntry[] {
  const lines = raw.split('\n')
  const results: MetricEntry[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    // metric_name{label="val",...} 123.45
    // or metric_name 123.45
    // The label section is delimited by the opening brace and the matching
    // closing brace. A naive [^}]* would truncate at the first '}' inside a
    // label value (e.g. my_metric{label="val_}"} 1). We scan for the real
    // closing brace by respecting quoted strings: a '}' inside quotes does
    // not terminate the label block. [M-4]
    const nameMatch = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)/)
    if (!nameMatch) continue
    const name = nameMatch[1]
    let rest = trimmed.slice(nameMatch[0].length)

    let rawLabels: string | undefined
    if (rest.startsWith('{')) {
      // Find the closing brace that is NOT inside a quoted string.
      let inString = false
      let closeIdx = -1
      for (let i = 1; i < rest.length; i++) {
        const ch = rest[i]
        if (ch === '"' && rest[i - 1] !== '\\') inString = !inString
        else if (ch === '}' && !inString) {
          closeIdx = i
          break
        }
      }
      if (closeIdx === -1) continue // malformed — no closing brace
      rawLabels = rest.slice(1, closeIdx)
      rest = rest.slice(closeIdx + 1)
    }

    const valueMatch = rest.match(/^\s+([^\s]+)/)
    if (!valueMatch) continue
    const rawVal = valueMatch[1]
    const val = parseFloat(rawVal)
    if (Number.isNaN(val)) continue

    const labels: Record<string, string> = {}
    if (rawLabels) {
      // Label values are quoted; extract key="value" pairs while respecting
      // escaped quotes and '}' characters inside the value.
      const labelRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"/g
      let m: RegExpExecArray | null
      while ((m = labelRegex.exec(rawLabels)) !== null) {
        // Unescape standard Prometheus escapes: \" \\ \n
        labels[m[1]] = m[2].replace(/\\(.)/g, '$1')
      }
    }

    results.push({ name, labels, value: val })
  }

  return results
}
