# CoreC-Dashboard — Code Slimming Audit

**Scope:** `src/` (React 19 + TS 7 + Vite). Methodology: extracted every export from `lib/hooks/stores/api/components/types`, then grep-verified each against the whole tree (static named, namespace, default, and dynamic `import()`). Every "dead" claim below was confirmed with a direct `grep` for the symbol in import statements across non-test files. Two automated false positives (`ThemeMode`, `RegistryEditField`) were caught and removed via direct verification.

**TL;DR — safe, behavior-preserving slimming opportunities:** ~36 dead exports in domain/lib/components (drop `export` or delete), ~30 dead shadcn API-surface exports, 6 duplication findings, 1 over-designed barrel needing pruning, 2 dead type aliases with stale comments, 2 truly test-only helpers. No dead files, no TODOs, no commented-out code, biome clean.

---

## 1. Dead Exports

### 1a. Domain/lib types & helpers used only internally — drop the `export` keyword (safe: yes)

| File | Symbol | Lines | Evidence |
|---|---|---|---|
| `src/api/activeConnection.ts` | `ActiveConnection` (interface) | 13–19 | grep: only used internally (lines 20, 23, 28); 0 external imports |
| `src/api/client.ts` | `ApiRequestOptions` (interface) | 37 | only used internally (line 61); 0 external imports |
| `src/api/endpoints/index.ts` | `ValidateConfigResponse` (interface) | 49 | only used internally (lines 54, 60, 69); 0 external imports |
| `src/lib/connectionInfo.ts` | `ConnField` (interface) | 14 | only used internally (lines 25, 31, 103, 109); 0 external imports |
| `src/lib/prometheus.ts` | `Histogram` (interface) | ~12 | only used internally (return type of `extractHistograms`); 0 external imports |
| `src/lib/prometheus.ts` | `MetricEntry` (interface) | 1 | only used internally (lines 7, 9, 106); 0 external imports |
| `src/lib/configHelpers.ts` | `deepEqual` (function) | 30–44 | only used internally by `configEqual`; 0 external imports |
| `src/lib/ruleYaml.ts` | `yamlScalar` (const) | 32 | used internally (lines 37–63); 0 external imports |
| `src/stores/slices/configCrudSlice.ts` | `CrudSlice` (type) | 24 | only used internally as return type of `createCrudSlice`; 0 external imports |
| `src/stores/slices/configGetterSlice.ts` | `GetterSlice` (type) | 17 | only used internally as return type of `createGetterSlice`; 0 external imports |
| `src/types/config.ts` | `DataType` (type) | — | 0 external refs (only `DataTypeString`/`DATA_TYPES` are used) |
| `src/types/config.ts` | `TagConfig` (interface) | 81 | 0 external imports (only doc comments mention it; used internally line 104) |

### 1b. Dead type aliases with STALE justifying comments (safe: yes — delete)

| File | Symbol | Line | Evidence |
|---|---|---|---|
| `src/lib/ruleExprValidator.ts` | `ExprValidationResult` | 33 | Comment claims "so existing test imports stay valid" but `grep ExprValidationResult src/**/*.test.*` → **0**. No test imports it. Dead alias. |
| `src/lib/transformExprValidator.ts` | `ArithValidationResult` | 20 | Same stale comment; `grep ArithValidationResult src/**/*.test.*` → **0**. Dead alias. |

### 1c. Dead barrel re-exports in `settingsRegistry.ts` (safe: yes — remove the re-export lines)

| File:Line | Re-export | Evidence |
|---|---|---|
| `src/lib/settingsRegistry.ts:16` | `FieldGroup` (type) | No file imports `FieldGroup` from the barrel or from `settingsRegistryTypes` (only used internally in types file line 50) |
| `src/lib/settingsRegistry.ts:17` | `FieldType` (type) | Same — only used internally in types file line 30; the one external mention (`registryAdapter.ts:46`) is a comment |
| `src/lib/settingsRegistry.ts:21` | `MODBUS_CONNECTION_FIELDS` | Consumed directly from `settingsRegistryTypes` by `settingsRegistryDriver.ts` (line 7), never via the barrel |
| `src/lib/settingsRegistry.ts:21` | `RECONNECT_GROUP` | Same — consumed directly from types by the driver file (line 8) |

### 1d. Dead component prop-types & dead base component (safe: yes — drop `export` / delete)

