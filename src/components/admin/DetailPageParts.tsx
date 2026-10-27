import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Eye,
  EyeOff,
  Flame,
  Loader2,
  Sliders,
} from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { OperationResult } from '@/components/admin/OperationResult'
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
 *  the summary is absent. Shared by DriversPage / TransportsPage. */
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
  kind: 'text' | 'number' | 'select' | 'password'
  options?: readonly string[]
  placeholder?: string
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
  /**
   * Placeholder shown for a password field that has a STORED value while
   * the form value is masked to '' — e.g. "Saved — leave blank
   * to keep". Shown instead of the field's generic placeholder.
   */
  savedSecretPlaceholder: string
  /** Aria/title label for the password reveal toggle (masked → shown). */
  showSecretAriaLabel: string
  /** Aria/title label for the password conceal toggle (shown → masked). */
  hideSecretAriaLabel: string
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
}) => {
  // Per-field reveal state for password inputs. Off by default —
  // a stored secret is never echoed, and a freshly typed one is masked
  // until the operator explicitly reveals it.
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(() => new Set())
  const toggleReveal = (key: string) =>
    setRevealed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <Card className="bg-card">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
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
          <ChevronDown
            className={`h-4 w-4 transition-transform ${edit.open ? 'rotate-180' : ''}`}
          />
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
                    ) : f.kind === 'password' ? (
                      <div className="relative">
                        <Input
                          id={`${fieldIdPrefix}${f.key}`}
                          type={revealed.has(f.key) ? 'text' : 'password'}
                          value={edit.values[f.key] ?? ''}
                          placeholder={
                            edit.secretSavedKeys.has(f.key)
                              ? labels.savedSecretPlaceholder
                              : f.placeholder
                          }
                          onChange={(e) => edit.setField(f.key, e.target.value)}
                          autoComplete="new-password"
                          className="h-9 text-xs pr-9"
                        />
                        <button
                          type="button"
                          onClick={() => toggleReveal(f.key)}
                          aria-label={
                            revealed.has(f.key)
                              ? labels.hideSecretAriaLabel
                              : labels.showSecretAriaLabel
                          }
                          title={
                            revealed.has(f.key)
                              ? labels.hideSecretAriaLabel
                              : labels.showSecretAriaLabel
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          {revealed.has(f.key) ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
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

              {/* The shared transient feedback strip — context label
                   (the card/section title) + 5s auto-fade + manual close,
                   replacing the page-local never-clearing status line. */}
              <OperationResult status={edit.statusMsg} context={labels.title} />

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
}
