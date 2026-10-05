/**
 * MatchExpressionChips
 *
 * Quick-insert chips for the rule match expression field. Shows configured
 * driver and tag names as clickable buttons that insert the appropriate
 * expression fragment (e.g. `driver == "plc-modbus"`) into the match input.
 *
 * Reads from the configStore's workingConfig — no props needed.
 */
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { useConfigStore } from '@/stores/configStore'

export const MatchExpressionChips: React.FC<{
  onInsert: (fragment: string) => void
}> = ({ onInsert }) => {
  const { t } = useTranslation()
  const workingConfig = useConfigStore((s) => s.workingConfig)

  const drivers = (workingConfig?.drivers ?? []).filter((d) => d.name)
  const tags = drivers.flatMap((d) => (d.tags ?? []).map((tg) => tg.name)).filter(Boolean)

  // Deduplicate tag names.
  const uniqueTags = [...new Set(tags)]

  if (drivers.length === 0 && uniqueTags.length === 0) return null

  return (
    <div className="space-y-1">
      {drivers.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground">{t('ruleWizard.driverChips')}:</span>
          {drivers.slice(0, 8).map((d) => (
            <button
              key={d.name}
              type="button"
              onClick={() => onInsert(`driver == "${d.name}"`)}
              className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary hover:bg-primary/20 transition-colors"
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
      {uniqueTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-muted-foreground">{t('ruleWizard.tagChips')}:</span>
          {uniqueTags.slice(0, 10).map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => onInsert(`tag == "${name}"`)}
              className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary hover:bg-primary/20 transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
