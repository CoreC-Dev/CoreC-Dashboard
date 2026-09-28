/**
 * NodeConfigEditor
 *
 * Structured form editor for the `node` section of CoreCConfig.
 * Covers: id, role, subscribe[], topic-prefix.
 *
 * This addresses the user's request: "corec的配置是很复杂且有逻辑在里面的，
 * Dashboard也需要有逻辑" — the node config has conditional logic:
 *
 *   - When `id` is empty → auto-discovery is disabled (backward compat).
 *     The role/subscribe/topic-prefix fields are hidden with an info banner.
 *   - When `id` is set → auto-discovery enabled. Role becomes relevant:
 *       collector  → has drivers, publishes data, no upstream (subscribe hidden)
 *       relay      → receives from upstream, republishes (subscribe shown)
 *       aggregator → receives from multiple upstreams (subscribe shown)
 *       sink       → receives from upstream, does not republish (subscribe shown)
 *   - `subscribe` is only shown for relay/aggregator/sink roles.
 *   - `topic-prefix` defaults to "topo" and controls auto topic format:
 *       {prefix}/{node-id}/data/{driver}/{tag}
 *
 * Integration: edits go through configStore.updateNodeField(), which updates
 * the working config and sets dirty=true.
 *
 * Hot-reload: node config requires engine restart (not hot-updatable).
 */
import { AlertTriangle, Info, Network, Workflow } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { useConfigStore } from '@/stores/configStore'
import type { NodeConfig } from '@/types/config'

// ─── Role metadata ────────────────────────────────────────────────────

interface RoleMeta {
  role: string
  labelKey: string
  descKey: string
  showSubscribe: boolean
}

const ROLE_META: RoleMeta[] = [
  {
    role: 'collector',
    labelKey: 'nodeConfig.roleCollector',
    descKey: 'nodeConfig.roleCollectorDesc',
    showSubscribe: false,
  },
  {
    role: 'relay',
    labelKey: 'nodeConfig.roleRelay',
    descKey: 'nodeConfig.roleRelayDesc',
    showSubscribe: true,
  },
  {
    role: 'aggregator',
    labelKey: 'nodeConfig.roleAggregator',
    descKey: 'nodeConfig.roleAggregatorDesc',
    showSubscribe: true,
  },
  {
    role: 'sink',
    labelKey: 'nodeConfig.roleSink',
    descKey: 'nodeConfig.roleSinkDesc',
    showSubscribe: true,
  },
]

// ─── Restart badge ───────────────────────────────────────────────────

const RestartBadge: React.FC = () => {
  const { t } = useTranslation()
  return (
    <Badge
      variant="outline"
      className="text-[9px] px-1 py-0 border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
    >
      <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
      {t('nodeConfig.restartRequired')}
    </Badge>
  )
}

// ─── Subscribe list editor (multi-value string array) ────────────────

interface SubscribeEditorProps {
  value: string[]
  onChange: (val: string[]) => void
}

