/**
 * RuntimeRulesTable — the live-engine rules table of RulesPage. Kept in
 * its own module so RulesPage stays under the 500-line custom-lint gate.
 * Pure presentation: filtering/sorting live in the page, this renders the
 * sorted/filtered slice it is handed.
 */
import { ArrowDown, ArrowUp, Pencil, Play } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { ActionBadge, ContinueBadge, getTargetDisplay } from '@/components/admin/RuleParts'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { formatRelativeTime } from '@/lib/formatters'
import { formatNumber, isZeroTime } from '@/lib/utils'
import type { RuleStat } from '@/types/models'

export interface RuntimeRulesTableProps {
  /** Filtered + sorted slice to render (search & priority sort). */
  rules: RuleStat[]
  /** Current sort direction — the priority header is the toggle. */
  sortDesc: boolean
  onToggleSort: () => void
  /** Rule names with a toggle mutation in flight (row switch disabled). */
  togglingNames: ReadonlySet<string>
  onToggle: (name: string, disabled: boolean) => void
  onTest: (rule: RuleStat) => void
  onEdit: (rule: RuleStat) => void
}

export const RuntimeRulesTable: React.FC<RuntimeRulesTableProps> = ({
  rules,
  sortDesc,
  onToggleSort,
  togglingNames,
  onToggle,
  onTest,
  onEdit,
}) => {
  const { t } = useTranslation()
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left">
        <thead className="bg-muted/50 border-b border-border uppercase font-semibold text-xs text-muted-foreground tracking-wider">
          <tr>
            <th className="px-4 py-3 w-16">
              {/* Priority header toggles the sort direction. */}
              <button
                type="button"
                onClick={onToggleSort}
                className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-foreground"
                aria-label={t('rules.sortByPriority')}
              >
                {t('rules.colPriority')}
                {sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />}
              </button>
            </th>
            <th className="px-4 py-3">{t('rules.colName')}</th>
            <th className="px-4 py-3">{t('rules.colMatch')}</th>
            <th className="px-4 py-3">{t('rules.colAction')}</th>
            <th className="px-4 py-3">{t('rules.colTarget')}</th>
            <th className="px-4 py-3">{t('rules.colHitStats')}</th>
            <th className="px-4 py-3 text-right">{t('rules.colEnabled')}</th>
            <th className="px-4 py-3 text-right">{t('common.actions')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rules.map((rule) => {
            return (
              <tr
                key={rule.index}
                className={`hover:bg-muted/30 transition-colors ${rule.disabled ? 'opacity-50' : ''}`}
              >
                <td className="px-4 py-3 font-mono font-bold text-muted-foreground">
                  #{rule.priority}
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold text-foreground">{rule.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{rule.type}</div>
                </td>
                <td className="px-4 py-3">
                  <code className="px-2 py-1 rounded bg-muted/60 text-xs font-mono text-primary border border-border">
                    {rule.match}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <ActionBadge action={rule.action} />
                    {rule.continue && <ContinueBadge />}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground">
                  {getTargetDisplay(rule)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center space-x-2 text-xs">
                    <span className="text-status-running font-mono font-bold">
                      {formatNumber(rule.hit_count)} {t('common.hits')}
                    </span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground font-mono">
                      {formatNumber(rule.miss_count)}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t('rules.last')}:{' '}
                    {isZeroTime(rule.hit_at)
                      ? t('common.never')
                      : new Date(rule.hit_at).toLocaleTimeString()}
                  </div>
                  {rule.eval_errors > 0 && (
                    <div
                      className="text-xs text-status-error mt-0.5"
                      title={t('rules.evalErrorsTitle', { count: rule.eval_errors })}
                    >
                      {t('rules.evalErrors', { count: rule.eval_errors })}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {t('rules.lastMiss')}:{' '}
                    {isZeroTime(rule.miss_at)
                      ? t('common.never')
                      : formatRelativeTime(rule.miss_at, t)}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <Switch
                    checked={!rule.disabled}
                    onCheckedChange={() => onToggle(rule.name, rule.disabled)}
                    disabled={togglingNames.has(rule.name)}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onTest(rule)}
                      className="h-9 text-xs"
                    >
                      <Play className="w-3 h-3 mr-1" />
                      {t('rules.test')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(rule)}
                      className="h-9 text-xs"
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      {t('common.edit')}
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
