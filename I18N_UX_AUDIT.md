# CoreC-Dashboard — i18n & UI/UX Audit Report

**Scope:** `src/features/**`, `src/components/**`, `src/index.css`, `src/i18n/*`, `corec-dashboard-proposal.md`
**Method:** Read all 14 feature pages + 4 layout/error components + UI primitives + constants; grepped for Chinese chars, capitalized JSX text, `t()` key references, icon-only buttons, responsive breakpoints; diffed `en.json` vs `zh-CN.json` key trees.
**Default locale:** `zh-CN` (per `src/i18n/index.ts:8,16`). So **any** un-i18n'd English string is visible to the default/primary user.

---

## 0. Executive Summary

| Severity | Count | Meaning |
|:--:|:--:|:--|
| **P0** | 0 | None — app builds and renders; no crashes/broken routes. |
| **P1** | 9 | i18n correctness broken: zh-CN users see English on real content (missing-key `t()` calls, fully-untranslated pages, systemic constants). |
| **P2** | 11+ | Hardcoded strings where keys already exist; UX state gaps (loading/empty/error); accessibility; chart labels. |
| **P3** | 6+ | Decorative/technical strings; proposal feature gaps; polish. |

**Two structural problems dominate:**
1. **`src/lib/constants.ts`** hardcodes every connection-state and quality label in English (`Connected`, `Good`, `Bad`, …). These power badges on **6 pages** and never localize — even though `common.connected`/`common.disconnected`/… keys exist.
2. **3 admin pages were authored without `useTranslation` at all** (`ConfigCenterPage`, `DashboardEditorPage`, and largely `RulesPage`/`WriteControlPage` bodies) — they ship 100% English in both locales *despite matching i18n keys already being present in the JSON*. This is the highest-leverage fix: the translation work is already done, only the `t()` wiring is missing.

---

## 1. i18n Key-Structure Consistency ✅ PASS

