# CoreC-Dashboard Code-Slimming Audit

**Scope:** full `src/` tree (115 TS/TSX files, ~25.3k LOC). Baseline green: tsc, 324 tests, build.
**Method:** every finding verified with `grep`/`read` against the workspace. No source modified.
**Goal:** delete dead code, kill duplication, simplify over-design — behavior-preserving.

---

## Summary

The codebase is generally well-factored (shared `DetailPageParts`, `EntitySearchBar`,
`RegistryFieldGrid`, `WizardContextValidationBanner`, `ExprValidationMessages`,
`exprShared`, `configYaml` entity-helper factory, `useConnectedQuery` are all good
prior extractions). The remaining slimming surface is concentrated in three areas:

1. **Two large dead layout files** (`Sidebar.tsx` 80 LOC, `TopBar.tsx` 260 LOC) —
   `AppShell.tsx` reimplemented all their functionality inline, leaving them orphaned.
   This alone is **340 LOC** of zero-risk deletion.
2. **Three near-identical admin list pages** (`DriversPage`/`TransportsPage`/`RulesPage`)
   share a ~120-LOC skeleton (header/apply/delete/search/validation wiring) that is
   copy-pasted. Plus the `ConfigApplyConfirmationDialog` `onConfirm` block and the
   `validationErrors` mapping are each duplicated 4–5×.
3. **Two near-identical detail pages** and **two near-identical wizards** share
   edit-section + form-reset scaffolding that was only partially extracted
   (`EntityEditConfigCard` is shared; the surrounding hook logic is not).

Minor wins: a dead `Skeleton` UI primitive, two 6-line layout wrappers, a duplicated
`RestartBadge`, a repeated empty-config card, and a single-use `CountUpNumber`+`useCountUp`
pair. Several `types/config.ts` interfaces carry an unnecessary `export`.

**Conservative net LOC reduction achievable: ~560–640** (≈2.5% of source), almost all
low/med risk, with the 340-LOC dead-file deletion being zero-risk and highest-value.

---

## Dead Code

Every entry below was verified to have **zero** external references via `grep`
(excluding its own definition file and, where noted, test-only seams).

| # | Location | LOC | Category | Verification | Action | Risk | Verify |
|---|----------|-----|----------|--------------|--------|------|--------|
| D1 | `src/components/layout/Sidebar.tsx` | 80 | dead file | 0 imports outside itself (`grep Sidebar` → only self + an unrelated CSS comment) | Delete file | **low** | `tsc` + build (no importer to break) |
| D2 | `src/components/layout/TopBar.tsx` | 260 | dead file | 0 imports outside itself | Delete file | **low** | `tsc` + build |
| D3 | `src/components/ui/skeleton.tsx` | 7 | dead primitive | 0 importers (`grep components/ui/skeleton` → none) | Delete file | **low** | `tsc` + build |
| D4 | `src/components/layout/AdminLayout.tsx` + `MonitorLayout.tsx` | 12 | trivial wrapper | each is `<AppShell/>`; used only as route `element` in `App.tsx:154,192` | Inline `<AppShell/>` in `App.tsx` routes, delete both files + 2 import lines | **low** | routes still render; smoke test |
| D5 | `src/types/config.ts` — `export` on `LogLevel`,`LogFormat`,`RuleGroups`,`TransformConfig`,`BufferConfig`,`EngineConfig`,`APIConfig` | ~7 | unused export | 0 external refs for each (used only internally to compose `GlobalConfig`/`CoreCConfig`/`RuleConfig`) | Drop the `export` keyword (keep the types) | **low** | `tsc` |
| D6 | `src/lib/configSchema.ts:415` `export interface ConfigValidationError` | ~3 | unused export | 0 refs outside the file | Remove export (or delete if unused internally) | **low** | `tsc` |
| D7 | `src/components/ui/form.tsx:8` stale doc comment | 0 | dead comment | claims "Used by the driver/transport/rule wizards" — wizards use plain `useState`, only `InstanceDialog` uses it | Fix comment to name `InstanceDialog` | **low** | none |

