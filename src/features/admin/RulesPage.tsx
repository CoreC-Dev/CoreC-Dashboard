import { RefreshCw } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { useRules, useToggleRule } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { formatNumber } from '@/lib/utils'

export const RulesPage: React.FC = () => {
  const { t } = useTranslation()
  const { data, refetch, isFetching } = useRules()
  const toggleMutation = useToggleRule()

  const rules = data?.rules || []

  const handleToggle = async (index: number, currentDisabled: boolean) => {
    await toggleMutation.mutateAsync({ index, disabled: !currentDisabled })
  }

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'alert':
        return (
          <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">
            ALERT
          </Badge>
        )
      case 'drop':
        return (
          <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">
            DROP
          </Badge>
        )
      case 'transform':
        return (
          <Badge
            variant="outline"
            className="border-purple-500/30 bg-purple-500/10 text-purple-400"
          >
            TRANSFORM
          </Badge>
        )
      case 'mirror':
        return (
          <Badge variant="outline" className="border-cyan-500/30 bg-cyan-500/10 text-cyan-400">
            MIRROR
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400">
            FORWARD
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Rule Pipeline & Routing</h1>
          <p className="text-xs text-muted-foreground">
            In-flight data routing, filtering, alert triggers, and arithmetic transformation
            (First-match-wins)
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="h-8 text-xs shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
          <span>{t('common.refresh')}</span>
        </Button>
      </div>

      <Card className="border-border/80 bg-card/60 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/50 border-b border-border/80 uppercase font-semibold text-[10px] text-muted-foreground tracking-wider">
              <tr>
                <th className="px-4 py-3 w-16">Prio</th>
                <th className="px-4 py-3">Rule Name</th>
                <th className="px-4 py-3">Match Condition (DSL)</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Target Sink</th>
                <th className="px-4 py-3">Hit Stats</th>
                <th className="px-4 py-3 text-right">Enabled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-muted-foreground">
                    No routing rules configured. Data flows through default route.
                  </td>
                </tr>
              ) : (
                rules.map((rule) => {
                  return (
                    <tr
                      key={rule.index}
                      className={`hover:bg-muted/30 transition-colors ${
                        rule.disabled ? 'opacity-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-muted-foreground">
                        #{rule.priority}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{rule.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {rule.type}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <code className="px-2 py-1 rounded bg-muted/60 text-[11px] font-mono text-primary border border-border/50">
                          {rule.match}
                        </code>
                      </td>
                      <td className="px-4 py-3">{getActionBadge(rule.action)}</td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">
                        {rule.target || rule.targets?.join(', ') || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center space-x-2 text-[11px]">
                          <span className="text-emerald-400 font-mono font-bold">
                            {formatNumber(rule.hit_count)} hits
                          </span>
                          <span className="text-muted-foreground">/</span>
                          <span className="text-muted-foreground font-mono">
                            {formatNumber(rule.miss_count)}
                          </span>
                        </div>
                        {rule.hit_at && (
                          <div className="text-[10px] text-muted-foreground">
                            Last: {new Date(rule.hit_at).toLocaleTimeString()}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Switch
                          checked={!rule.disabled}
                          onCheckedChange={() => handleToggle(rule.index, rule.disabled)}
                          disabled={toggleMutation.isPending}
                        />
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