| File | Symbol | Evidence |
|---|---|---|
| `src/components/monitor/TagRow.tsx` | `TagRowProps` | 0 external imports |
| `src/components/wizard/ConfigApplyConfirmationDialog.tsx` | `ConfigApplyConfirmationDialogProps` | 0 external imports (component is imported by name, props type never imported) |
| `src/components/wizard/ConfigApplyConfirmationDialog.tsx` | `ConfigDiffSummary` | 0 external imports |
| `src/components/wizard/ConfigApplyConfirmationDialog.tsx` | `DiffLine` | 0 imports from this module; the `DiffLine` actually used app-wide comes from `@/lib/yamlDiff` (see §2c) |
| `src/components/wizard/EntitySearchBar.tsx` | `EntitySearchBarProps` | 0 external imports |
| `src/components/wizard/Wizard.tsx` | `Wizard` (base component) | Only `WizardDialog` + `WizardStep` are imported (DriverWizard/RuleWizard/TransportWizard); base `Wizard` never imported |
| `src/components/wizard/Wizard.tsx` | `WizardProps` | 0 external imports |
| `src/components/wizard/Wizard.tsx` | `WizardDialogProps` | 0 external imports |
| `src/features/admin/DriverWizard.tsx` | `DriverWizardProps` | 0 external imports |
| `src/features/admin/RuleWizard.tsx` | `RuleWizardProps` | 0 external imports |
| `src/features/admin/TransportWizard.tsx` | `TransportWizardProps` | 0 external imports |
| `src/features/home/InstanceCard.tsx` | `InstanceCardProps` | 0 external imports |
| `src/features/home/InstanceDialog.tsx` | `InstanceDialogProps` | 0 external imports |
| `src/contexts/ConnectionContext.tsx` | `ConnectionContextValue` | 0 external imports (only `ConnectionProvider`/`useConnection` used) |
| `src/components/admin/DetailPageParts.tsx` | `EditConfigStatus` | 0 external imports |
| `src/components/admin/DetailPageParts.tsx` | `EditField` | 0 external imports (only a comment in `registryAdapter.ts:28` mentions it; see §2e) |
| `src/components/admin/DetailPageParts.tsx` | `EntityEditConfigLabels` | 0 external imports |
| `src/App.tsx` | `App` (named) | `main.tsx` imports the **default** (`import App from '@/App'`); the named `export const App` is never imported as a named export |

### 1e. Dead shadcn/ui API-surface exports (safe: yes, but low value / deviates from shadcn convention)

Standard shadcn template exports that are never imported in this app. Removing is safe but the files are generated primitives; many teams keep the full surface. Listed for completeness.

