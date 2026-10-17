/**
 * RulePlayground — the offline "试算" (trial-run) affordance next to the
 * RuleWizard's match expression editor (POST /rules/preview).
 *
 * The backend compiles the current match expression in a SCRATCH rule
 * engine and evaluates it against one sample data point — the active
 * rule set is never touched — so the author can validate syntax and
 * semantics BEFORE saving, instead of discovering a compile error only
 * when production data flows through a saved rule.
 *
 * UI contract (hub/route/rules_preview.go + docs/api/rules.md):
 *  - collapsible mini form for the sample point (driver/tag/value/
 *    type/quality, defaults supplied by the wizard meta); device/group
 *    are sent as their zero values, timestamp as "now";
 *  - 200 {matched} renders a plain ✓/✗ — a miss is a result, not an
 *    error;
 *  - 400 compile/eval errors (and the 501 unsupported-engine body) are
 *    shown VERBATIM next to the editor — the backend returns them
 *    unmasked for exactly this purpose;
 *  - the run button is disabled while a preview is in flight and when
 *    the match expression is empty (the backend rejects "" with 400);
 *  - once the match or the sample point changes after a run, the
 *    previous verdict is hidden as stale.
 */
import { Check, ChevronDown, FlaskConical, Loader2, X } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRulesPreview } from '@/api/hooks'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/cn'
import { DATA_TYPES, type DataType } from '@/types/config'

/** Sample-point defaults — owned by the wizard (ruleWizardMeta), passed in. */
export interface RulePlaygroundDefaults {
  driver: string
  tag: string
  /** Raw input text; parsed to a number when it is numeric. */
  value: string
  type: DataType
  /** 0=Good, 1=Bad, 2=Uncertain (core Quality). */
  quality: number
}

export interface RulePlaygroundProps {
  /** The match expression under test (live from the wizard editor). */
  match: string
  /** Default sample point for the mini form. */
  defaults: RulePlaygroundDefaults
}

/** Numeric input text becomes a number; anything else stays a string. */
const parseSampleValue = (raw: string): number | string => {
  const trimmed = raw.trim()
  if (trimmed !== '') {
    const num = Number(trimmed)
    if (Number.isFinite(num)) return num
  }
  return raw
}

const QUALITY_OPTIONS = [0, 1, 2] as const

export const RulePlayground: React.FC<RulePlaygroundProps> = ({ match, defaults }) => {
  const { t } = useTranslation()
  const { mutate, isPending, data, error } = useRulesPreview()

  const [open, setOpen] = useState(false)
  const [driver, setDriver] = useState(defaults.driver)
  const [tag, setTag] = useState(defaults.tag)
  const [valueText, setValueText] = useState(defaults.value)
  const [type, setType] = useState<DataType>(defaults.type)
  const [quality, setQuality] = useState(defaults.quality)

  // Stale guard: the verdict stays visible only while the expression AND
  // the sample point still match what the last run tested.
  const currentKey = JSON.stringify([match, driver, tag, valueText, type, quality])
  const [testedKey, setTestedKey] = useState<string | null>(null)
  const showResult = testedKey !== null && testedKey === currentKey

  const hasMatch = match.trim() !== ''
  const canRun = hasMatch && !isPending

  const runPreview = () => {
    if (!canRun) return
    setTestedKey(currentKey)
    mutate({
      match,
      point: {
        driver: driver.trim(),
        device: '',
        group: '',
        tag: tag.trim(),
        value: parseSampleValue(valueText),
        type,
        quality,
        timestamp: new Date().toISOString(),
      },
    })
  }

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-accent/40 transition-colors"
      >
        <FlaskConical className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="font-semibold shrink-0">{t('ruleWizard.playground')}</span>
        <span className="text-muted-foreground truncate">{t('ruleWizard.playgroundDesc')}</span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 ml-auto shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open && (
        <div className="space-y-2.5 border-t border-border px-2.5 py-2.5">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t('ruleWizard.playgroundSamplePoint')}
          </div>

          {/* Sample data point mini form */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('common.driver')}</span>
              <Input
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
                className="h-7 text-xs"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('common.tag')}</span>
              <Input value={tag} onChange={(e) => setTag(e.target.value)} className="h-7 text-xs" />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('common.value')}</span>
              <Input
                value={valueText}
                onChange={(e) => setValueText(e.target.value)}
                className="h-7 text-xs font-mono"
              />
            </label>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('common.type')}</span>
              <Select value={type} onValueChange={(v) => setType(v as DataType)}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DATA_TYPES.map((dt) => (
                    <SelectItem key={dt} value={dt} className="text-xs font-mono">
                      {dt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t('common.quality')}</span>
              <Select value={String(quality)} onValueChange={(v) => setQuality(Number(v))}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {QUALITY_OPTIONS.map((q) => (
                    <SelectItem key={q} value={String(q)} className="text-xs">
                      {t(q === 0 ? 'common.good' : q === 1 ? 'common.bad' : 'common.uncertain')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={runPreview}
              disabled={!canRun}
              className="h-7 px-2.5 text-xs"
            >
              {isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <FlaskConical className="h-3 w-3 mr-1" />
              )}
              {t('ruleWizard.playgroundRun')}
            </Button>
            {!hasMatch && (
              <span className="text-xs text-muted-foreground">
                {t('ruleWizard.playgroundNeedMatch')}
              </span>
            )}
          </div>

          {showResult && (
            <div aria-live="polite" className="space-y-1" data-testid="rule-playground-result">
              {data?.outcome === 'evaluated' && data.matched && (
                <div className="flex items-center gap-2 rounded-md border border-status-running/30 bg-status-running/10 p-2 text-xs">
                  <Check className="h-3.5 w-3.5 text-status-running shrink-0" />
                  <span className="font-semibold text-status-running">
                    {t('ruleWizard.playgroundMatched')}
                  </span>
                </div>
              )}

              {data?.outcome === 'evaluated' && !data.matched && (
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2 text-xs">
                  <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-muted-foreground">
                    {t('ruleWizard.playgroundNotMatched')}
                  </span>
                </div>
              )}

              {data?.outcome === 'error' && (
                <div className="space-y-1 rounded-md border border-status-error/30 bg-status-error/10 p-2 text-xs">
                  <div className="font-semibold text-status-error">
                    {data.status === 501
                      ? t('ruleWizard.playgroundUnsupported')
                      : t('ruleWizard.playgroundFailed')}
                  </div>
                  {/* Verbatim on purpose: the backend returns compile/eval
                      errors unmasked so the author sees expr's own message. */}
                  <p className="font-mono break-all text-muted-foreground">{data.error}</p>
                </div>
              )}

              {error && (
                <div className="space-y-1 rounded-md border border-status-error/30 bg-status-error/10 p-2 text-xs">
                  <div className="font-semibold text-status-error">
                    {t('ruleWizard.playgroundFailed')}
                  </div>
                  <p className="break-all text-muted-foreground">
                    {error instanceof Error ? error.message : String(error)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
