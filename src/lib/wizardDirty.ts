/**
 * Wizard dirty-draft predicates (C-A2).
 *
 * The generic WizardDialog guards every dismiss path (Cancel button, Esc,
 * X, overlay click) behind the shared DiscardChangesDialog when — and only
 * when — the current draft contains unsaved input. The predicates below
 * decide that for each admin wizard:
 *
 *  - EDIT mode: the draft is dirty when it diverges from the pre-filled
 *    entity it was opened with (opening a wizard and cancelling without
 *    touching anything must stay friction-free).
 *  - CREATE mode: the draft is dirty once the user has made any meaningful
 *    choice — advanced past the first step, or entered/selected anything
 *    on it.
 *
 * Pure functions so they are unit-testable without rendering the wizards;
 * the wizards simply forward their current state. Layering: types ← lib.
 */
import type { DriverConfig, RuleAction, TransportConfig } from '@/types/config'

/** Order-insensitive deep equality via canonical JSON — fine for the small
 *  plain objects a wizard draft holds (settings maps, tag arrays). */
const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

// ─── DriverWizard ────────────────────────────────────────────────────

export interface DriverDraftInput {
  /** Zero-based wizard step the user is on. */
  currentStep: number
  /** Whether the wizard was opened on an existing driver (edit mode). */
  isEdit: boolean
  /** The driver the wizard was opened with (edit mode), else undefined. */
  existing?: DriverConfig
  selectedType: DriverTypeLike
  driverName: string
  settings: Record<string, unknown>
  tags: DriverConfig['tags']
  tagsFile: string
  tagsInterval: string
}
type DriverTypeLike = string | null

export const isDriverDraftDirty = (d: DriverDraftInput): boolean => {
  if (d.isEdit) {
    const init = d.existing
    if (!init) return false
    return (
      d.driverName !== (init.name ?? '') ||
      !sameJson(d.settings, init.settings ?? {}) ||
      !sameJson(d.tags, init.tags ?? []) ||
      d.tagsFile !== (init['tags-file'] ?? '') ||
      d.tagsInterval !== (init['tags-interval'] ?? '')
    )
  }
  // Create mode: choosing a type (step 0) or advancing past it is input.
  return d.currentStep > 0 || d.selectedType !== null
}

// ─── TransportWizard ─────────────────────────────────────────────────

export interface TransportDraftInput {
  currentStep: number
  isEdit: boolean
  existing?: TransportConfig
  selectedType: string | null
  transportName: string
  settings: Record<string, unknown>
  /** Top-level fields (batch-size, flush-interval, retry-count, buffer-size). */
  toplevel: Record<string, unknown>
  /** The same keys the wizard's toplevel state tracks, taken from the
   *  existing entity for the edit-mode comparison. */
  existingToplevel?: Record<string, unknown>
}

export const isTransportDraftDirty = (t: TransportDraftInput): boolean => {
  if (t.isEdit) {
    const init = t.existing
    if (!init) return false
    return (
      t.transportName !== (init.name ?? '') ||
      !sameJson(t.settings, init.settings ?? {}) ||
      !sameJson(t.toplevel, t.existingToplevel ?? {})
    )
  }
  return t.currentStep > 0 || t.selectedType !== null
}

// ─── RuleWizard ──────────────────────────────────────────────────────

export interface RuleDraftInput {
  currentStep: number
  isEdit: boolean
  existing?: {
    name?: string
    match?: string
    priority?: number
    action?: RuleAction | string
    target?: string
    targets?: string[]
    transform?: { expression?: string; 'tag-rename'?: string } | undefined
    continue?: boolean
  }
  ruleName: string
  match: string
  priority: number
  action: RuleAction | string
  target: string
  targets: string[]
  transformExpr: string
  tagRename: string
  continueFlag: boolean
}

/** Defaults the create-mode RuleWizard starts from (see RuleWizard's
 *  useState initializers) — used as the "untouched" baseline. */
export const RULE_DRAFT_DEFAULTS = {
  match: 'ALL',
  priority: 100,
  action: 'forward',
} as const

export const isRuleDraftDirty = (r: RuleDraftInput): boolean => {
  if (r.isEdit) {
    const init = r.existing
    if (!init) return false
    return (
      r.ruleName !== (init.name ?? '') ||
      r.match !== (init.match ?? '') ||
      r.priority !== (init.priority ?? 100) ||
      r.action !== (init.action ?? 'forward') ||
      r.target !== (init.target ?? '') ||
      !sameJson(r.targets, init.targets ?? []) ||
      r.transformExpr !== (init.transform?.expression ?? '') ||
      r.tagRename !== (init.transform?.['tag-rename'] ?? '') ||
      r.continueFlag !== (init.continue ?? false)
    )
  }
  return (
    r.currentStep > 0 ||
    r.ruleName.trim() !== '' ||
    r.match !== RULE_DRAFT_DEFAULTS.match ||
    r.priority !== RULE_DRAFT_DEFAULTS.priority ||
    r.action !== RULE_DRAFT_DEFAULTS.action
  )
}