- `alert-dialog.tsx`: `AlertDialogOverlay`, `AlertDialogPortal`, `AlertDialogTrigger` (3)
- `badge.tsx`: `BadgeProps`, `badgeVariants` (2)
- `button.tsx`: `ButtonProps` (1)
- `dialog.tsx`: `DialogClose`, `DialogOverlay`, `DialogPortal`, `DialogTrigger` (4)
- `dropdown-menu.tsx`: `DropdownMenuCheckboxItem`, `DropdownMenuGroup`, `DropdownMenuPortal`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`, `DropdownMenuShortcut`, `DropdownMenuSub`, `DropdownMenuSubContent`, `DropdownMenuSubTrigger` (9)
- `form.tsx`: `FormDescription`, `useFormField` (2)
- `input.tsx`: `InputProps` (1)
- `scroll-area.tsx`: `ScrollBar` (1)
- `select.tsx`: `SelectScrollDownButton`, `SelectScrollUpButton` (2)
- `sheet.tsx`: `SheetClose`, `SheetOverlay`, `SheetPortal`, `SheetTrigger` (4)
- `textarea.tsx`: `TextareaProps` (1)

**Total shadcn dead exports: 30.**

---

## 2. Duplication

### 2a. Duplicated `commit` helper in store vs slice — duplication (safe: needs-care)

- `src/stores/configStore.ts:111-112` — local `commit`
- `src/stores/slices/configCrudSlice.ts:39-45` — module-level `commit`

Both bodies are identical: `set({ workingConfig: next, dirty: !configEqual(next, get().savedConfig), error: null })`. Arises because the slice can't see the store's local `commit`. Consolidate by passing `commit` into `createCrudSlice`, or extract one shared `commit`. Behavior identical today.

### 2b. Duplicated value-to-string helpers in the two detail pages — duplication (safe: needs-care)

- `src/features/admin/DriverDetailPage.tsx:52-55` — `driverConfigValueToString(src)`
- `src/features/admin/TransportDetailPage.tsx:132-139` — `configValueToString(f, src)`

Core `if (src == null) return ''; if (typeof src === 'object') return JSON.stringify(src); return String(src)` is repeated; the transport version adds a `headers` special-case. Could become one shared helper in `lib/` (e.g. `registryAdapter.ts`) with an optional headers formatter.

### 2c. Duplicated `DiffLine` type + thin adapter — duplication/redundancy (safe: yes)

- `src/lib/yamlDiff.ts:8-13` — `DiffLine { type: 'equal'|'added'|'removed'; text; oldLineNo; newLineNo }` + `computeLcsDiff`
- `src/components/wizard/ConfigApplyConfirmationDialog.tsx:196-206` — a SECOND `DiffLine { type: 'same'|'added'|'removed'; text }` + `computeLineDiff` which just maps `computeLcsDiff` output (`'equal'`→`'same'`, drops line numbers)

The dialog's `DiffLine` is a stripped duplicate and `computeLineDiff` is a 4-line pass-through wrapper. The dialog could consume `computeLcsDiff` directly (rendering `'equal'` as "same"), or `yamlDiff` could expose the stripped variant. The dialog's `DiffLine`/`computeLineDiff` exports are also dead/test-only (§1d, §3).

### 2d. `stableStringify` vs `deepEqual` — overlapping abstraction (safe: needs-care)

- `src/components/wizard/ConfigApplyConfirmationDialog.tsx:50-64` — local `stableStringify` (order-insensitive canonical JSON) used as `stableStringify(a) !== stableStringify(b)`
- `src/lib/configHelpers.ts:30-44` — `deepEqual` (order-insensitive structural equality, allocation-free)

`stableStringify(a) !== stableStringify(b)` is semantically equivalent to `!deepEqual(a,b)` for JSON-serializable values. The dialog could reuse `deepEqual` for its modified-entity counting. `stableStringify` is local (not exported) so this is a consolidation, not a dead-export, finding.

### 2e. `EditField` vs `RegistryEditField` — overlapping type (safe: yes)

- `src/components/admin/DetailPageParts.tsx:116-122` — `EditField { key, labelKey, kind, options?, placeholder? }` (dead export, §1d)
- `src/lib/registryAdapter.ts:18-31` — `RegistryEditField` = same fields + `group` + `boolean?`

`EditField` is a subset of `RegistryEditField` and is dead. `EntityEditConfigCard` types its `fields` prop as `readonly EditField[]` while callers pass `RegistryEditField[]` (structurally compatible). `EditField` could be replaced by `RegistryEditField` (or un-exported) to collapse to one shape.

### 2f. Duplicated CSS box-shadow value — redundancy (safe: yes)

- `src/index.css:362` (`.glow-primary`) and `src/index.css:372` (`.btn-lime`) both declare `box-shadow: 0 7px 16px hsl(var(--primary) / 0.35)`. Extract to a shared custom property or utility.

---

## 3. Test-only code in prod files

### 3a. Exports used internally + tests only — `export` keyword is test-only (safe: yes to un-export; function stays)

| File | Symbol | Internal use? |
|---|---|---|
| `src/lib/configSchema.ts` | `coreCConfigSchema` | yes (line 696, inside `validateFullConfig`) |
| `src/lib/configSchema.ts` | `isValidGoDuration` | yes (line 66) |
| `src/lib/configSchema.ts` | `validateConfig` | yes (line 706, called by `validateFullConfig`) |
| `src/lib/constants.ts` | `ConnState` | yes (lines 33–48) |
| `src/lib/constants.ts` | `Quality` | yes (lines 13–18) |
| `src/lib/ruleExprValidator.ts` | `VALID_FIELDS` | yes (lines 105, 107) |
| `src/lib/ruleMatchEvaluator.ts` | `evaluateClause` | yes (line 112) |
| `src/lib/ruleMatchEvaluator.ts` | `getFieldValue` | yes (lines 59, 69, 101) |
| `src/lib/settingsRegistry.ts` | `DRIVER_SETTINGS_REGISTRY` (barrel re-export, line 9) | used internally by barrel (line 23→32); re-export itself is test-only |
| `src/lib/settingsRegistry.ts` | `TRANSPORT_SETTINGS_REGISTRY` (barrel re-export, line 11) | used internally by barrel (line 24→37); re-export itself is test-only |
| `src/api/proxyMode.ts` | `getProxyMode` | yes (line 72, inside `detectProxyMode`) |
| `src/components/wizard/ConfigApplyConfirmationDialog.tsx` | `computeConfigDiff` | yes (lines 248, 250) |
| `src/components/wizard/ConfigApplyConfirmationDialog.tsx` | `computeLineDiff` | yes (line 236) |

### 3b. Truly test-only — no internal usage (safe: yes to move to a test util, or keep as intentional test seam)

| File | Symbol | Evidence |
|---|---|---|
| `src/api/proxyMode.ts` | `resetProxyMode` | 0 internal calls; only used in 3 test files to reset module state |
| `src/api/proxyMode.ts` | `setProxyMode` | 0 internal calls; only used in 3 test files to force proxy mode |

These are a common, legitimate pattern (exported state-setters for testing module-global state). Low priority; flagging per the audit brief.

---

## 4. Over-engineered abstractions

### 4a. `settingsRegistry*` 4-file split — mostly justified, barrel needs pruning (safe: yes to prune)

Files: `settingsRegistryTypes.ts`, `settingsRegistryDriver.ts` (~360 lines), `settingsRegistryTransport.ts` (~335 lines), `settingsRegistry.ts` (58-line barrel + 3 helpers).

**Verdict:** The driver/transport registries are genuinely large; splitting them out is reasonable (was an 878-line file, TD-ARCH-013). The barrel provides a real public facade consumed by 6 modules. **Not over-engineered overall.** However the barrel has **6 dead/test-only re-exports** (§1c + §3a: `FieldGroup`, `FieldType`, `MODBUS_CONNECTION_FIELDS`, `RECONNECT_GROUP`, `DRIVER_SETTINGS_REGISTRY`, `TRANSPORT_SETTINGS_REGISTRY`) that should be pruned. After pruning, `FieldGroup`/`FieldType` in the types file could also be un-exported (only used internally).

### 4b. `computeLineDiff` thin wrapper — minor over-design (safe: yes)

`ConfigApplyConfirmationDialog.tsx:201-206` — wraps `computeLcsDiff` solely to rename `'equal'`→`'same'` and drop line numbers. See §2c.

### 4c. `formatters.ts` single-function module — minor (safe: yes, low value)

`src/lib/formatters.ts` contains only `formatRelativeTime`. Could merge into `utils.ts`, but it carries an `i18next` `TFunction` dependency distinct from `utils.ts`'s pure helpers. Low value; leaving as-is is defensible.

---

## 5. Redundant wrappers / pass-through components

**None found.** The wizard banner family (`ValidationBanner`, `WizardContextValidationBanner`, `ExprValidationMessages`, `UnsavedChangesBanner`, `DiscardChangesDialog`) are all legitimate shared extractions — each comment documents the N duplicated inline blocks they replaced, and each has ≥1 real consumer. `DiscardChangesDialog` has a single consumer (`UnsavedChangesBanner`) but is a real shared AlertDialog, not a pass-through.

---

## 6. Unused imports / unused vars / commented-out code / TODOs

- **Biome:** `npx biome check src` → clean (173 files, 0 issues). `tsconfig` has `noUnusedLocals` + `noUnusedParameters`.
- **TODO/FIXME/HACK/XXX/@deprecated:** `grep` → **0** across non-test source.
- **Commented-out code** (`// const|let|function|return|if|for|import|export|...`): **0**.
- **Dead branches** (`if (false)`, `&& false`, etc.): **0**.
- **`debugger`:** **0**.
- **`console.*`:** 4 `console.error` calls, all legitimate error logging (`ErrorBoundary`, instance-store parse failure, pprof download failure). Not debug noise.

