/**
 * ConfigApplyConfirmationDialog
 *
 * Safety gate before PUT /configs (full hot-reload). Because CoreC's
 * config API suspends the ENTIRE engine during reload (non-atomic, no
 * rollback), every config mutation must pass through this dialog:
 *
 *   1. Shows a side-by-side YAML diff (before → after) so the operator
 *      can see exactly what will change.
 *   2. Lists affected sections (drivers/transports/rules/global) with
 *      a summary of per-entity changes (added/modified/removed).
 *   3. Requires explicit "Apply" confirmation — no auto-save, ever.
 *   4. Shows a warning banner that the engine will briefly suspend.
 *   5. During apply (finishing=true), disables all controls and shows
 *      a spinner — closing mid-apply is blocked.
 *
 * Decision-independent: works under both backend paths. Path A validates
 * via POST /configs/validate first (if available); Path B relies on the
 * local zod schema (validateFullConfig). The dialog receives a pre-
 * validated working YAML and only handles the confirmation + apply.
 */
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import type React from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { parseConfigYaml } from '@/lib/configYaml'
import { cn } from '@/lib/utils'

// ─── Diff computation ────────────────────────────────────────────────

export interface ConfigDiffEntry {
  entity: string
  name: string
  change: 'added' | 'removed' | 'modified'
}

export interface ConfigDiffSummary {
  /** Per-section counts. */
  drivers: { added: number; removed: number; modified: number }
  transports: { added: number; removed: number; modified: number }
  rules: { added: number; removed: number; modified: number }
  global: boolean
  node: boolean
  'rule-providers': boolean
  'rule-groups': boolean
  /** Total number of changed entities. */
  totalChanges: number
  /** Whether any changed section requires an engine restart. */
  requiresRestart: boolean
}

/**
 * Compute a structural diff between two config snapshots by entity name.
 * Used to show a human-readable summary alongside the raw YAML diff.
 */
export function computeConfigDiff(
  before: {
    drivers?: { name: string }[]
    transports?: { name: string }[]
    rules?: { name: string }[]
    global?: unknown
    node?: unknown
    'rule-providers'?: unknown
    'rule-groups'?: unknown
  } | null,
  after: {
    drivers?: { name: string }[]
    transports?: { name: string }[]
    rules?: { name: string }[]
    global?: unknown
    node?: unknown
    'rule-providers'?: unknown
    'rule-groups'?: unknown
  } | null,
): ConfigDiffSummary {
  const diffArrays = (
    a: { name: string }[] | undefined,
    b: { name: string }[] | undefined,
  ): { added: number; removed: number; modified: number } => {
    const aMap = new Map((a ?? []).map((e) => [e.name, e]))
    const bMap = new Map((b ?? []).map((e) => [e.name, e]))
    const aNames = aMap.keys()
    const bNames = bMap.keys()

    let added = 0
    let removed = 0
    let modified = 0

    // Added: in b but not in a
    for (const name of bNames) {
      if (!aMap.has(name)) added++
    }
    // Removed: in a but not in b
    for (const name of aNames) {
      if (!bMap.has(name)) removed++
    }
    // Modified: in both but content differs (compare by JSON for deep equality)
    for (const [name, aEntity] of aMap) {
      const bEntity = bMap.get(name)
      if (bEntity && JSON.stringify(aEntity) !== JSON.stringify(bEntity)) {
        modified++
      }
    }

    return { added, removed, modified }
  }

  const drivers = diffArrays(before?.drivers, after?.drivers)
  const transports = diffArrays(before?.transports, after?.transports)
  const rules = diffArrays(before?.rules, after?.rules)
  const global = JSON.stringify(before?.global) !== JSON.stringify(after?.global)
  const node = JSON.stringify(before?.node) !== JSON.stringify(after?.node)
  const ruleProviders =
    JSON.stringify(before?.['rule-providers']) !== JSON.stringify(after?.['rule-providers'])
  const ruleGroups =
    JSON.stringify(before?.['rule-groups']) !== JSON.stringify(after?.['rule-groups'])

  const totalChanges =
    drivers.added +
    drivers.removed +
    drivers.modified +
    transports.added +
    transports.removed +
    transports.modified +
    rules.added +
    rules.removed +
    rules.modified +
    (global ? 1 : 0) +
    (node ? 1 : 0) +
    (ruleProviders ? 1 : 0) +
    (ruleGroups ? 1 : 0)

  // Sections that require engine restart: global (api/engine/buffer),
  // node, rule-providers, rule-groups. Drivers/transports/rules are
  // hot-updatable (log-level, tags, settings can change at runtime).
  const requiresRestart = global || node || ruleProviders || ruleGroups

  return {
    drivers,
    transports,
    rules,
    global,
    node,
    'rule-providers': ruleProviders,
    'rule-groups': ruleGroups,
    totalChanges,
    requiresRestart,
  }
}

// ─── Line-level YAML diff ────────────────────────────────────────────

/**
 * Simple line-level diff between two YAML strings.
 * Produces an array of { type: 'same'|'added'|'removed', text } entries.
 * Uses a basic LCS algorithm — sufficient for config YAMLs (hundreds of
 * lines max, not thousands).
 */
export interface DiffLine {
  type: 'same' | 'added' | 'removed'
  text: string
}

export function computeLineDiff(before: string, after: string): DiffLine[] {
  const beforeLines = before.split('\n')
  const afterLines = after.split('\n')

  // LCS table
  const m = beforeLines.length
  const n = afterLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (beforeLines[i - 1] === afterLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to build the diff
  const result: DiffLine[] = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeLines[i - 1] === afterLines[j - 1]) {
      result.unshift({ type: 'same', text: beforeLines[i - 1] })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: afterLines[j - 1] })
      j--
    } else {
      result.unshift({ type: 'removed', text: beforeLines[i - 1] })
      i--
    }
  }

  return result
}

