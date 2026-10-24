import { AlertCircle, Play } from 'lucide-react'
import type React from 'react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRulesPreview } from '@/api/hooks'
import { parseSampleValue } from '@/components/admin/RulePlayground'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConfigStore } from '@/stores/configStore'
import { DATA_TYPES, type DataType } from '@/types/config'
import type { RuleStat } from '@/types/models'

// ─── Shared helpers ─────────────────────────────────────────

/** Targets serialize as `null` (not `[]`) when empty; prefer the multi-target
 *  list when present, otherwise fall back to the single `target` field. */
export const getTargetDisplay = (rule: RuleStat): string => {
  if (rule.targets && rule.targets.length > 0) {
    return rule.targets.join(', ')
  }
  return rule.target || '-'
}

/**
 * Form-side shape of the sample data point for the runtime row's Test
 * dialog. Once evaluated by a rough client-side matcher; now the
 * dialog POSTs to /rules/preview — the same scratch engine the wizard's
 * Playground uses — so the two "test" affordances can no longer disagree.
 */
export interface TestSamplePoint {
  driver: string
  device: string
  group: string
  tag: string
  /** Raw input text; parsed to number when numeric (same as Playground). */
  value: string
  type: DataType
  /** 0=Good, 1=Bad, 2=Uncertain — string form for the Select. */
  quality: '0' | '1' | '2'
}

const INITIAL_TEST_DP: TestSamplePoint = {
  driver: '',
  device: '',
  group: '',
  tag: '',
  value: '',
  type: 'float32',
  quality: '0',
}

const TEST_TYPE_OPTIONS: { value: string; label: string }[] = DATA_TYPES.map((v) => ({
  value: v,
  label: v,
}))

const LabeledInput: React.FC<{
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}> = ({ label, value, onChange, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-foreground">{label}</label>
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="h-9 text-xs"
    />
  </div>
)

const LabeledSelect: React.FC<{
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
}> = ({ label, value, onChange, options, placeholder }) => (
  <div className="space-y-1.5">
    <label className="text-xs font-semibold text-foreground">{label}</label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="font-mono">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="font-mono">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)

// ─── ActionBadge ────────────────────────────────────────────

const ACTION_BADGE_META: Record<string, { cls: string; key: string }> = {
  alert: {
    cls: 'border-status-warning/30 bg-status-warning/10 text-status-warning',
    key: 'rules.actionAlert',
  },
  drop: {
    cls: 'border-status-error/30 bg-status-error/10 text-status-error',
    key: 'rules.actionDrop',
  },
  transform: {
    cls: 'border-primary/30 bg-primary/10 text-primary',
    key: 'rules.actionTransform',
  },
  mirror: {
    cls: 'border-primary/30 bg-primary/10 text-primary',
    key: 'rules.actionMirror',
  },
  default: {
    cls: 'border-status-queued/30 bg-status-queued/10 text-status-queued',
    key: 'rules.actionForward',
  },
}

export const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const { t } = useTranslation()
  const meta = ACTION_BADGE_META[action] ?? ACTION_BADGE_META.default
  return (
    <Badge variant="outline" className={meta.cls}>
      {t(meta.key)}
    </Badge>
  )
}

/** Small badge shown next to ActionBadge when a rule has continue: true. */
export const ContinueBadge: React.FC = () => {
  const { t } = useTranslation()
  return (
    <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
      {t('rules.continue')}
    </Badge>
  )
}

// ─── RuleTestDialog ─────────────────────────────────────────

interface RuleTestDialogProps {
  /** The runtime rule under test; null keeps the dialog closed. */
  rule: RuleStat | null
  onClose: () => void
}

