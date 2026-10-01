import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Flame,
  Loader2,
  Sliders,
} from 'lucide-react'
import type React from 'react'
import { Link } from 'react-router-dom'
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
import { isZeroTime } from '@/lib/utils'

export const formatTimestamp = (ts: string, fallback = '—'): string => {
  if (isZeroTime(ts)) return fallback
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString()
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
        <div className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
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
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
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

interface EntityEditConfigCardProps {
  title: string
  description: string
  toggleAriaLabel: string
  open: boolean
  onToggleOpen: () => void
  fields: readonly EditField[]
  fieldIdPrefix: string
  labelFor: (field: EditField) => string
  values: Record<string, string>
  onFieldChange: (key: string, value: string) => void
  unsupportedMessage: string
  yamlPreviewLabel: string
  yamlPreview: string
  statusMsg: EditConfigStatus | null
  reloadingLabel: string
  reloadButtonLabel: string
  isReloading: boolean
  onReload: () => void
}

export const EntityEditConfigCard: React.FC<EntityEditConfigCardProps> = ({
  title,
  description,
  toggleAriaLabel,
  open,
  onToggleOpen,
  fields,
  fieldIdPrefix,
  labelFor,
  values,
  onFieldChange,
  unsupportedMessage,
  yamlPreviewLabel,
  yamlPreview,
  statusMsg,
  reloadingLabel,
  reloadButtonLabel,
  isReloading,
  onReload,
}) => (
  <Card className="bg-card">
    <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
      <div className="flex items-center gap-2">
        <Sliders className="h-4 w-4 text-primary" />
        <div>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2 text-xs text-muted-foreground"
        onClick={onToggleOpen}
        aria-label={toggleAriaLabel}
        aria-expanded={open}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </Button>
    </CardHeader>
    {open && (
      <CardContent className="space-y-4">
        {fields.length === 0 ? (
          <div className="rounded-lg border border-status-warning/20 bg-status-warning/10 p-3 text-xs text-status-warning">
            {unsupportedMessage}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 md:grid-cols-3">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <label
                    htmlFor={`${fieldIdPrefix}${f.key}`}
                    className="text-[11px] font-medium text-muted-foreground"
                  >
                    {labelFor(f)}
                  </label>
                  {f.kind === 'select' && f.options ? (
                    <Select
                      value={values[f.key] ?? ''}
                      onValueChange={(v) => onFieldChange(f.key, v)}
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
                      value={values[f.key] ?? ''}
                      placeholder={f.placeholder}
                      onChange={(e) => onFieldChange(f.key, e.target.value)}
                      className="h-9 text-xs"
                    />
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-medium text-muted-foreground">
                {yamlPreviewLabel}
              </div>
              <pre className="max-h-56 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-foreground">
                {yamlPreview}
              </pre>
            </div>

            {statusMsg && (
              <div
                className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
                  statusMsg.type === 'success'
                    ? 'border-status-running/20 bg-status-running/10 text-status-running'
                    : 'border-status-error/20 bg-status-error/10 text-status-error'
                }`}
              >
                {statusMsg.type === 'success' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 shrink-0" />
                )}
                <span className="break-all">{statusMsg.text}</span>
              </div>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={onReload} disabled={isReloading} className="h-8 text-xs">
                {isReloading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Flame className="mr-1.5 h-3.5 w-3.5 text-status-warning" />
                )}
                <span>{isReloading ? reloadingLabel : reloadButtonLabel}</span>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    )}
  </Card>
)
