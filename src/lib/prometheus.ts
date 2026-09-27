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
    const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([^\s]+)/)
    if (!match) continue

    const [, name, rawLabels, rawVal] = match
    const val = parseFloat(rawVal)
    if (Number.isNaN(val)) continue

    const labels: Record<string, string> = {}
    if (rawLabels) {
      const labelRegex = /([a-zA-Z_][a-zA-Z0-9_]*)=["']([^"']*)["']/g
      let m: RegExpExecArray | null
      while ((m = labelRegex.exec(rawLabels)) !== null) {
        labels[m[1]] = m[2]
      }
    }

    results.push({ name, labels, value: val })
  }

  return results
}
