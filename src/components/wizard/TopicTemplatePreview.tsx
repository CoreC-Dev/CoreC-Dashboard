/**
 * TopicTemplatePreview
 *
 * Live preview for the MQTT topic-template field. Shows:
 * 1. Available template variables as clickable chips (inserts into the input)
 * 2. Resolved topic examples using actual driver/tag names from the config
 * 3. Default-value hint when the field is empty
 */
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@/stores/configStore'

const TEMPLATE_VARS = ['{{.Driver}}', '{{.Tag}}', '{{.Group}}', '{{.Device}}']

/** Resolve a Go text/template topic string with sample values. */
function resolveTopic(template: string, vars: Record<string, string>): string {
  let result = template
  for (const [key, val] of Object.entries(vars)) {
    // Go template syntax: {{.Key}}
    result = result.replaceAll(`{{.${key}}}`, val)
  }
  // Clean up empty segments (consecutive slashes from empty vars)
  result = result
    .replace(/\/{2,}/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
  return result || template
}

export const TopicTemplatePreview: React.FC<{
  value: string
  onChange: (value: string) => void
}> = ({ value, onChange }) => {
  const { t } = useTranslation()
  const workingConfig = useConfigStore((s) => s.workingConfig)

  // Collect driver/tag examples from the current config.
  const drivers = workingConfig?.drivers ?? []
  const examples: { driver: string; tag: string; group: string }[] = []
  for (const d of drivers.slice(0, 3)) {
    const tags = d.tags ?? []
    for (const tag of tags.slice(0, 2)) {
      examples.push({
        driver: d.name ?? 'driver',
        tag: tag.name ?? 'tag',
        group: tag.group ?? '',
      })
    }
  }
  // Fallback if no drivers/tags configured.
  const hasRealData = examples.length > 0
  if (!hasRealData) {
    examples.push({ driver: 'modbus-sim', tag: 'temperature', group: '' })
  }

  const effectiveTemplate = value || 'corec/{{.Driver}}/{{.Tag}}'

  return (
    <div className="mt-1.5 space-y-1.5 rounded-md border border-muted bg-muted/30 p-2">
      {/* Variable chips */}
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] text-muted-foreground">{t('wizard.topicVars')}:</span>
        {TEMPLATE_VARS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => {
              const input = value + v
              onChange(input)
            }}
            className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary hover:bg-primary/20 transition-colors"
          >
            {v}
          </button>
        ))}
      </div>

      {/* Preview */}
      <div className="space-y-0.5">
        <span className="text-[10px] text-muted-foreground">
          {t('wizard.topicPreview')}
          {!value && <span className="ml-1 italic">({t('wizard.topicPreviewEmpty')})</span>}
        </span>
        {examples.map((ex, i) => {
          const resolved = resolveTopic(effectiveTemplate, {
            Driver: ex.driver,
            Tag: ex.tag,
            Group: ex.group,
            Device: ex.driver,
          })
          return (
            <div key={i} className="flex items-center gap-1 font-mono text-[11px]">
              <span className="text-muted-foreground/60">→</span>
              <code className="rounded bg-background px-1.5 py-0.5 text-foreground">
                {resolved}
              </code>
            </div>
          )
        })}
        {!hasRealData && <p className="text-[10px] text-amber-500">{t('wizard.topicNoDrivers')}</p>}
      </div>
    </div>
  )
}