```
en.json: 378 leaf keys   zh-CN.json: 378 leaf keys
Namespaces (15, identical): alerts common config connection dashboard
  dashboardEditor diagnostics drivers nav rules settings tags topology
  transports write
only-in-en: []   only-in-zh: []
```
Both locale files are **structurally identical** — same 15 namespaces, same 378 keys, no drift. The defects below are all *missing wiring* (keys exist but unused) or *wrong-key references* (key doesn't exist), not locale-file gaps.

---

## 2. P1 — Major i18n correctness defects

### P1-1 · Systemic: status/quality labels hardcoded in `constants.ts`
**Files:** `src/lib/constants.ts:38-81` (used by DriversPage, TransportsPage, TopologyPage, TagExplorerPage, DriverDetailPage, DashboardPage)
`ConnStateLabel` returns `{ text: 'Disconnected'|'Connecting'|'Connected'|'Error' }` and `QualityLabel` returns `{ text: 'Good'|'Bad'|'Uncertain' }` — plain English, rendered into `<Badge>` across the whole app. Keys `common.disconnected/connecting/connected/error` exist; quality values have no key yet.
**Fix:** Convert to translation-key maps (e.g. `key: 'common.connected'`) and render via a small `<StateBadge stateKey=.../>` component calling `t()`, or export `t`-consuming accessor functions. Add `common.good/bad/uncertain` keys for quality.

### P1-2 · `ConfigCenterPage` — no `useTranslation` import; entirely English
**File:** `src/features/admin/ConfigCenterPage.tsx` (whole file; no `useTranslation` import at all)
Every user-facing string is hardcoded even though `config.*` keys exist for most of them. Representative lines:
- `:171` `Log level updated to ${lvl} in CoreC runtime` → key `config.logLevelUpdated` exists
- `:174` `'Failed to update log level'` → `config.logLevelUpdateFailed`
- `:184` `'Configuration diff applied and hot reloaded successfully!'` → `config.reloadSuccess`
- `:188` `'Hot reload failed'` → `config.reloadFailed`
- `:203` `<h1>Configuration Center</h1>` → `config.title`
- `:204-207` subtitle → `config.subtitle`
- `:223` `Form View`, `:235` `YAML Code` → `config.formView` / `config.yamlCode`
- `:247` `'Reloading...'` / `'Hot Reload Core'` → `config.reloading` / `config.hotReload`
- `:277` `Runtime Live Parameters…`, `:286` `Global Log Level` → `config.runtimeParams` / `config.globalLogLevel`
- `:315` `Current Configuration` → `config.activeSummary`
- `:341` `API Listener` → `config.apiListener`
- `:407` `corec.yaml`, `:410` `Supports ${ENV_VAR}…` → `config.corecYaml` / `config.envVarNote`
**Fix:** `import { useTranslation }`, `const { t } = useTranslation()`, replace literals with the existing `config.*` keys.

### P1-3 · `DashboardEditorPage` — no `useTranslation` import; entirely English
**File:** `src/features/admin/DashboardEditorPage.tsx` (no `useTranslation`)
All `dashboardEditor.*` keys exist but unused:
- `:19-57` `CARD_TYPES[].title/desc` (`'KPI Metrics Row'`, `'Traffic Throughput Chart'`, …) → `dashboardEditor.cardKpiSummaryTitle` … `cardAlertsDesc`
- `:97` `<h1>Large-Screen Layout Editor</h1>` → `dashboardEditor.title`
- `:98-100` subtitle → `dashboardEditor.subtitle`
- `:111` `Reset Default` → `dashboardEditor.resetDefault`
- `:118` `Saved to Local Storage!` → `dashboardEditor.savedToStorage`
- `:123` `Save Layout` → `dashboardEditor.saveLayout`
- `:135` `Available Card Catalog` → `dashboardEditor.catalog`
- `:182` `Active Layout Cards ({count})` → `dashboardEditor.activeCards`
- `:192` `No cards in layout…` → `dashboardEditor.noCards`
**Fix:** add `useTranslation`, wire the existing keys; pass `{ title: t(key), desc: t(key) }` from a localized `CARD_TYPES` lookup instead of literal strings.

### P1-4 · `RulesPage` body largely un-i18n'd (keys exist)
**File:** `src/features/admin/RulesPage.tsx`
`useTranslation` is imported and `t('common.refresh')` is used, but the page body is hardcoded:
- `:288` `<h1>Rule Pipeline & Routing</h1>` → `rules.title`
- `:289-292` subtitle → `rules.subtitle`
- `:311-318` headers `Prio`/`Rule Name`/`Match Condition (DSL)`/`Action`/`Target Sink`/`Hit Stats`/`Enabled`/`Actions` → `rules.colPriority/colName/colMatch/colAction/colTarget/colHitStats/colEnabled` + `common.actions`
- `:325` `No routing rules configured…` → `rules.empty`
- `:358` `… hits` → `rules.hits` / `common.hits`
- `:366` `Last:`, `:368` `'Never'` → `rules.last` / `common.never`
- action badges `ALERT/DROP/TRANSFORM/MIRROR/FORWARD` → `rules.actionAlert/actionDrop/actionTransform/actionMirror/actionForward`
- `:387` `Test`, `:402` `Test Rule: …`, `:473` `✓ MATCHED`, `:484` `✗ NO MATCH`, `:497` `Close`, `:501` `Run Test` → add `rules.test / testRule / matched / noMatch / common.close / runTest`
**Fix:** wire existing keys; add the handful of missing test-dialog keys to both JSON files.

### P1-5 · `WriteControlPage` — error/success/labels hardcoded (keys exist)
**File:** `src/features/admin/WriteControlPage.tsx`
- `:98` `'Please select a driver and specify a tag name'` → `write.selectDriverAndTag` ✅ exists
- `:117` `` `Command successfully written to …` `` → `write.writeSuccess` (interpolated) ✅
- `:123` `'Write command failed'` → `write.writeFailed` ✅
- `:134` `'Replay failed'` → `write.replayFailed` (needs `{{error}}`) ✅
- `:387` `Replay failed: {replayError}` → `write.replayFailed`
- `:413` `{dl.attempts} attempts exhausted` → `write.attemptsExhausted` (with `{{count}}`) ✅
- `:142-145` subtitle, `:154` `Dispatch Write Command`, `:157` desc, `:188` `Select target driver…`, `:199/202/216` labels+placeholders, `:247` value placeholder, `:276-292` concurrency/retry card → `write.subtitle/dispatch/dispatchDesc/selectDriver/deviceOptional/devicePlaceholder/tagPlaceholder/boolPlaceholder/valuePlaceholder/concurrencyRetries/…` all exist ✅
**Fix:** replace literals with the existing `write.*` keys (work already done in JSON).

### P1-6 · Missing-key `t()` calls (render English `defaultValue` in zh-CN)
These call `t('a.b', { defaultValue: 'English' })` where `a.b` does **not** exist → both locales render the English default.
| File:line | Call | Existing alternative key |
|:--|:--|:--|
| `features/monitor/DashboardPage.tsx:99` | `t('dashboard.online')` | `dashboard.onlineSuffix` ✅ |
| `features/admin/TopologyPage.tsx:50` | `t('topology.version')` | none — add key |
| `features/admin/TopologyPage.tsx:56` | `t('topology.listen')` | none — add key |
| `features/admin/TopologyPage.tsx:62` | `t('topology.logLevel')` | none — add key |
| `features/admin/DriverDetailPage.tsx:85` | `t('drivers.detailNotFound')` | none — add key |
| `features/admin/TransportDetailPage.tsx:101` | `t('transports.detailNotFound')` | none — add key |
| `features/monitor/AlertsPage.tsx:114` | `t('alerts.deadLetterControlQueueDesc')` | `alerts.deadLetterDesc` ✅ (or add) |
| `features/monitor/AlertsPage.tsx:193` | `t('alerts.realtimeWarningFeedDesc')` | `alerts.realtimeWarningDesc` ✅ (or add) |
**Fix:** either point at the existing sibling key, or add the missing keys to **both** JSON files. Remove redundant `defaultValue`s once keys exist.

### P1-7 · `TagExplorerPage` primary empty-state hardcoded (key exists)
`features/monitor/TagExplorerPage.tsx:510` `No points found matching current filter` → key `tags.noPoints` already exists ("未找到匹配当前筛选条件的测点"). The whole table header row (`:499` `Actions`, and the other `<th>`s) is also hardcoded despite `tags.colTag/colDriver/colGroup/colValue/colType/colQuality/colTimestamp/colActions` existing.
**Fix:** wire `tags.col*` + `tags.noPoints`.

### P1-8 · `TransportDetailPage` error/refresh/back fully hardcoded (inconsistent with sibling)
`features/admin/TransportDetailPage.tsx`:
- `:90` `Back to Transports`, `:94` `Transport not found`, `:96-98` `No transport named…` / `No transport name was provided…`, `:118` `Back to Transports`, `:127` `Refresh` — **plain literals, not even `t()`**.
- Contrast with `DriverDetailPage` which *does* use `t()` (albeit wrong keys — P1-6).
**Fix:** mirror the DriverDetailPage i18n pattern (and fix both with correct keys).

### P1-9 · `DriverDetailPage` / `TransportDetailPage` Param/Stat labels hardcoded
~20 labels per page are hardcoded English with no `t()`. Representative (`DriverDetailPage`): `:144` `Total Errors`, `:150` `Reconnect Failures`, `:156` `Total Reads`, `:168` `Connection & Runtime Parameters`, `:176-206` `Driver Name/Protocol Type/Connection State/Last Read/Tag Count/…`, `:228` `Tag Values`, `:249-254` table headers, `:283/290` `Stale`/`Fresh` badges (keys `tags.stale`/`tags.fresh` exist). Same pattern in `TransportDetailPage:153-282`.
**Fix:** these pages were clearly added late without i18n pass; add a `drivers.detail.*` / `transports.detail.*` key group and wire them.

---

## 3. P2 — Moderate

### P2-1 · UX: list pages conflate "loading" with "empty" and lack error-retry
Pages: `DriversPage`, `TransportsPage`, `RulesPage`, `TopologyPage`, `DashboardPage`, `TagExplorerPage`.
Pattern: `const items = data?.items || []` then `items.length === 0 ? <EmptyState/>`. During the **initial fetch** (`data === undefined`), this renders the *empty* state ("No drivers configured") instead of a loading skeleton, then flips to content. None of these list pages surface a fetch **error** with a retry button (only the two *detail* pages do, via `isLoading`/`error` branches).
**Fix:** branch on `isLoading` → skeleton/spinner; `isError` → error card with `refetch()` button; `data && items.length===0` → empty state. (Detail pages already model this correctly — replicate.)

### P2-2 · Proposal A4 gap: DLQ has no batch "Clear All"
`WriteControlPage.tsx` exposes per-item `Retry` only. Proposal A4 ("控制下发") requires "批量清除" (batch clear). `alerts.clear` key exists but is unused here.
**Fix:** add a `Clear All` action calling the dead-letter clear endpoint (or local purge) with a confirm dialog.

### P2-3 · Proposal A1 gap: no driver/transport config edit form
`DriverDetailPage`/`TransportDetailPage` are read-only. Proposal A1 requires "驱动配置编辑: 表单式编辑驱动参数 → 生成 YAML → 提交热重载"; A2 requires connection-parameter editing + fallback config. No edit UI exists.
**Fix:** add an edit mode/form (or route to ConfigCenter YAML) — at minimum document as deferred.

### P2-4 · Accessibility: icon-only button without label
`features/admin/DashboardEditorPage.tsx:214` — `<Button size="icon">` containing only `<Trash2/>` (remove card) has **no `aria-label`/`title`**. (TopBar's three icon buttons at `:116/:138/:149` do have `title` — good, though `:140` `Theme: ${theme}` is untranslated.)
**Fix:** add `aria-label={t('common.delete')}` (or a `dashboardEditor.removeCard` key).

### P2-5 · `ErrorBoundary` fully hardcoded (class component)
`src/components/ErrorBoundary.tsx:58` `Something went wrong`, `:63` description, `:73` `Reset View`, `:76` `Reload Page` — no i18n. It's a class component so `useTranslation` can't be used directly.
**Fix:** use `i18n.t()` directly from the imported `i18n` instance, or wrap with `withTranslation` HOC, or render a functional fallback component that does use the hook.

### P2-6 · Layout chrome strings hardcoded
- `components/layout/Sidebar.tsx:23/31/39` group titles `South & Northbound` / `Control Plane` / `System & Mesh` (no keys).
- `components/layout/Sidebar.tsx:87` `Connect · Collect · Control` tagline.
- `components/layout/MonitorLayout.tsx:47` `Real-time Stream Connected`.
- `App.tsx:71` `Loading…` Suspense fallback (key `common.loading` exists).
- `features/login/ConnectionPage.tsx:99` `placeholder="http://127.0.0.1:9090"` (key `connection.urlPlaceholder` exists); `:120` uses `connection.invalidSecret` as a *hint* but the hint key is `connection.secretHint`.
**Fix:** add `nav.groupSouthbound/groupControl/groupSystem`, `common.brandTagline`, `monitor.realtimeStreamConnected`; wire the existing `common.loading`/`connection.urlPlaceholder`/`connection.secretHint`.

### P2-7 · Chart series/legend labels not localized
- `components/charts/MemoryChart.tsx:46` `unit="MB"`, `:58` `name="Heap Alloc (MB)"`, `:67` `name="Sys Mem (MB)"` → keys `dashboard.heapAllocMb`/`dashboard.sysMemMb` exist.
- `components/charts/TrafficChart.tsx:94` `name="Read / s"`, `:104` `name="Publish / s"` → `dashboard.readPerSec`/`dashboard.publishPerSec` exist.
Both are classless functional components; can use `useTranslation`.
**Fix:** wire the existing keys (also lets tooltips/legends switch with locale).

### P2-8 · `DiagnosticsPage` metric/table section hardcoded (keys partially exist)
`features/admin/DiagnosticsPage.tsx`: `:243` subtitle (`diagnostics.subtitle` ✅), `:262/267` `Resume`/`Pause` (`diagnostics.resume/pause` ✅), `:278` `Clear` (`diagnostics.clear` ✅), `:291` `Prometheus Runtime Metrics` (`diagnostics.runtimeMetrics` ✅), `:313/319/327/333/341` tile titles (`diagnostics.goroutines/heapAllocated/gcCycles/offlineBuffer/busDropped` ✅), `:502` pprof title (`diagnostics.pprofEndpoints` ✅). Also ~15 strings with **no key** (`:352 Latency & Data Age`, `:360 Read Latency`, `:404 Per-Driver Read Counts`, table headers, `:530-533` pprof note, etc.).
**Fix:** wire existing `diagnostics.*` keys; add the missing ones to both JSON files. Metrics fetch failure is only `console.error` (`:157`) — surface a UI error/retry (see P2-1).

### P2-9 · `TagExplorerPage` trend drawer hardcoded
`:510` empty state (P1-7), `:583` `Live trend · last {n}/{m} samples`, `:589` `No trend data available for non-numeric tags`, `:595` `Type: `, `:599` `Value: `, `:603-604` `TRUE`/`FALSE` (keys `tags.trueValue`/`tags.falseValue` exist).
**Fix:** add `tags.liveTrend/noTrendData`; wire `common.type`/`common.value`/`tags.trueValue`/`tags.falseValue`.

### P2-10 · `RulesPage` test-dialog hardcoded body
`:402` `Test Rule: …`, `:410` `Match Expression (DSL)`, `:473` `✓ MATCHED`, `:475` `Action:`, `:479` `Target:`, `:484` `✗ NO MATCH`, `:486-490` note, `:497` `Close`, `:501` `Run Test`. Some have keys (`rules.action`/`rules.target`); the rest need new keys.
**Fix:** add `rules.test/testRule/matched/noMatch/runTest/matchExpr/noteEval`; wire existing.

### P2-11 · `DashboardPage` inline stat labels hardcoded
`:65` `stats?.status || 'Running'` (key `dashboard.running` exists), `:118` `% Connected` (`dashboard.connectedSuffix`), `:183` `Tags:`, `:186` `Reads:` (`dashboard.tagsLabel`/`readsLabel`), `:226` `Pub:` (`dashboard.pub`), `:230` `Queue:` (`dashboard.queue`), `:272` `{n} retries` (`dashboard.retries` with count).
**Fix:** wire existing `dashboard.*` keys.

---

## 4. P3 — Minor / polish / proposal gaps

| ID | File:line | Issue | Fix |
|:--|:--|:--|:--|
| P3-1 | `AlertsPage.tsx:51` | `err?.message \|\| 'Failed to retry dead letter command'` | use `write.replayFailed` |
| P3-2 | `AlertsPage.tsx:220` | `'ERROR'`/`'WARN'` badge literals | add `alerts.levelError/Warn` (or accept as technical) |
| P3-3 | `DiagnosticsPage.tsx:110,117-131` | xterm banner `[CoreC Stream] Connected…`, `[DEBUG]/[INFO]/[WARN]/[ERROR]` tags | terminal output — acceptable as technical; optionally localize banner |
| P3-4 | `DiagnosticsPage` (whole) | **Proposal A8 gaps:** no xterm-addon-search ("实时搜索"), no level-filter toggle ("级别筛选开关") | add search bar + level checkboxes |
| P3-5 | `DashboardEditorPage` | **Proposal A5 gaps:** no layout JSON *import*, no preset templates (Overview/Production/Debug) | add import button + template selector |
| P3-6 | `ConfigCenterPage` | **Proposal A6 gaps:** no change-diff display ("显示变更 diff"), no localStorage config-snapshot history ("变更历史") | render diff before reload; keep last N snapshots |
| P3-7 | `TopBar.tsx:140` | `title={`Theme: ${theme}`}` untranslated | add `settings.theme` + mode labels |
| P3-8 | `Sidebar.tsx` | Fixed `w-56` sidebar never collapses on mobile | add a mobile drawer/collapse below `sm` |
| P3-9 | `DriverDetailPage.tsx:16` / `TransportDetailPage.tsx:26` | `formatTimestamp` returns `'Never'` literal | use `drivers.never`/`transports.never`/`common.never` |
| P3-10 | `index.css:94-96` | `* { border-color: hsl(var(--border)); }` applies to every element | intentional Tailwind-v4 border-reset; acceptable, document |
| P3-11 | `RulesPage.tsx:72-75` | `QUALITY_OPTIONS` labels `0 — Good` etc. hardcoded | add `common.good/bad/uncertain` |

---

## 5. UX Consistency — summary

| Check | Status | Notes |
|:--|:--:|:--|
| Loading states on data pages | ⚠️ Partial | Detail pages (`DriverDetail`/`TransportDetail`) ✓; **list pages** render empty-state during initial load (P2-1). |
| Empty states on list/table views | ✅ Good | All lists have empty states (some hardcoded — P1-7/P1-4). |
| Error states with retry | ⚠️ Partial | Detail pages ✓; **list pages + Diagnostics metrics** have no error UI (P2-1/P2-8). |
| Button styling consistency | ✅ Good | Consistent `size="sm"` + `h-8 text-xs` pattern; `outline`/`ghost`/`default`/`destructive` used appropriately; Badge `success/warning/info` variants defined & valid. |
| Responsive breakpoints | ✅ Good | `md:/lg:/sm:` used widely & consistently (22 sites); only gap is non-collapsing Sidebar (P3-8). |
| Accessible labels on icon-only buttons | ⚠️ 1 miss | TopBar ✓; **DashboardEditorPage remove button ✗** (P2-4). |
| Color-only status meaning | ⚠️ | Connection dots rely on color alone in a few spots (e.g. TopBar dot) — pair with the badge text where present (detail pages do). |

---

## 6. Layout / Visual — `src/index.css`

- **`@theme inline` block (lines 16-43):** ✅ Complete — registers all 19 shadcn semantic color tokens (`--color-background`…`--color-ring`), radius (`sm/md/lg`), and fonts (`--font-sans/mono`) referencing the `:root`/`.dark` HSL channel vars. Without it 600+ utilities would render unstyled — it is present and correct.
- **`:root` / `.dark` (46-91):** ✅ All channel variables defined for both themes. `.dark` intentionally omits `--radius`/`--font-*` (inherits from `:root`) — correct.
- **`.dashboard-grid` (152-158):** ✅ Works — `grid-template-columns: repeat(12, minmax(0,1fr))`, `grid-auto-rows: 60px`, `gap:1rem`; cards positioned via inline `grid-column/grid-row` from `dashboardStore`. Matches the proposal's 12-column react-grid-layout schema.
- **Glow/scrollbar utilities (116-144):** ✅ Present and used (`glow-success/warning/danger/primary`).
- **Nav structure (`components/layout/`):** `AdminLayout` = TopBar + fixed Sidebar + Outlet; `MonitorLayout` = TopBar + sub-nav strip + Outlet. Both use `p-4 md:p-6` consistent padding. Routes in `App.tsx` match proposal §3 exactly. ✅ Structure sound; only the Sidebar group titles are untranslated (P2-6).

---

## 7. Proposal Module Coverage (M1–M3, A1–A9)

All **12 routes exist** (`App.tsx:102-139`) and match proposal §3. Feature-level coverage:

| Module | Page | Coverage | Gaps |
|:--|:--|:--|:--|
| M1 Dashboard | `DashboardPage` | ✅ KPI/traffic/memory/driver/transport/alerts cards, fullscreen, layout store | — |
| M2 Tag Explorer | `TagExplorerPage` | ✅ Virtualized table, WS stream, filters, trend drawer, write | i18n gaps (P1-7/P2-9) |
| M3 Alerts | `AlertsPage` | ✅ DLQ + alert rules + live log stream + retry | 2 missing keys (P1-6) |
| A1 Drivers | `DriversPage`+`DriverDetailPage` | ⚠️ List/detail/stats/tags | **No config edit form/YAML hot-reload** (P2-3) |
| A2 Transports | `TransportsPage`+`TransportDetailPage` | ⚠️ List/detail/queue | No queue-depth trend chart; no edit (P2-3) |
| A3 Rules | `RulesPage` | ⚠️ Priority list, enable/disable, **test sandbox ✓** | No rule editor form (P3); i18n (P1-4) |
| A4 Write Control | `WriteControlPage` | ⚠️ Write form + confirm + DLQ retry + audit | **No batch clear** (P2-2) |
| A5 Dashboard Editor | `DashboardEditorPage` | ⚠️ Add/remove/reset/save | **No import, no preset templates** (P3-5); no drag/resize (read-only grid) |
| A6 Config Center | `ConfigCenterPage` | ⚠️ Form+YAML(Monaco) dual mode, log-level PATCH, hot reload | **No diff display, no change history** (P3-6); fully un-i18n'd (P1-2) |
| A7 Topology | `TopologyPage` | ✅ Node identity + southbound→bus→rules→northbound diagram | 3 missing keys (P1-6) |
| A8 Diagnostics | `DiagnosticsPage` | ⚠️ xterm logs, prom metrics, pprof | **No search, no level filter** (P3-4) |
| A9 Settings | `SettingsPage` | ✅ Connection/theme/language/layout export/reset | — |

---

## 8. Recommended fix order (highest leverage first)

1. **P1-2 / P1-3 / P1-4 / P1-5** — wire the **already-existing** keys in ConfigCenter / DashboardEditor / Rules / WriteControl. ~80% of the untranslated strings disappear with pure mechanical `t()` wiring — no JSON edits needed.
2. **P1-1** — refactor `constants.ts` ConnStateLabel/QualityLabel to keys (systemic; fixes 6 pages at once).
3. **P1-6** — add the ~6 missing keys to *both* JSON files (topology.version/listen/logLevel, drivers/transports.detailNotFound, alerts.*Desc) or repoint to existing siblings.
4. **P2-1** — add loading-skeleton + error-retry branches to the 6 list pages (replicate the detail-page pattern).
5. **P1-8/P1-9/P2-11** — i18n pass on the two detail pages + DashboardPage inline labels.
6. Then P2-4/P2-5/P2-6/P2-7 (accessibility, ErrorBoundary, chrome, charts) and the P3 proposal gaps.

---

## Appendix A — Per-file hardcoded-string count (approx, user-facing only)

| File | Hardcoded strings | Has `useTranslation`? |
|:--|:--:|:--:|
| `features/admin/ConfigCenterPage.tsx` | ~35 | ❌ no import |
| `features/admin/DashboardEditorPage.tsx` | ~20 | ❌ no import |
| `features/admin/RulesPage.tsx` | ~25 | ⚠️ imported, mostly unused |
| `features/admin/WriteControlPage.tsx` | ~20 | ⚠️ imported, partial |
| `features/admin/DriverDetailPage.tsx` | ~25 | ⚠️ imported, partial |
| `features/admin/TransportDetailPage.tsx` | ~25 | ⚠️ imported, partial |
| `features/admin/DiagnosticsPage.tsx` | ~20 | ⚠️ imported, partial |
| `features/monitor/DashboardPage.tsx` | ~8 | ✅ imported |
| `features/monitor/TagExplorerPage.tsx` | ~7 | ✅ imported |
| `features/monitor/AlertsPage.tsx` | ~3 | ✅ imported |
| `features/admin/TopologyPage.tsx` | ~8 | ✅ imported |
| `features/admin/TransportsPage.tsx` | 0 | ✅ fully i18n'd ✓ |
| `features/admin/DriversPage.tsx` | ~6 (dialog) | ✅ imported |
| `features/admin/SettingsPage.tsx` | 0 | ✅ fully i18n'd ✓ |
| `features/login/ConnectionPage.tsx` | ~2 | ✅ imported |
| `components/layout/Sidebar.tsx` | 4 | ✅ imported (groups not keyed) |
| `components/layout/MonitorLayout.tsx` | 1 | ✅ imported |
| `components/layout/TopBar.tsx` | 1 | ✅ imported |
| `components/ErrorBoundary.tsx` | 4 | ❌ class component |
| `components/charts/MemoryChart.tsx` | 3 | ❌ no import |
| `components/charts/TrafficChart.tsx` | 2 | ❌ no import |
| `src/lib/constants.ts` | 7 (systemic) | n/a (non-component) |

**Positive note:** `TransportsPage.tsx` and `SettingsPage.tsx` are exemplars of correct full i18n + clean loading/empty handling — use them as the reference pattern when fixing the others.