---

## 7. CSS audit (`src/index.css`, 508 lines)

- **Dead custom classes:** none. All 12 custom classes (`tnum`, `glow-running`, `glow-error`, `glow-primary`, `btn-lime`, `page-enter`, `card-enter`, `card-stagger`, `card-hover`, `sidebar-transition`, `nav-indicator`, `btn-ripple`) are referenced in `className` strings.
- **Dead theme variants:** none. All 4 extra themes (`light-sepia`, `light-nord`, `dark-midnight`, `dark-forest`) are registered in `themeStore.THEME_VARIANTS` and selected via `data-theme`.
- **Redundancy:** one duplicated box-shadow value (§2f). Two separate `* { … }` rule blocks (border-color at ~289, scrollbar at ~340) could be merged — stylistic only.

---

## 8. Dead files

**None.** Every `.ts/.tsx` file has at least one live export consumed by a non-test file (feature pages are consumed via dynamic `import()` in `App.tsx`; `api/endpoints` consumed via `import * as api` in `api/hooks`). No file is fully removable.

---

## Summary table

| Category | Count | Safe-to-remove |
|---|---|---|
| Dead exports — domain/lib (drop `export`) | 12 | yes |
| Dead type aliases (stale comment) | 2 | yes |
| Dead barrel re-exports (`settingsRegistry.ts`) | 4 | yes |
| Dead component prop-types / base component | 18 | yes |
| Dead shadcn API-surface exports | 30 | yes (low value) |
| Test-only exports (un-export) | 13 | yes |
| Truly test-only helpers (move to test util) | 2 | yes |
| Duplication findings | 6 | yes/needs-care |
| Over-design (barrel prune + thin wrapper) | 2 | yes |
| Dead files | 0 | — |
| TODOs / commented code / unused imports | 0 | — |

**Highest-value, lowest-risk actions:** (1) delete the 2 stale type aliases, (2) prune the 4 dead barrel re-exports in `settingsRegistry.ts`, (3) drop `export` on the 12 internally-only domain/lib symbols, (4) collapse the duplicated `DiffLine`/`computeLineDiff` onto `yamlDiff`, (5) consolidate the duplicated `commit` and value-to-string helpers.
