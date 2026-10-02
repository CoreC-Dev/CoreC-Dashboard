# Complexity & Duplication Audit (subagent: d68d4538)

## Summary
Functionally cohesive but suffers from **page-level god components** (4 page components >800 lines mixing IO + business rules + rendering + orchestration) and **systematic copy-paste duplication** across CRUD list pages (Drivers/Transports/Rules) and detail pages (Driver/Transport). `settingsRegistry.ts` field metadata is a **triple source of truth** alongside `DriverDetailPage`/`TransportDetailPage` field arrays and `configSchema.ts` required-field checks. Complexity health: moderate-to-poor; duplication health: poor.

## Complexity Hotspots (with before-metrics)
| File | Main component span | useState | useEffect | useMemo | Concerns mixed |
|---|---|---|---|---|---|
| ConfigCenterPage.tsx | 163–1049 (~886) | 9 | 3 | 2 | Monaco IO, YAML parse, store bridge, validation, history, file upload, diff, templates, apply |
| TagExplorerPage.tsx | 219–1019 (~800) | 14 | 7 | 4 | WS stream, REST seed, rAF batching, virtualization, chart lifecycle, write dialog, trend drawer |
| RulesPage.tsx | 129–947 (~818) | 15 | 0 | 2 | list render, toggle mutation, edit dialog, test-match simulator, apply dialog |
| AppShell.tsx | 58–595 (~537) | 4 | 4 | 0 | routing, theme view-transition, mobile detection, sidebar, instance select, lang toggle, progress bar |
| GlobalConfigEditor.tsx | 83–591 (~508) | 1 | 0 | 0 | ~20 hand-written FieldRow blocks (should be data-driven) |
| WriteControlPage.tsx | 84–590 (~506) | 14 | 2 | 0 | write form, dead-letter list, replay, clear, sessionStorage persistence |

## Duplication
- DriverDetailPage ≈ TransportDetailPage: parallel per-type field arrays, getXxxFields, buildXxxSettings/buildXxxYaml, XxxEditConfigSection with identical useEffect pre-fill + previewYaml + applyYaml + handleGenerateAndReload. Only JSX shell extracted (EntityEditConfigCard); logic not.
- Apply-confirmation + mutation pattern: copy-pasted 4× (DriversPage:442, TransportsPage:425, RulesPage:917, ConfigCenterPage:867).
- "reset on open" wizard pattern: copy-pasted 3× (DriverWizard:149, RuleWizard:153, TransportWizard:110).
- handleCreate/handleEdit/handleDelete/confirmDelete: copy-pasted 3× (DriversPage:87, TransportsPage:78, RulesPage:163).
- Field metadata: triple-sourced — settingsRegistry.ts, DriverDetailPage.tsx (MODBUS_TCP_FIELDS…), configSchema.ts.

## Findings

- **Title**: ConfigCenterPage is a god component mixing 7+ concerns
- **Location**: src/features/admin/ConfigCenterPage.tsx:163–1049
- **Category**: 复杂度
- **Severity (suggested)**: P1
- **Evidence**: Single component ~886 lines; 9 useState (193–213), 3 useEffect. Mixes Monaco editor IO, loadFromYaml/getWorkingYaml store bridge (235–260), file upload via FileReader, YAML↔form sync, validation, useConfigHistory snapshots, LCS diff, template picker, apply confirmation dialog.
- **Fix suggestion**: Split into `<ConfigToolbar>`, `<YamlEditorPane>`, `<ConfigFormPane>`, `<ConfigDiffPreview>`, `<ConfigHistoryPanel>`, and `useConfigCenterState()` hook. Page = thin composition root.
- **Behavior impact**: 无

- **Title**: TagExplorerPage is a god component mixing streaming + virtualization + chart + write
- **Location**: src/features/monitor/TagExplorerPage.tsx:219–1019
- **Category**: 复杂度
- **Severity (suggested)**: P1
- **Evidence**: ~800 lines; 14 useState (226–255), 7 useEffect, 4 useMemo. WS subscription + rAF batching (302–359), REST seeding (276–291), react-virtual setup, lightweight-charts create/destroy, write-value dialog, trend drawer. WS effect (365+) 60+ lines, 4 refs.
- **Fix suggestion**: Extract `useTagStream(selectedDriver)`, `useTrendChart(containerRef, samples, theme)`, `<TagWriteDialog>`, `<TrendDrawer>`. Page = composition + filteredTags memo.
- **Behavior impact**: 无

