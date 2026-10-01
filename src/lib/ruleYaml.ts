/**
 * Rule YAML serialization helpers.
 *
 * Extracted from RulesPage.tsx so the YAML-building logic is independently
 * testable and decoupled from the React component.
 *
 * `buildRuleYaml` produces the CoreC config YAML payload for an edited rule,
 * in the format expected by PUT /configs (hot-reload). Mirror rules emit a
 * `targets:` array (parsed from the comma-separated form field); transform
 * rules emit a `transform:` block with expression and optional tag-rename.
 * All other actions use the single `target:` field.
 */
import type { RuleStat } from '@/types/models'

export interface EditFormData {
  name: string
  match: string
  action: RuleStat['action']
  target: string
  /** Comma-separated target list for mirror rules. */
  targets: string
  priority: number
  /** Transform expression (action === 'transform' only). */
  transformExpression: string
  /** Optional tag-rename (action === 'transform' only). */
  transformTagRename: string
}

// Wrap a string as a YAML single-quoted scalar — internal single quotes are
// doubled. The match DSL may contain `&&`, `||`, comparisons and embedded
// quotes, none of which are safe as a bare YAML scalar.
export const yamlScalar = (s: string): string => `'${s.replace(/'/g, "''")}'`

export const buildRuleYaml = (data: EditFormData): string => {
  const lines: string[] = [
    'rules:',
    `  - name: ${yamlScalar(data.name)}`,
    `    match: ${yamlScalar(data.match)}`,
    `    action: ${data.action}`,
  ]

  if (data.action === 'mirror') {
    const targets = data.targets
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (targets.length > 0) {
      lines.push('    targets:')
      for (const t of targets) lines.push(`      - ${yamlScalar(t)}`)
    } else {
      lines.push(`    target: ${yamlScalar('')}`)
    }
  } else {
    lines.push(`    target: ${yamlScalar(data.target)}`)
  }

  lines.push(`    priority: ${data.priority}`)

  if (data.action === 'transform') {
    lines.push('    transform:')
    lines.push(`      expression: ${yamlScalar(data.transformExpression)}`)
    if (data.transformTagRename.trim()) {
      lines.push(`      tag-rename: ${yamlScalar(data.transformTagRename.trim())}`)
    }
  }

  return lines.join('\n')
}