**Dead subtotal: ~369 LOC removed (D1–D4) + ~10 token-level cleanups (D5–D7).**

> **Note on test-only exports** (NOT flagged as dead): `coreCConfigSchema`,
> `validateConfig`, `DRIVER_SETTINGS_REGISTRY`, `TRANSPORT_SETTINGS_REGISTRY`,
> `isValidGoDuration` are exported and consumed only by their `.test.ts` siblings.
> They are intentional test seams; removing the export would break tests. Leave as-is.

---

## Duplication

### DUP-1 — Admin list-page skeleton (HIGH value, MED risk)
**Locations:**
- `src/features/admin/DriversPage.tsx:40–95, 423–425` (526 LOC)
- `src/features/admin/TransportsPage.tsx:32–86, 404–425` (428 LOC)
- `src/features/admin/RulesPage.tsx:117–170, 926–947` (950 LOC)

**What's duplicated:** each page wires the identical block —
`useConfigStore` selectors (`workingConfig, dirty, resetToEmpty, remove*, find*, getWorkingYaml, getSavedYaml, markSaved`),
`useConfigValidation()` + `validationErrors` mapping,
`useUpdateConfig()`,
`[wizardOpen, editing*, deleteTarget, applyDialogOpen, searchQuery]` state,
`handleCreate`/`handleEdit`/`confirmDelete`,
the page header (refresh + apply-changes + create buttons + unsaved banner),
`<ValidationBanner/>`,
`<EntitySearchBar/>` + `filterEntities`,
the delete `<AlertDialog>`,
and the `<ConfigApplyConfirmationDialog>` with a near-identical `onConfirm`.
This is ~120 LOC of skeleton repeated across all three (RulesPage adds a rule-test panel, so it can't fully adopt the shell but can adopt the hook).

**Action:** extract `useEntityListPage({ kind })` hook returning the wired state + handlers, and an `<EntityListHeader/>` presentational shell. RulesPage adopts the hook, keeps its bespoke body.
**Net saved:** ~150–180 LOC (3×~120 duplicated − ~130 shared abstraction − RulesPage partial adoption).
**Risk:** med — RulesPage diverges (test panel, `useToggleRule`, `queryClient.invalidateQueries`); verify each page's create/edit/delete/apply still works and the `markSaved`+invalidate side effects fire.
**Verify:** the `pages_render_smoke.test.tsx` regression (covers #185 infinite-loop) + manual create/edit/delete/apply on each page.

### DUP-2 — `ConfigApplyConfirmationDialog` `onConfirm` block (LOW risk)
**Locations:** `DriversPage.tsx:423–425`, `TransportsPage.tsx:404–425`, `RulesPage.tsx:926–947`, `ConfigCenterPage.tsx:849+`.
**What's duplicated:** the ~15-LOC `onConfirm` that guards on `validationErrors`, reads `getWorkingYaml()`, calls `updateConfig.mutate({payload}, {onSuccess: markSaved + close + invalidate})`.
**Action:** extract `useApplyConfig()` hook returning `{ apply, isPending }` encapsulating the mutate+markSaved+invalidate.
**Net saved:** ~40 LOC.
**Risk:** low — pure wiring extraction. **Verify:** apply flow on all 4 pages; invalidate keys (`['rules']` only in RulesPage) preserved.

### DUP-3 — `validationErrors` mapping (LOW risk)
**Locations:** `DriversPage.tsx:60–63`, `TransportsPage.tsx:54–57`, `RulesPage.tsx:149–152`, `ConfigCenterPage.tsx:183`, `ValidationBanner.tsx:25–28`.
**What's duplicated:** `validation.errors.map((e) => \`${e.path}: ${e.message}\`)` (and the `hasConfig && !valid ? ... : undefined` guard) in 5 places.
**Action:** add `formatValidationErrors(validation): string[] | undefined` to `useConfigValidation.ts` (or fold the string form into the hook result).
**Net saved:** ~12 LOC.
**Risk:** low. **Verify:** banner + dialog error lists unchanged.

### DUP-4 — Detail-page edit section + header (MED value, MED risk)
**Locations:** `DriverDetailPage.tsx:328–410` (`DriverEditConfigSection`) + `:430–499` (header); `TransportDetailPage.tsx:325–410` + `:476–499`.
**What's duplicated:** `DriverEditConfigSection`/`TransportEditConfigSection` are structurally identical — `useUpdateConfig` + `useConfigRaw`, `[open, values, statusMsg]` state, the `useEffect` pre-fill-from-rawYaml, `generatedYaml` memo, `handleGenerateAndReload`, and the `<EntityEditConfigCard>` prop wiring. The page-level loading/error/header Card (icon + name + type + status badge + refresh) is also near-identical (~80 LOC each). `EntityEditConfigCard` itself is already shared (good).
**Action:** extract `useEntityEditConfig({ entity, fields, buildYaml, i18nPrefix })` hook and a `<EntityDetailHeader/>` component.
**Net saved:** ~90–110 LOC.
**Risk:** med — the two pre-fill effects differ subtly (transport reads top-level vs settings fields via `f.group`); preserve that branch. **Verify:** edit+reload on a driver and a transport; pre-fill shows current server values.

### DUP-5 — Wizard form-reset + required-fields gate (MED risk)
**Locations:** `DriverWizard.tsx:147–176, 213–229` and `TransportWizard.tsx:108–141, 184–198`.
**What's duplicated:**
- The render-phase "reset state when dialog opens" pattern (`lastOpen`/`lastType` + a block of `set*` calls) — ~12 LOC each, identical structure.
- The `step1Valid` required-fields loop: `for (group of registry.groups) for (field of group.fields) if (field.required) { val = settings[field.key]; if (val == null || val === '') return false }` — byte-identical ~10 LOC each.
**Action:** extract `areRequiredFieldsFilled(registry, settings): boolean` to `settingsRegistry.ts`; extract a `useResetOnOpen(open, resetFn)` hook (or document the pattern). The `previewYaml`/`contextValidation`/`handleFinish` triple follows the same shape but differs per entity type — leave as-is (low net gain, higher risk).
**Net saved:** ~25–35 LOC.
**Risk:** med — the reset-on-open pattern is a known React render-phase-setState idiom; extracting it is safe only if the hook preserves the exact call ordering. **Verify:** open each wizard fresh + re-open after close + switch type in create mode.

### DUP-6 — `RestartBadge` defined twice (LOW risk)
**Locations:** `GlobalConfigEditor.tsx:49–61` (`{ show: boolean }`) and `NodeConfigEditor.tsx:77–88` (no prop, always shown).
**What's duplicated:** the same Badge JSX (icon + `border-status-warning/40 bg-status-warning/10` + i18n key), differing only by the `show` gate and the i18n key prefix.
**Action:** extract one `RestartBadge({ show?, labelKey? })` to a shared spot (e.g. `components/admin/DetailPageParts.tsx` or a small `components/admin/Badges.tsx`).
**Net saved:** ~12 LOC.
**Risk:** low. **Verify:** both editors still show the badge on restart-required fields.

### DUP-7 — "No working config → init button" empty card (LOW risk)
**Locations:** `GlobalConfigEditor.tsx:104–123`, `NodeConfigEditor.tsx:176–192`, `RuleProviderEditor.tsx:73–90`, `RuleGroupEditor.tsx:568–584`.
**What's duplicated:** the `if (!workingConfig) return <Card>…<Button onClick={resetToEmpty}>{t('globalConfig.initConfig')}</Button>…` block — ~18 LOC each, near-identical (icon + title + init button).
**Action:** extract `<EmptyConfigCard({ icon, titleKey, onInit })/>`.
**Net saved:** ~40 LOC.
**Risk:** low. **Verify:** each editor's empty state still offers init.

### DUP-8 — Detail-page field-definition arrays parallel `settingsRegistry` (HIGH risk — flag only)
**Locations:** `DriverDetailPage.tsx:48–280` (`MODBUS_TCP_FIELDS`, `MODBUS_TLS_FIELDS`, …), `TransportDetailPage.tsx:53–290` (`MQTT_FIELDS`, `HTTP_FIELDS`, …).
**What's duplicated:** hand-maintained `DriverEditField[]`/`TransportEditField[]` arrays re-declare the same `key`/`labelKey`/`kind`/`placeholder` metadata already in `settingsRegistry.ts` (`DRIVER_SETTINGS_REGISTRY`/`TRANSPORT_SETTINGS_REGISTRY`), just in a flatter shape.
**Action (deferred):** derive the detail-page field list from the registry instead of maintaining a parallel copy.
**Net saved:** ~200 LOC — but **risk high**: the detail-page shape adds `group`/`boolean`/`options` distinctions and the registry uses grouped `SettingsField[]`; a mapping layer is non-trivial and easy to get wrong. **Recommend:** flag for a follow-up, do not bundle with the low-risk pass.

---

## Over-Design

### OD-1 — `AdminLayout`/`MonitorLayout` 6-line wrappers (LOW risk)
See D4. Two components whose entire body is `return <AppShell/>`, existing only to be named route elements. Inline `<AppShell/>` in `App.tsx`. **Saved: ~14 LOC.**

### OD-2 — `CountUpNumber` + `useCountUp` single-use abstraction (LOW risk)
**Locations:** `src/components/ui/count-up-number.tsx` (22 LOC) + `src/hooks/useCountUp.ts` (44 LOC) = 66 LOC.
**Observation:** `CountUpNumber` has exactly one importer (`DashboardPage.tsx:23`); `useCountUp` has exactly one importer (`count-up-number.tsx`). This is a 66-LOC rAF-animation abstraction serving a single call site.
**Action:** inline the animation into `DashboardPage` (or keep `CountUpNumber` but inline `useCountUp` into it). **Net saved: ~40 LOC** if both inlined; ~22 if only the hook is folded into the component.
**Risk:** low — single call site, no API contract to preserve. **Verify:** dashboard KPI numbers still animate on mount.

### OD-3 — `configStore` 5×4 repetitive entity wrappers (borderline — do NOT change)
**Location:** `configStore.ts:~250–404` — `upsertDriver/removeDriver/findDriver/isDriverNameUnique` × 5 entities (driver/transport/rule/ruleProvider/ruleGroup) = ~20 near-identical store methods, each a 3-line `get()/delegate/set()` wrapper.
**Observation:** could be generated by a factory like `configYaml`'s `makeArrayEntityHelpers`. **Recommendation: leave as-is.** The explicit form is readable, the store is the architectural backbone, and a factory here adds indirection for ~40 LOC saved at med risk (rule-group uses a Record shape, not an array — the factory would need a branch). Net value too low for the risk.

### OD-4 — `WizardDialog` convenience wrapper (keep)
`Wizard.tsx:256–282` wraps `Wizard` in a `Dialog`. Used by all 3 wizards. Single-purpose but genuinely shared — not over-design. Keep.

---

## Redundant Logic

### RED-1 — `validationErrors` mapping (see DUP-3)
Folded into the duplication section; same 5-site fix.

### RED-2 — Detail pages call `dump()` directly instead of `dumpConfigYaml` (LOW risk)
**Locations:** `DriverDetailPage.tsx:325` `dump(doc, { skipInvalid: true, noRefs: true, lineWidth: -1 })`; `TransportDetailPage.tsx:322` same.
**Observation:** `configYaml.dumpConfigYaml` uses `{ lineWidth: -1, noRefs: true }` (no `skipInvalid`). The detail pages import `dump` from `js-yaml` directly and hand-pass a slightly different option bag — a parallel YAML-serialization path.
**Action:** route both through `dumpConfigYaml` (add `skipInvalid: true` to the shared `DUMP_OPTS` if the detail pages rely on it — verify `skipInvalid` only drops `undefined` values, which is desired everywhere).
**Net saved:** ~6 LOC + one less direct `js-yaml` import. **Risk:** low. **Verify:** detail-page YAML preview round-trips; wizard preview unaffected.

### RED-3 — `connectionInfo` field-extraction parallels `settingsRegistry` (MED risk — flag only)
**Location:** `connectionInfo.ts:22–130` (`getDriverConnectionFields`/`getTransportConnectionFields`) hand-list which settings keys to show per type, duplicating key names already declared in `settingsRegistry`.
**Observation:** two sources of truth for "which keys belong to type X". **Action (deferred):** derive the connection-summary field set from the registry. **Risk med** — the connection-info helper picks a *subset* (primary fields) with custom labels; a clean derivation needs a "primary" flag on registry fields. **Recommend:** flag for follow-up, not the low-risk pass.

---

## Test Bloat

No test deletions recommended. Notes:
- `pages_render_smoke.test.tsx` (112 LOC) — only renders `TransportsPage`+`RulesPage`; it is the regression guard for issue #185 (infinite update depth from store selectors). **Keep.**
- `configSchema.test.ts` (680 LOC) and `configStore.test.ts` (497 LOC) are large but each test asserts a distinct validation/store rule — comprehensive, not redundant.
- The `useDebouncedValue`/`useStatusMessage`/`useConfigHistory` hook tests are the sole coverage for single-use hooks; keep until the hooks are removed/inlined.

---

## Prioritized Slimming Plan

Ordered by value/risk. Each step is independently shippable; run `tsc && vitest run && build` after every step.

| Step | Items | Net LOC | Risk | Cumulative |
|------|-------|---------|------|------------|
| **1** | **D1+D2+D3** — delete `Sidebar.tsx`, `TopBar.tsx`, `skeleton.tsx` | **−347** | low (zero-risk: no importers) | −347 |
| **2** | **D4 / OD-1** — inline `AppShell` in `App.tsx`, delete `AdminLayout`+`MonitorLayout` | **−14** | low | −361 |
| **3** | **DUP-6** — extract shared `RestartBadge` | **−12** | low | −373 |
| **4** | **DUP-7** — extract `EmptyConfigCard` | **−40** | low | −413 |
| **5** | **DUP-3 / RED-1** — `formatValidationErrors` helper | **−12** | low | −425 |
| **6** | **DUP-2** — `useApplyConfig` hook | **−40** | low | −465 |
| **7** | **RED-2** — detail pages use `dumpConfigYaml` | **−6** | low | −471 |
| **8** | **D5+D6+D7** — drop unused `export` keywords + fix stale comment | **−10** | low | −481 |
| **9** | **OD-2** — inline `CountUpNumber`/`useCountUp` into `DashboardPage` | **−40** | low | −521 |
| **10** | **DUP-5** — `areRequiredFieldsFilled` + `useResetOnOpen` | **−30** | med | −551 |
| **11** | **DUP-4** — `useEntityEditConfig` + `EntityDetailHeader` | **−100** | med | −651 |
| **12** | **DUP-1** — `useEntityListPage` + `EntityListHeader` | **−150** | med | −801 |
| *defer* | DUP-8 (detail fields from registry), RED-3 (connectionInfo from registry) | *~−200* | **high** | not in this pass |

**Conservative committed total (steps 1–12): ~−650 LOC net** (~2.6% of source).
Of that, **steps 1–9 (~−480 LOC) are low-risk** and can land first as a single PR;
**steps 10–12 (~−170 LOC) are med-risk** (touch wizard/detail/list wiring) and
warrant separate PRs with the smoke test + manual feature passes.
The two high-risk de-duplications (DUP-8, RED-3) are flagged for a follow-up audit
once the low-risk pass is green.