- **Title**: RulesPage is a god component with 15 useState and an inline test-match simulator
- **Location**: src/features/admin/RulesPage.tsx:129–947
- **Category**: 复杂度
- **Severity (suggested)**: P1
- **Evidence**: ~818 lines; 15 useState. Mixes rule list render, per-row toggle mutation tracking (Set), edit dialog with transform pre-fill from raw YAML, live evaluateMatch test simulator, apply-confirmation. getActionBadge (306–348) 5-case switch returning near-identical Badge JSX.
- **Fix suggestion**: Extract `<RuleTestSimulator>`, `<RuleEditDialog>`, `useRuleToggle()`. Replace getActionBadge switch with ACTION_BADGE_META lookup table.
- **Behavior impact**: 无

- **Title**: configSchema.validateConfig is a 165-line high-cyclomatic function with nested DFS
- **Location**: src/lib/configSchema.ts:476–641
- **Category**: 复杂度
- **Severity (suggested)**: P2
- **Evidence**: ~165 lines, ~12 sequential if/for checks + nested recursive detectCycle DFS (593–631) with visited/inStack sets. Cyclomatic ≥ 20.
- **Fix suggestion**: Split into named pure validators: checkDataSourcePresence, checkNameUniqueness, checkTransportFallbacks, checkRuleTargetRefs, checkSubRuleCycles (extract detectCycle standalone). validateConfig = sequence spreading each result's errors.
- **Behavior impact**: 无

- **Title**: AppShell mixes routing, theme view-transition, mobile, sidebar, instance, language, progress
- **Location**: src/components/layout/AppShell.tsx:58–595
- **Category**: 复杂度
- **Severity (suggested)**: P2
- **Evidence**: ~537 lines. Inline handleThemeChange (87–106) View Transitions API + flushSync. 4 useEffect. sidebarContent (211–~440) ~230-line inline JSX.
- **Fix suggestion**: Extract `<SidebarNav>`, `<ThemeSelector>`, `<InstanceSelector>`, `<TopProgressBar>`, `useSidebarState()`. Move nav item arrays to navItems.ts.
- **Behavior impact**: 无

- **Title**: GlobalConfigEditor is one ~430-line hand-written render instead of data-driven form
- **Location**: src/features/admin/GlobalConfigEditor.tsx:122–590
- **Category**: 复杂度
- **Severity (suggested)**: P2
- **Evidence**: 46 FieldRow mentions, ~20 field blocks for log/api/engine/buffer, each inline Input/Select/Switch/Checkbox + updateGlobalField('dotted.path'). Duplicates declarative pattern in settingsRegistry.ts (powers driver/transport wizards via RegistryFieldGrid).
- **Fix suggestion**: Define GLOBAL_SETTINGS_REGISTRY (same SettingsField[] shape), render via existing RegistryFieldGrid/SettingsFieldRenderer. Editor = registry + updateGlobalField binding.
- **Behavior impact**: 无

- **Title**: WriteControlPage mixes write form + dead-letter queue + replay + sessionStorage in 506 lines
- **Location**: src/features/admin/WriteControlPage.tsx:84–590
- **Category**: 复杂度
- **Severity (suggested)**: P2
- **Evidence**: ~506 lines; 14 useState. Write form, success/error/replayError messages, pending confirm, two confirm dialogs, clearedDlqKeys Set persisted to sessionStorage. extractApiError (63–72) local helper belongs in api/client.
- **Fix suggestion**: Extract `<WriteForm>`, `<DeadLetterTable>` (with useClearedDlqKeys() sessionStorage hook), move extractApiError to @/api/client.
- **Behavior impact**: 无

- **Title**: DriverDetailPage and TransportDetailPage duplicate parallel field-array registries
- **Location**: src/features/admin/DriverDetailPage.tsx:49–288 and src/features/admin/TransportDetailPage.tsx:54–260
- **Category**: 重复
- **Severity (suggested)**: P1
- **Evidence**: DriverDetailPage defines MODBUS_TCP_FIELDS, MODBUS_TLS_FIELDS, MODBUS_RTU_FIELDS, S7_FIELDS, OPCUA_FIELDS (49–273) + getDriverFields (275–288). TransportDetailPage defines MQTT_FIELDS, HTTP_FIELDS etc. + getTransportFields (261). Parallel DRIVER_SETTINGS_REGISTRY/TRANSPORT_SETTINGS_REGISTRY in settingsRegistry.ts:141+ — same keys, different shape. Adding a field requires editing both.
- **Fix suggestion**: Derive detail-page edit fields from getDriverFieldRegistry(type)/getTransportFieldRegistry(type) via registryToEditFields() adapter. Delete local *_FIELDS arrays.
- **Behavior impact**: 无