// ─── Dialog component ────────────────────────────────────────────────

export interface ConfigApplyConfirmationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Before YAML (saved config). null = new config (everything is "added"). */
  beforeYaml: string | null
  /** After YAML (working config — what will be applied). */
  afterYaml: string
  /** Structural diff summary (pre-computed by caller or computed here). */
  diff?: ConfigDiffSummary
  /** Whether the apply is in progress (disables controls). */
  applying: boolean
  /** Called when the user confirms. */
  onConfirm: () => void
  /** Optional validation errors to display (from validateFullConfig). */
  validationErrors?: string[]
}

export const ConfigApplyConfirmationDialog: React.FC<ConfigApplyConfirmationDialogProps> = ({
  open,
  onOpenChange,
  beforeYaml,
  afterYaml,
  diff,
  applying = false,
  onConfirm,
  validationErrors,
}) => {
  const { t } = useTranslation()

  const lineDiff = useMemo(
    () => computeLineDiff(beforeYaml ?? '', afterYaml),
    [beforeYaml, afterYaml],
  )

  const summary = useMemo(() => {
    if (diff) return diff
    // Parse the before/after YAML strings to compute a real diff.
    // If parsing fails (shouldn't happen — working YAML is always valid
    // after validation), fall back to a zero-diff summary.
    try {
      const before = beforeYaml ? parseConfigYaml(beforeYaml) : null
      const after = afterYaml ? parseConfigYaml(afterYaml) : null
      return computeConfigDiff(before, after)
    } catch {
      return computeConfigDiff(null, null)
    }
  }, [diff, beforeYaml, afterYaml])

  const hasValidationErrors = validationErrors && validationErrors.length > 0

  return (
    <AlertDialog open={open} onOpenChange={(v) => !applying && onOpenChange(v)}>
      <AlertDialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            {t('applyDialog.title')}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            {t('applyDialog.description')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Warning banner */}
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{t('applyDialog.engineSuspendWarning')}</span>
        </div>

        {/* Validation errors (if any) */}
        {hasValidationErrors && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive space-y-1">
            <div className="font-semibold">{t('applyDialog.validationErrors')}</div>
            {validationErrors!.map((err, i) => (
              <div key={i} className="font-mono">
                • {err}
              </div>
            ))}
          </div>
        )}

        {/* Change summary */}
        <div className="flex flex-wrap gap-2">
          <ChangeBadge label={t('applyDialog.drivers')} counts={summary.drivers} />
          <ChangeBadge label={t('applyDialog.transports')} counts={summary.transports} />
          <ChangeBadge label={t('applyDialog.rules')} counts={summary.rules} />
          {summary.global && (
            <Badge variant="outline" className="text-[10px] gap-1">
              {t('applyDialog.global')} <span className="text-amber-500">●</span>
            </Badge>
          )}
          {summary.node && (
            <Badge variant="outline" className="text-[10px] gap-1">
              {t('applyDialog.node')} <span className="text-amber-500">●</span>
            </Badge>
          )}
          {summary['rule-providers'] && (
            <Badge variant="outline" className="text-[10px] gap-1">
              {t('applyDialog.ruleProviders')} <span className="text-amber-500">●</span>
            </Badge>
          )}
          {summary['rule-groups'] && (
            <Badge variant="outline" className="text-[10px] gap-1">
              {t('applyDialog.ruleGroups')} <span className="text-amber-500">●</span>
            </Badge>
          )}
        </div>

        {/* Restart warning — shown when changes include restart-required sections */}
        {summary.requiresRestart && (
          <div className="rounded-md border border-orange-500/30 bg-orange-500/10 p-2.5 text-xs text-orange-600 dark:text-orange-400 flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{t('applyDialog.restartRequiredWarning')}</span>
          </div>
        )}

        {/* YAML diff viewer */}
        <div className="flex-1 overflow-auto rounded-md border bg-muted/20 min-h-[200px] max-h-[40vh]">
          <pre className="text-[11px] font-mono leading-relaxed p-2">
            {lineDiff.map((line, i) => (
              <div
                key={i}
                className={cn(
                  'px-1',
                  line.type === 'added' &&
                    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                  line.type === 'removed' &&
                    'bg-rose-500/10 text-rose-600 dark:text-rose-400 line-through',
                )}
              >
                <span className="select-none inline-block w-4 text-muted-foreground/50">
                  {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
                </span>
                {line.text || ' '}
              </div>
            ))}
          </pre>
        </div>

        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={applying} className="h-8 text-xs">
            {t('wizard.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault()
              onConfirm()
            }}
            disabled={applying || hasValidationErrors}
            className={cn('h-8 text-xs', hasValidationErrors && 'opacity-50')}
          >
            {applying ? (
              <>
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                {t('applyDialog.applying')}
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1.5" />
                {t('applyDialog.confirmApply')}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// ─── Change badge ────────────────────────────────────────────────────

const ChangeBadge: React.FC<{
  label: string
  counts: { added: number; removed: number; modified: number }
}> = ({ label, counts }) => {
  const total = counts.added + counts.removed + counts.modified
  if (total === 0) return null

  return (
    <Badge variant="outline" className="text-[10px] gap-1.5">
      {label}
      {counts.added > 0 && <span className="text-emerald-500">+{counts.added}</span>}
      {counts.removed > 0 && <span className="text-rose-500">-{counts.removed}</span>}
      {counts.modified > 0 && <span className="text-amber-500">~{counts.modified}</span>}
    </Badge>
  )
}