export const RuleTestDialog: React.FC<RuleTestDialogProps> = ({ rule, onClose }) => {
  const { t } = useTranslation()
  // The verdict comes from the SERVER's scratch engine
  // (POST /rules/preview) — the same engine the wizard's Playground
  // uses — so this dialog and the Playground can never disagree again.
  const { mutate, isPending, data, error } = useRulesPreview()

  const [dp, setDp] = useState<TestSamplePoint>(INITIAL_TEST_DP)
  // Stale guard: the verdict stays visible only while the sample point
  // still matches what the last run tested.
  const currentKey = JSON.stringify(dp)
  const [testedKey, setTestedKey] = useState<string | null>(null)
  const showResult = testedKey !== null && testedKey === currentKey

  const QUALITY_OPTIONS = useMemo(
    () =>
      [
        { value: '0', label: `0 — ${t('common.good')}` },
        { value: '1', label: `1 — ${t('common.bad')}` },
        { value: '2', label: `2 — ${t('common.uncertain')}` },
      ] as { value: string; label: string }[],
    [t],
  )

  // Config-driven dropdowns: surface already-configured drivers and their
  // tags/groups so the operator can pick from a list instead of retyping
  // names that exist in the config file.
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const configDrivers = workingConfig?.drivers ?? []
  const driverNames = configDrivers.map((d) => d.name).filter(Boolean)

  // Tags belonging to the currently selected driver.
  const selectedDriverTags = useMemo(() => {
    const drivers = workingConfig?.drivers ?? []
    const driver = drivers.find((d) => d.name === dp.driver)
    return driver?.tags ?? []
  }, [workingConfig, dp.driver])
  const tagNames = selectedDriverTags.map((tg) => tg.name).filter(Boolean)

  // Unique group names across the selected driver's tags.
  const groupNames = useMemo(() => {
    const groups = new Set<string>()
    for (const tg of selectedDriverTags) {
      if (tg.group) groups.add(tg.group)
    }
    return Array.from(groups).sort()
  }, [selectedDriverTags])

  const runTest = () => {
    if (!rule || isPending) return
    setTestedKey(currentKey)
    mutate({
      match: rule.match,
      point: {
        driver: dp.driver.trim(),
        device: dp.device.trim(),
        group: dp.group.trim(),
        tag: dp.tag.trim(),
        value: parseSampleValue(dp.value),
        type: dp.type,
        quality: Number(dp.quality),
        timestamp: new Date().toISOString(),
      },
    })
  }

  return (
    <Dialog open={rule !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('rules.testRule', { name: rule?.name })}</DialogTitle>
          <DialogDescription>{t('rules.testDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">
              {t('rules.matchExpression')}
            </div>
            <code className="block px-3 py-2 rounded bg-muted/60 text-xs font-mono text-primary border border-border break-all">
              {rule?.match || t('rules.emptyMatch')}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {driverNames.length > 0 ? (
              <LabeledSelect
                label={t('common.driver')}
                value={dp.driver}
                onChange={(v) => setDp({ ...dp, driver: v, tag: '', group: '' })}
                options={driverNames.map((n) => ({ value: n, label: n }))}
                placeholder={t('common.select')}
              />
            ) : (
              <LabeledInput
                label={t('common.driver')}
                value={dp.driver}
                onChange={(v) => setDp({ ...dp, driver: v })}
                placeholder={t('rules.phDriver')}
              />
            )}
            <LabeledInput
              label={t('common.device')}
              value={dp.device}
              onChange={(v) => setDp({ ...dp, device: v })}
              placeholder={t('rules.phDevice')}
            />
            {groupNames.length > 0 ? (
              <LabeledSelect
                label={t('common.group')}
                value={dp.group}
                onChange={(v) => setDp({ ...dp, group: v })}
                options={groupNames.map((n) => ({ value: n, label: n }))}
                placeholder={t('common.none')}
              />
            ) : (
              <LabeledInput
                label={t('common.group')}
                value={dp.group}
                onChange={(v) => setDp({ ...dp, group: v })}
                placeholder={t('rules.phGroup')}
              />
            )}
            {tagNames.length > 0 ? (
              <LabeledSelect
                label={t('common.tag')}
                value={dp.tag}
                onChange={(v) => {
                  const selected = selectedDriverTags.find((tg) => tg.name === v)
                  setDp({
                    ...dp,
                    tag: v,
                    ...(selected?.type ? { type: selected.type as DataType } : {}),
                  })
                }}
                options={tagNames.map((n) => ({ value: n, label: n }))}
                placeholder={t('common.select')}
              />
            ) : (
              <LabeledInput
                label={t('common.tag')}
                value={dp.tag}
                onChange={(v) => setDp({ ...dp, tag: v })}
                placeholder={t('rules.phTag')}
              />
            )}
            <LabeledInput
              label={t('common.value')}
              value={dp.value}
              onChange={(v) => setDp({ ...dp, value: v })}
              placeholder={t('rules.phValue')}
            />
            <LabeledSelect
              label={t('common.type')}
              value={dp.type}
              onChange={(v) => setDp({ ...dp, type: v as DataType })}
              options={TEST_TYPE_OPTIONS}
            />
            <LabeledSelect
              label={t('common.quality')}
              value={dp.quality}
              onChange={(v) => setDp({ ...dp, quality: v as TestSamplePoint['quality'] })}
              options={QUALITY_OPTIONS}
            />
          </div>

          {rule && showResult && (
            <div className="space-y-2" aria-live="polite" data-testid="rule-test-result">
              {data?.outcome === 'evaluated' && data.matched && (
                <div className="rounded-lg border border-status-running/30 bg-status-running/10 p-3 space-y-1.5">
                  <div className="text-xs font-bold text-status-running">{t('rules.matched')}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{t('common.action')}:</span>
                    <ActionBadge action={rule.action} />
                  </div>
                  <div className="text-xs font-mono">
                    <span className="text-muted-foreground">{t('common.target')}:</span>{' '}
                    <span className="text-foreground">{getTargetDisplay(rule)}</span>
                  </div>
                </div>
              )}

              {data?.outcome === 'evaluated' && !data.matched && (
                <div className="rounded-lg border border-status-error/30 bg-status-error/10 p-3">
                  <div className="text-xs font-bold text-status-error">{t('rules.noMatch')}</div>
                </div>
              )}

              {data?.outcome === 'error' && (
                <div className="space-y-1 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-status-error">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {data.status === 501
                      ? t('ruleWizard.playgroundUnsupported')
                      : t('ruleWizard.playgroundFailed')}
                  </div>
                  {/* Verbatim on purpose: the backend returns compile/eval
                      errors unmasked so the author sees expr's own message. */}
                  <p className="break-all font-mono text-muted-foreground">{data.error}</p>
                </div>
              )}

              {error && (
                <div className="space-y-1 rounded-lg border border-status-error/30 bg-status-error/10 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-semibold text-status-error">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {t('ruleWizard.playgroundFailed')}
                  </div>
                  <p className="break-all text-muted-foreground">
                    {error instanceof Error ? error.message : String(error)}
                  </p>
                </div>
              )}

              {data?.outcome === 'evaluated' && (
                <div className="text-xs text-muted-foreground border-t border-border/40 pt-1">
                  {t('rules.testNote')}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button onClick={runTest} disabled={!rule || isPending}>
            <Play className="w-3.5 h-3.5 mr-1.5" />
            {t('rules.runTest')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