- **Title**: DriverEditConfigSection ≈ TransportEditConfigSection — logic not extracted, only JSX
- **Location**: src/features/admin/DriverDetailPage.tsx:329–460 and src/features/admin/TransportDetailPage.tsx:337–460
- **Category**: 重复
- **Severity (suggested)**: P1
- **Evidence**: Both share useState(open/values/statusMsg), useEffect pre-fill from parseConfigYaml(rawYaml) (348–365/356–371), previewYaml useMemo (368/374), applyYaml useMemo merging via upsertDriver/upsertTransport (377–390/382–395), handleGenerateAndReload async. EntityEditConfigCard extracted only presentational JSX (17 props); stateful logic copy-pasted.
- **Fix suggestion**: Extract useEntityEditConfig({ entityName, entityKind, buildEntry, upsert }) hook returning { values, setField, previewYaml, applyYaml, statusMsg, handleReload, isReloading }. Sections = thin wrappers.
- **Behavior impact**: 无

- **Title**: Apply-confirmation + updateConfig.mutate pattern copy-pasted 4×
- **Location**: src/features/admin/DriversPage.tsx:442–469, TransportsPage.tsx:425–452, RulesPage.tsx:917–944, ConfigCenterPage.tsx:867–895
- **Category**: 重复
- **Severity (suggested)**: P1
- **Evidence**: Four near-identical ConfigApplyConfirmationDialog blocks. onConfirm same ~12 lines: `if (validationErrors) return; const yaml = getWorkingYaml(); setApplyError(null); updateConfig.mutate({payload: yaml}, { onSuccess: () => { markSaved(); setApplyDialogOpen(false); [optional invalidateQueries] }, onError: … })`. Only RulesPage adds invalidateQueries(['rules']).
- **Fix suggestion**: Extract useApplyConfig({ getWorkingYaml, getSavedYaml, markSaved, invalidateOnSuccess? }) hook returning { open, openDialog, closeDialog, applyError, dialogProps }. Pages render `<ConfigApplyConfirmationDialog {...dialogProps} />`.
- **Behavior impact**: 无

- **Title**: "reset on open" wizard pattern duplicated 3×
- **Location**: src/features/admin/DriverWizard.tsx:149–159, RuleWizard.tsx:153–165, TransportWizard.tsx:110–126
- **Category**: 重复
- **Severity (suggested)**: P2
- **Evidence**: All three implement `const [lastOpen, setLastOpen] = useState(open)` + `if (open && !lastOpen) { /* reset draft */ }` + `if (!open && lastOpen) setLastOpen(false)`. 6 matches across 3 files.
- **Fix suggestion**: Extract useResetOnOpen(open, resetFn) into @/hooks.
- **Behavior impact**: 无

- **Title**: handleCreate/handleEdit/handleDelete/confirmDelete duplicated 3× across list pages
- **Location**: src/features/admin/DriversPage.tsx:87–112, TransportsPage.tsx:78–103, RulesPage.tsx:163–181
- **Category**: 重复
- **Severity (suggested)**: P2
- **Evidence**: Identical-shape CRUD handlers; only entity name and store selector differ.
- **Fix suggestion**: Extract useEntityListPage({ find, remove, resetToEmpty }) returning { handleCreate, handleEdit, handleDelete, confirmDelete, wizardOpen, editing, deleteTarget, … }.
- **Behavior impact**: 无

- **Title**: Field metadata is a triple source of truth (registry + detail arrays + schema)
- **Location**: src/lib/settingsRegistry.ts:141–852, src/features/admin/DriverDetailPage.tsx:49–288, src/lib/configSchema.ts:90–300
- **Category**: 架构
- **Severity (suggested)**: P1
- **Evidence**: Same per-driver/per-transport field set described in 3 places: (1) DRIVER_SETTINGS_REGISTRY for wizard forms, (2) MODBUS_TCP_FIELDS for detail edit form, (3) zod superRefine required checks in configSchema.ts. settingsRegistry.ts:11–13 header explicitly warns of manual mirror.
- **Fix suggestion**: Make settingsRegistry.ts single source: derive detail edit fields via adapter, generate zod required-field checks from required:true flags. configSchema keeps only cross-entity rules.
- **Behavior impact**: 无

