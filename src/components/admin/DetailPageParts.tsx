import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Flame,
  Loader2,
  Sliders,
} from 'lucide-react'
import type React from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { TopicTemplatePreview } from '@/components/wizard/TopicTemplatePreview'
import type { EntityEditConfigState } from '@/hooks/useEntityEditConfig'
import { isZeroTime } from '@/lib/utils'

export const formatTimestamp = (ts: string, fallback = '—'): string => {
  if (isZeroTime(ts)) return fallback
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString()
}

/** Inline connection-summary line for entity list cards. Renders null when
 *  the summary is absent. Extracted from 4× repeated IIFE in DriversPage /
 *  TransportsPage (TD-DUP-006). */
export const ConnectionSummary: React.FC<{ summary: string | null }> = ({ summary }) => {
  if (!summary) return null
  return <div className="text-xs text-muted-foreground/80 font-mono mt-0.5 truncate">{summary}</div>
}

/**
 * Small warning badge marking a config field whose change requires an engine
 * restart. Shared by GlobalConfigEditor and NodeConfigEditor. The caller
 * supplies the already-translated label (the two editors use different i18n
 * keys: `globalConfig.restartRequired` vs `nodeConfig.restartRequired`).
 */
export const RestartBadge: React.FC<{ show?: boolean; label: string }> = ({
  show = true,
  label,
}) => {
  if (!show) return null
  return (
    <Badge
      variant="outline"
      className="text-xs px-1 py-0 border-status-warning/40 bg-status-warning/10 text-status-warning dark:text-status-warning"
    >
      <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
      {label}
    </Badge>
  )
}

export const BackLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Button
    asChild
    variant="ghost"
    size="sm"
    className="h-8 -ml-2 text-xs text-muted-foreground hover:text-foreground"
  >
    <Link to={to}>
      <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
      {children}
    </Link>
  </Button>
)

export const StatCard: React.FC<{
  label: string
  value: string
  icon: React.ReactNode
  accent: string
}> = ({ label, value, icon, accent }) => (
  <Card className="bg-card">
    <CardContent className="flex items-center gap-3 p-4">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="font-mono text-lg font-bold leading-tight">{value}</div>
      </div>
    </CardContent>
  </Card>
)

export const Param: React.FC<{ label: string; children: React.ReactNode }> = ({
  label,
  children,
}) => (
  <div className="min-w-0 space-y-1">
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="break-all text-xs font-medium text-foreground">{children}</div>
  </div>
)

// --- Shared collapsible "edit configuration" card shell ---
// Both DriverDetailPage and TransportDetailPage render a structurally identical
// collapsible form: a toggle header (Sliders + chevron + title), an Input/Select
// field grid, a YAML preview <pre>, a status-message block and a Reload button.
// Only the i18n strings, the field-id prefix and the field/value/yaml payloads
// differ, so those are passed in as props. The field-rendering, status block and
// reload button JSX live here once and are byte-identical to the originals.

export interface EditField {
  key: string
  labelKey: string
  kind: 'text' | 'number' | 'select'
  options?: readonly string[]
  placeholder?: string
}

export interface EditConfigStatus {
  type: 'success' | 'error'
  text: string
}

/** Display labels for EntityEditConfigCard (i18n strings). */
export interface EntityEditConfigLabels {
  title: string
  description: string
  toggleAriaLabel: string
  unsupportedMessage: string
  yamlPreviewLabel: string
  reloadingLabel: string
  reloadButtonLabel: string
}

interface EntityEditConfigCardProps {
  /** State from useEntityEditConfig hook. */
  edit: EntityEditConfigState
  /** Editable fields for this entity type. */
  fields: readonly EditField[]
  fieldIdPrefix: string
  labelFor: (field: EditField) => string
  /** Display labels (i18n). */
  labels: EntityEditConfigLabels
}

export const EntityEditConfigCard: React.FC<EntityEditConfigCardProps> = ({
  edit,
  fields,
  fieldIdPrefix,
  labelFor,
  labels,
}) => (
  <Card className="bg-card">
    <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
      <div className="flex items-center gap-2">
        <Sliders className="h-4 w-4 text-primary" />
        <div>
          <CardTitle className="text-sm font-semibold">{labels.title}</CardTitle>
          <CardDescription>{labels.description}</CardDescription>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs text-muted-foreground"
        onClick={() => edit.setOpen((o) => !o)}
        aria-label={labels.toggleAriaLabel}
        aria-expanded={edit.open}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${edit.open ? 'rotate-180' : ''}`} />
      </Button>
    </CardHeader>
    {edit.open && (
      <CardContent className="space-y-4">
        {fields.length === 0 ? (
          <div className="rounded-lg border border-status-warning/20 bg-status-warning/10 p-3 text-xs text-status-warning">
            {labels.unsupportedMessage}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-3">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <label
                    htmlFor={`${fieldIdPrefix}${f.key}`}
                    className="text-xs font-medium text-muted-foreground"
                  >
                    {labelFor(f)}
                  </label>
                  {f.kind === 'select' && f.options ? (
                    <Select
                      value={edit.values[f.key] ?? ''}
                      onValueChange={(v) => edit.setField(f.key, v)}
                    >
                      <SelectTrigger id={`${fieldIdPrefix}${f.key}`} className="h-9 text-xs">
                        <SelectValue placeholder="—" />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options.map((opt) => (
                          <SelectItem key={opt} value={opt} className="text-xs">
                            {opt}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={`${fieldIdPrefix}${f.key}`}
                      type={f.kind === 'number' ? 'number' : 'text'}
                      value={edit.values[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => edit.setField(f.key, e.target.value)}
                      className="h-9 text-xs"
                    />
                  )}
                  {f.key === 'topic-template' && (
                    <TopicTemplatePreview
                      value={edit.values[f.key] ?? ''}
                      onChange={(v) => edit.setField(f.key, v)}
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                {labels.yamlPreviewLabel}
              </div>
              <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground">
                {edit.previewYaml}
              </pre>
            </div>

            {edit.statusMsg && (
              <div
                className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                  edit.statusMsg.type === 'success'
                    ? 'border-status-running/20 bg-status-running/10 text-status-running'
                    : 'border-status-error/20 bg-status-error/10 text-status-error'
                }`}
              >
                {edit.statusMsg.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span className="break-all">{edit.statusMsg.text}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={edit.handleReload}
                disabled={edit.isReloading}
                className="h-8 text-xs"
              >
                {edit.isReloading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Flame className="mr-1.5 h-3.5 w-3.5 text-status-warning" />
                )}
                <span>{edit.isReloading ? labels.reloadingLabel : labels.reloadButtonLabel}</span>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    )}
  </Card>
)
