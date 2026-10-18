import { Play } from 'lucide-react'
import type React from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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
import type { SimDataPoint } from '@/lib/ruleMatchEvaluator'
import { useConfigStore } from '@/stores/configStore'
import { DATA_TYPES } from '@/types/config'
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

export const EMPTY_TEST_DP: SimDataPoint = {
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
  testRule: RuleStat | null
  testDp: SimDataPoint
  setTestDp: React.Dispatch<React.SetStateAction<SimDataPoint>>
  testResult: boolean | null
  closeTest: () => void
  runTest: () => void
}

export const RuleTestDialog: React.FC<RuleTestDialogProps> = ({
  testRule,
  testDp,
  setTestDp,
  testResult,
  closeTest,
  runTest,
}) => {
  const { t } = useTranslation()
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
    const driver = drivers.find((d) => d.name === testDp.driver)
    return driver?.tags ?? []
  }, [workingConfig, testDp.driver])
  const tagNames = selectedDriverTags.map((tg) => tg.name).filter(Boolean)

  // Unique group names across the selected driver's tags.
  const groupNames = useMemo(() => {
    const groups = new Set<string>()
    for (const tg of selectedDriverTags) {
      if (tg.group) groups.add(tg.group)
    }
    return Array.from(groups).sort()
  }, [selectedDriverTags])

  return (
    <Dialog open={testRule !== null} onOpenChange={(o) => !o && closeTest()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('rules.testRule', { name: testRule?.name })}</DialogTitle>
          <DialogDescription>{t('rules.testDesc')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-muted-foreground">
              {t('rules.matchExpression')}
            </div>
            <code className="block px-3 py-2 rounded bg-muted/60 text-xs font-mono text-primary border border-border break-all">
              {testRule?.match || t('rules.emptyMatch')}
            </code>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {driverNames.length > 0 ? (
              <LabeledSelect
                label={t('common.driver')}
                value={testDp.driver}
                onChange={(v) => setTestDp({ ...testDp, driver: v, tag: '', group: '' })}
                options={driverNames.map((n) => ({ value: n, label: n }))}
                placeholder={t('common.select')}
              />
            ) : (
              <LabeledInput
                label={t('common.driver')}
                value={testDp.driver}
                onChange={(v) => setTestDp({ ...testDp, driver: v })}
                placeholder={t('rules.phDriver')}
              />
            )}
            <LabeledInput
              label={t('common.device')}
              value={testDp.device}
              onChange={(v) => setTestDp({ ...testDp, device: v })}
              placeholder={t('rules.phDevice')}
            />
            {groupNames.length > 0 ? (
              <LabeledSelect
                label={t('common.group')}
                value={testDp.group}
                onChange={(v) => setTestDp({ ...testDp, group: v })}
                options={groupNames.map((n) => ({ value: n, label: n }))}
                placeholder={t('common.none')}
              />
            ) : (
              <LabeledInput
                label={t('common.group')}
                value={testDp.group}
                onChange={(v) => setTestDp({ ...testDp, group: v })}
                placeholder={t('rules.phGroup')}
              />
            )}
            {tagNames.length > 0 ? (
              <LabeledSelect
                label={t('common.tag')}
                value={testDp.tag}
                onChange={(v) => {
                  const selected = selectedDriverTags.find((tg) => tg.name === v)
                  setTestDp({
                    ...testDp,
                    tag: v,
                    ...(selected?.type ? { type: selected.type } : {}),
                  })
                }}
                options={tagNames.map((n) => ({ value: n, label: n }))}
                placeholder={t('common.select')}
              />
            ) : (
              <LabeledInput
                label={t('common.tag')}
                value={testDp.tag}
                onChange={(v) => setTestDp({ ...testDp, tag: v })}
                placeholder={t('rules.phTag')}
              />
            )}
            <LabeledInput
              label={t('common.value')}
              value={testDp.value}
              onChange={(v) => setTestDp({ ...testDp, value: v })}
              placeholder={t('rules.phValue')}
            />
            <LabeledSelect
              label={t('common.type')}
              value={testDp.type}
              onChange={(v) => setTestDp({ ...testDp, type: v })}
              options={TEST_TYPE_OPTIONS}
            />
            <LabeledSelect
              label={t('common.quality')}
              value={testDp.quality}
              onChange={(v) => setTestDp({ ...testDp, quality: v })}
              options={QUALITY_OPTIONS}
            />
          </div>

          {testRule && testResult !== null && (
            <div
              className={`rounded-lg border p-3 space-y-2 ${
                testResult
                  ? 'border-status-running/30 bg-status-running/10'
                  : 'border-status-error/30 bg-status-error/10'
              }`}
            >
              {testResult ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-status-running">{t('rules.matched')}</div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">{t('common.action')}:</span>
                    <ActionBadge action={testRule.action} />
                  </div>
                  <div className="text-xs font-mono">
                    <span className="text-muted-foreground">{t('common.target')}:</span>{' '}
                    <span className="text-foreground">{getTargetDisplay(testRule)}</span>
                  </div>
                </div>
              ) : (
                <div className="text-xs font-bold text-status-error">{t('rules.noMatch')}</div>
              )}
              <div className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                {t('rules.testNote')}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={closeTest}>
            {t('common.close')}
          </Button>
          <Button onClick={runTest} disabled={!testRule}>
            <Play className="w-3.5 h-3.5 mr-1.5" />
            {t('rules.runTest')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