- **Title**: getActionBadge is a 5-case switch of near-identical Badge JSX
- **Location**: src/features/admin/RulesPage.tsx:306–348
- **Category**: 复杂度
- **Severity (suggested)**: P2
- **Evidence**: 5-case switch, each returns `<Badge variant="outline" className="border-X/30 bg-X/10 text-X">{t(label)}</Badge>` differing only in color + i18n key. 43 lines.
- **Fix suggestion**: Replace with ACTION_BADGE: Record<string, {cls; key}> lookup + single Badge. Mirrors existing ACTION_META table in RuleWizard.tsx:64.
- **Behavior impact**: 无

- **Title**: EntityEditConfigCard takes 17 props — prop-drilling, logic not co-located
- **Location**: src/components/admin/DetailPageParts.tsx:120–139
- **Category**: 架构
- **Severity (suggested)**: P2
- **Evidence**: EntityEditConfigCardProps has 17 fields. Two callers each wire all 17 from duplicated stateful section. Abstraction stopped at presentation; stateful behavior duplicated.
- **Fix suggestion**: Co-locate: single `<EntityEditConfigCard entityName entityKind buildEntry upsert />` owning state via useEntityEditConfig hook. Props drop to ~5.
- **Behavior impact**: 无

- **Title**: Inline connection-summary IIFE repeated in list page card renders
- **Location**: src/features/admin/DriversPage.tsx:205 & 327, TransportsPage.tsx:190 & 320
- **Category**: 重复
- **Severity (suggested)**: P2
- **Evidence**: Both list pages call getDriverConnectionSummary/getTransportConnectionSummary inline in .map() card render, render same summary.map(f => <Param>) block twice each (working-config + runtime cards). 4× duplication.
- **Fix suggestion**: Extract `<ConnectionFields config name kind />` component.
- **Behavior impact**: 无

- **Title**: settingsRegistry.ts is an 878-line data god object with manual triple-sync risk
- **Location**: src/lib/settingsRegistry.ts:1–878
- **Category**: 架构
- **Severity (suggested)**: P2
- **Evidence**: Single file holds DRIVER_SETTINGS_REGISTRY (7 driver types, 141–420+) and TRANSPORT_SETTINGS_REGISTRY (5+ transport types) as inline object literals — 878 lines. Correctness depends on manual sync with configSchema.ts and Go server Init() (header 11–13). No test asserts parity with configSchema.
- **Fix suggestion**: (a) Add test asserting every required:true field also required in configSchema zod check. (b) Split driver vs transport registries into two files. (c) Long-term: generate from server OpenAPI/schema if available.
- **Behavior impact**: 无

- **Title**: TagExplorerPage WS effect is a large multi-concern effect with implicit ref state
- **Location**: src/features/monitor/TagExplorerPage.tsx:365–440 (effect) + 302–359 (rAF flush)
- **Category**: 复杂度
- **Severity (suggested)**: P2
- **Evidence**: WS useEffect creates CoreCWebSocket, message callback reads trendTagRef.current (implicit ref state, 377), stages into 3 refs, calls scheduleFlush. scheduleFlush (319–359) 40-line rAF handler with 3 conditional flush branches + nested setState updaters. 4 refs + 1 deferred value + driver-filter condition.
- **Fix suggestion**: Encapsulate stream+batch in useTagStream(selectedDriver) returning { tagMap, flashTick, trendSamples, subscribeTrend, closeTrend }. Page no longer touches refs/rAF.
- **Behavior impact**: 无

- **Title**: ConfigCenterPage auto-load effect uses a ref guard + store getState() — implicit state
- **Location**: src/features/admin/ConfigCenterPage.tsx:213–229 and 235–246
- **Category**: 复杂度
- **Severity (suggested)**: P2
- **Evidence**: autoLoadedRef (213) one-time guard read inside effect (222–229). handleImportYamlToForm (235–246) reads useConfigStore.getState().error immediately after loadFromYaml() because "configError from render closure is stale" (comment 238–239) — store mutation read imperatively not reactively.
- **Fix suggestion**: Drive auto-load from useEffect with proper "has loaded" state flag, or react-query onSuccess/select. Have loadFromYaml return error synchronously instead of mutating + getState.
- **Behavior impact**: 无

## DONE