const SubscribeEditor: React.FC<SubscribeEditorProps> = ({ value, onChange }) => {
  const { t } = useTranslation()
  const [input, setInput] = useState('')

  const add = () => {
    const trimmed = input.trim()
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed])
      setInput('')
    }
  }

  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={t('nodeConfig.subscribePlaceholder')}
          className="h-8 text-xs font-mono flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={!input.trim()}
          className="h-8 text-xs shrink-0"
        >
          {t('common.add')}
        </Button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((node, idx) => (
            <span
              key={`${node}-${idx}`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-mono"
            >
              {node}
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-muted-foreground hover:text-destructive"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {value.length === 0 && (
        <p className="text-[10px] text-muted-foreground">{t('nodeConfig.subscribeEmpty')}</p>
      )}
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────

export const NodeConfigEditor: React.FC = () => {
  const { t } = useTranslation()
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const updateNodeField = useConfigStore((s) => s.updateNodeField)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const dirty = useConfigStore((s) => s.dirty)

  const [expanded, setExpanded] = useState(true)

  if (!workingConfig) {
    return (
      <Card className="border-border/80 bg-card/60">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Network className="w-4 h-4 text-primary" />
            <span>{t('nodeConfig.title')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetToEmpty()}
            className="h-8 text-xs"
          >
            {t('globalConfig.initConfig')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const node: NodeConfig = workingConfig.node ?? {}
  const hasNodeId = !!node.id?.trim()
  const currentRole = node.role ?? 'collector'
  const roleMeta = ROLE_META.find((m) => m.role === currentRole) ?? ROLE_META[0]!
  const showSubscribe = hasNodeId && roleMeta.showSubscribe

  return (
    <Card className="border-border/80 bg-card/60">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Workflow className="w-4 h-4 text-primary" />
            <span>{t('nodeConfig.title')}</span>
            <RestartBadge />
            {dirty && (
              <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-600">
                {t('globalConfig.unsaved')}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? t('common.collapse') : t('common.expand')}
          </Button>
        </div>
        <CardDescription className="text-xs">{t('nodeConfig.desc')}</CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="p-4 pt-1 space-y-4">
          {/* ─── Node ID (toggle for auto-discovery) ─────────────── */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium">{t('nodeConfig.nodeId')}</Label>
            </div>
            <Input
              value={node.id ?? ''}
              onChange={(e) => updateNodeField('id', e.target.value || undefined)}
              placeholder="e.g. factory-collector-01"
              className="h-8 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground leading-snug">
              {t('nodeConfig.nodeIdHelp')}
            </p>
          </div>

          {/* ─── Auto-discovery disabled banner ─────────────────── */}
          {!hasNodeId && (
            <div className="flex items-start gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-700 dark:text-blue-400">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">{t('nodeConfig.autoDiscoveryDisabled')}</div>
                <p className="text-[11px] mt-0.5">{t('nodeConfig.autoDiscoveryDisabledDesc')}</p>
              </div>
            </div>
          )}

          {/* ─── Role + Subscribe + Topic-prefix (only when id set) ─ */}
          {hasNodeId && (
            <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50">
              {/* Role selector */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">{t('nodeConfig.role')}</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_META.map((meta) => (
                    <label
                      key={meta.role}
                      htmlFor={`role-${meta.role}`}
                      className={cn(
                        'flex flex-col gap-1 rounded-lg border p-2.5 cursor-pointer transition-all',
                        currentRole === meta.role
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border hover:border-primary/40 hover:bg-accent/30',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          id={`role-${meta.role}`}
                          name="node-role"
                          value={meta.role}
                          checked={currentRole === meta.role}
                          onChange={() => updateNodeField('role', meta.role)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-xs font-medium">{t(meta.labelKey)}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground leading-snug ml-5">
                        {t(meta.descKey)}
                      </p>
                    </label>
                  ))}
                </div>
              </div>

              {/* Subscribe (conditional on role) */}
              {showSubscribe && (
                <div className="space-y-1.5 pt-2 border-t border-border/40">
                  <Label className="text-xs font-medium">{t('nodeConfig.subscribe')}</Label>
                  <SubscribeEditor
                    value={node.subscribe ?? []}
                    onChange={(val) =>
                      updateNodeField('subscribe', val.length > 0 ? val : undefined)
                    }
                  />
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    {t('nodeConfig.subscribeHelp')}
                  </p>
                </div>
              )}

              {/* Topic prefix */}
              <div className="space-y-1 pt-2 border-t border-border/40">
                <Label className="text-xs font-medium">{t('nodeConfig.topicPrefix')}</Label>
                <Input
                  value={node['topic-prefix'] ?? ''}
                  onChange={(e) => updateNodeField('topic-prefix', e.target.value || undefined)}
                  placeholder="topo"
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground leading-snug">
                  {t('nodeConfig.topicPrefixHelp')}
                </p>
              </div>
            </div>
          )}

          {/* ─── Topic format preview ───────────────────────────── */}
          {hasNodeId && (
            <div className="rounded-md border border-border/50 bg-muted/20 p-3">
              <div className="text-[10px] text-muted-foreground uppercase font-semibold mb-1">
                {t('nodeConfig.topicPreview')}
              </div>
              <code className="text-[11px] font-mono text-primary break-all">
                {node['topic-prefix'] || 'topo'}/{node.id}/data/&#123;driver&#125;/&#123;tag&#125;
              </code>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
