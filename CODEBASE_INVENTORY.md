# CoreC-Dashboard Frontend — Codebase Inventory

A complete map of the existing `src/` tree for the rewrite team. Built from a
full read of every file under `src/stores`, `src/api`, `src/types`,
`src/components`, `src/features`, `src/i18n`, `src/lib`, `src/hooks`.

**Stack:** React 19 · TypeScript 6 · Vite 8 · Zustand 5 · TanStack Query 5 ·
react-router-dom 7 (HashRouter) · i18next 26 · Tailwind 4 · shadcn/ui (Radix) ·
recharts 3 · lightweight-charts 5 · xterm 6 · Monaco editor · js-yaml · zod 4 ·
react-hook-form 7. Biome + oxlint + vitest for quality.

**Routing shell:** `HashRouter` in `src/App.tsx`. Two protected spaces:
`/monitor/*` (MonitorLayout) and `/admin/*` (AdminLayout), plus public `/login`.
All pages are `React.lazy` code-split with per-route `ErrorBoundary` + `Suspense`.
`RequireConnection` gates every protected route on `connectionStore.isConnected`.

---

## 1. Stores (`src/stores/`) — 4 Zustand stores

### `configStore.ts` — Config working-copy store (KEEP, core)
The architectural backbone for all config editing. Holds a local working copy
of the full `CoreCConfig` and delegates entity CRUD to pure helpers in
`lib/configYaml.ts`. Decision-independent (works under backend Path A
`GET /configs/raw` and Path B uploaded YAML).

**State shape:**
- `workingConfig: CoreCConfig | null` — what the user is editing
- `savedConfig: CoreCConfig | null` — last successfully applied snapshot
- `dirty: boolean` — workingConfig ≠ savedConfig (JSON-stringify equality)
- `error: string | null`

**Methods:**
- Loading: `loadFromYaml(yaml)`, `loadFromConfig(config)`, `resetToEmpty()`
- Entity CRUD: `upsertDriver/removeDriver`, `upsertTransport/removeTransport`,
  `upsertRule/removeRule`, `upsertRuleProvider/removeRuleProvider`,
  `upsertRuleGroup(name,rules)/removeRuleGroup` (all return boolean success)
- Section updates: `updateGlobal(global)`, `updateNode(node)`,
  `updateGlobalField(path,value)`, `updateNodeField(path,value)` (dotted-path set)
- Save/revert: `markSaved()`, `revert()`
- Derived getters (non-reactive): `getWorkingYaml()`, `getSavedYaml()`,
  `findDriver/findTransport/findRule/findRuleProvider/findRuleGroup`,
  `isDriverNameUnique/isTransportNameUnique/isRuleNameUnique/
   isRuleProviderNameUnique/isRuleGroupNameUnique`

### `connectionStore.ts` — Single-instance connection (REPLACE with instance store)
Holds one CoreC endpoint + bearer secret, persisted to `localStorage` key
`corec_connection`. **This is the store to be REPLACED by a multi-instance
store in the rewrite** (currently single-connection only).

**State shape:** `baseUrl`, `secret`, `isConnected`, `isConnecting`,
`lastError`, `serverVersion`, `serverName`.

**Methods:** `setConnection(url,secret)`, `setConnected(connected,info?)`,
`setError(error)`, `clearAuth()` (on 401), `disconnect()`,
`revalidate()` (startup probe of persisted creds with 10s AbortController).

### `dashboardStore.ts` — Custom dashboard layout (REMOVE)
Persisted to `localStorage` key `corec_dashboard_layout`. Powers the
react-grid-layout editor. **To be REMOVED in the rewrite** along with
`DashboardEditorPage` and react-grid-layout.

**State shape:** `currentLayout: DashboardLayout`, `isEditing: boolean`.
**Methods:** `updateCardLayout(newLayouts)` (debounced persist),
`addCard(card)`, `removeCard(id)`, `updateCardConfig(id,partial)`,
`resetToDefault()`, `setEditing(editing)`. Ships 6 default cards
(kpi-summary, traffic-chart, memory-chart, driver-status-list,
transport-status-list, recent-alerts).

### `themeStore.ts` — Theme (KEEP)
`theme: 'system'|'dark'|'light'`, `resolvedTheme`. Persists to
`corec_theme`. `setTheme()` applies `.dark` class to `<html>`, listens to
`prefers-color-scheme` media query.

---

## 2. API Layer (`src/api/`)

### `client.ts` — REST wrapper (KEEP)
`apiRequest<T>(path, options)` — adds Bearer auth from connectionStore,
15s AbortController timeout (overridable via `timeoutMs`/caller `signal`),
401 → `clearAuth()`, 204 → undefined, JSON/text auto-decode. Exports
`ApiError` (status, message, body) and `ApiRequestOptions`.

### `websocket.ts` — WS client (KEEP)
`CoreCWebSocket<T>` class. Converts http→ws/https→wss, passes `token` as
query param. Features: exponential backoff with jitter (max 10 retries,
base 1s → max 30s), sliding-window rate limiter (500 msg/s, O(1) head index),
upgrade-rejection detection (1006/1008/1011 → `'rejected'` status), stops
reconnect when secret cleared. `WSStatus = 'connecting'|'open'|'closed'|
'error'|'rejected'`. `destroy()` nulls handlers + closes.

### `endpoints/index.ts` — REST endpoints (KEEP)
- `getServerInfo()` → `GET /`
- Configs: `getConfigs()` (`GET /configs` summary), `updateConfigs({path?,payload?})`
  (`PUT /configs`), `patchConfigs({'log-level'?})` (`PATCH /configs`),
  `getConfigsRaw()` (`GET /configs/raw` — redacted YAML, `Accept: application/yaml`),
  `validateConfigs(payload)` (`POST /configs/validate` — normalizes 400 into
  `{valid,error}`)
- Drivers: `getDrivers()`, `getDriver(name)`, `getDriverTags(name)`
- Transports: `getTransports()`, `getTransport(name)`
- Tags/Control: `getTags()`, `writeTag(cmd)` (`POST /write`),
  `getDeadLetters()` (`GET /write/failed`)
- Rules: `getRules()`, `toggleRule(index,disabled)` (`PATCH /rules/disable`)
- Metrics: `getStats()` (`GET /stats`), `getMetricsText()` (`GET /metrics`)

### `hooks/index.ts` — TanStack Query hooks (KEEP)
`useConnectedQuery` wrapper gates every query on `isConnected`. Query hooks:
`useServerInfo` (30s), `useDrivers`/`useDriver`/`useDriverTags` (5s/5s/3s),
`useTransports`/`useTransport` (5s), `useTags` (5s), `useRules` (5s),
`useStats` (5s), `useConfigs` (no poll), `useConfigRaw` (no poll),
`useDeadLetters` (4s).
Mutation hooks: `useWriteTag` (invalidates tags/deadLetters/driverTags/driver),
`useToggleRule`, `usePatchConfig`, `useUpdateConfig` (invalidates configs +
configsRaw), `useValidateConfig`.

---

## 3. Types (`src/types/`) — 4 files

### `models.ts` — Runtime domain models
`DataPoint` (driver/device/group/tag/value/type/quality/timestamp/metadata/
is_stale), `WriteCommand`, `DriverStatus` (state 0-3, counters),
`TransportStatus`, `RuleStat` (index/name/type/match/action/target/targets/
priority/disabled/hit_count/miss_count), `DeadLetterEntry`, `EngineStats`
(uptime in ns, points_per_sec), `LogEvent` (level -4/0/4/8), `TrafficFrame`,
`MemoryFrame`.

### `api.ts` — API response envelopes
`ServerInfoResponse`, `VersionResponse`, `HealthCheckResponse`,
`ConfigSummaryResponse`, `DriversListResponse`, `DriverTagsResponse`
(tags nullable), `TransportsListResponse`, `GlobalTagsResponse`,
`WriteResponse`, `DeadLetterResponse`, `RulesListResponse`,
`StatsResponse = EngineStats`.

### `config.ts` — CoreC config type system (444 lines, 1:1 with Go structs)
Enums as const arrays: `DATA_TYPES`, `DRIVER_TYPES` (modbus-tcp/rtu/rtuovertcp/
udp/rtuoverudp/tls/s7/opcua), `TRANSPORT_TYPES` (mqtt/http), `RULE_ACTIONS`
(forward/drop/alert/transform/mirror), `RULE_TYPES`, `LOG_LEVELS`,
`LOG_FORMATS`, `ON_BAD_QUALITY_POLICIES`, `NODE_ROLES`, `OPCUA_MODES`,
`PARITY_VALUES`, `PARSER_TYPES`, `SECRET_SENTINEL='***'`.
Interfaces: `TagConfig`, per-protocol `*Settings` (ModbusTcp/Rtu/Tls/S7/Opcua/
Mqtt/Http + ReconnectSettings/ParserConfig), `DriverConfig`, `TransportConfig`,
`RuleConfig`, `TransformConfig`, `RuleProviderConfig`, `RuleGroups`,
`APIConfig`, `EngineConfig`, `BufferConfig`, `GlobalConfig`, `NodeConfig`,
`CoreCConfig` (top-level). Cast helpers `asModbusTcp` etc.

### `dashboard.ts` — Dashboard layout schema (REMOVE with dashboardStore)
`CardType` union (kpi-summary/traffic-chart/memory-chart/driver-status-list/
transport-status-list/recent-alerts/tag-value/tag-table), `DashboardCard`
(id/type/title/layout{x,y,w,h,minW,minH}/config), `DashboardLayout`.

---

## 4. Layout (`src/components/layout/`) — 4 components

### `TopBar.tsx` (KEEP)
Sticky `h-14` header. Brand + connection badge (isConnected/baseUrl/
serverName/serverVersion), fullscreen toggle (Fullscreen API + webkit fallback,
state synced via `fullscreenchange` event), language toggle (EN/中 via
`setLocale`), theme cycle (system→dark→light), disconnect button. Reads
connectionStore + themeStore.

### `MonitorLayout.tsx` (KEEP)
TopBar + a `h-10` sub-nav strip with 3 NavLinks: dashboard/tags/alerts.
Shows a "realtime stream connected" indicator. `<Outlet/>` content area.

### `AdminLayout.tsx` (KEEP)
TopBar + Sidebar + `<Outlet/>` main content (flex, overflow-y-auto).

### `Sidebar.tsx` (KEEP, but restructure nav groups)
`w-56` aside with 3 nav groups (NavLink-based):
- **South & Northbound:** drivers, transports, rules
- **Control Plane:** write, **dashboard-editor** (REMOVE this link), config
- **System & Mesh:** topology, diagnostics, **settings** (MOVE to global /settings)
Footer: "CoreC Engine" brand tagline.

---

## 5. Features (`src/features/`) — page components

### `login/ConnectionPage.tsx` — `/login` (REWORK for multi-instance)
Centered card with Server URL + Secret Token inputs. Validates URL scheme
(http/https) and token ≥8 chars, probes `GET /` with 10s timeout, on success
`setConnection` + `setConnected` + navigate to `/monitor/dashboard`. No API
hooks, no WebSocket. **Pattern:** form. Uses connectionStore directly.

### Monitor space (`features/monitor/`)

#### `DashboardPage.tsx` — `/monitor/dashboard` (KEEP, but rework grid)
Reads `useStats`, `useDrivers`, `useTransports`, `useDeadLetters` (all polled)
+ `useDashboardStore.currentLayout.cards`. Renders cards on a 12-col CSS grid
by stored x/y/w/h via `renderCardContent(card)` switch on `CardType`.
**Uses WebSocket:** indirectly via `TrafficChart`/`MemoryChart` children.
**Patterns:** KPI grid, charts, status lists, "manage" links to admin.
**Rewrite note:** the card-driven layout depends on dashboardStore (to be
removed); the rewrite should render a fixed/curated dashboard instead.

#### `TagExplorerPage.tsx` — `/monitor/tags` (KEEP)
912 lines. **Uses WebSocket:** `CoreCWebSocket<DataPoint>('/tags/stream')`
merges live tag values over REST `useTags`/`useDrivers` baseline (keyed by
driver::device::tag). **API hooks:** useDrivers, useTags, useWriteTag.
**Patterns:** virtualized table (`@tanstack/react-virtual`, ROW_HEIGHT=44),
per-row WAAPI flash on update, inline trend sparkline
(`lightweight-charts` LineSeries, 100 samples), write dialog with
`validateValue` + `useWriteTag` mutation, search filter, quality badges.
Uses `memo`'d `TagRow` for per-row update isolation.

#### `AlertsPage.tsx` — `/monitor/alerts` (KEEP)
**Uses WebSocket:** `CoreCWebSocket<LogEvent>('/logs')`. **API hooks:**
useDeadLetters (4s poll), useRules, useWriteTag. **Patterns:** dead-letter
table with retry (re-submits via writeTag), live log stream with sound
(Web Audio 800Hz beep) + browser Notification toggles (persisted to
`corec_alert_sound`/`corec_alert_notification`), rule-hit summary cards.
Refs mirror prefs/translations so the once-created WS callback stays current.

### Admin space (`features/admin/`)

#### `DriversPage.tsx` — `/admin/drivers` (KEEP)
**API hooks:** useDrivers, useDriverTags, useUpdateConfig. **Patterns:** table
of drivers (state badge, tag_count, read/error counters), search
(`EntitySearchBar`/`filterEntities`), add/edit via `DriverWizard` (Dialog),
delete via `AlertDialog` + `ConfigApplyConfirmationDialog` safety gate,
`useConfigValidation` banner. Uses configStore for working copy.

#### `DriverDetailPage.tsx` — `/admin/drivers/:name` (KEEP)
**API hooks:** useConfigRaw, useDriver, useDriverTags, useUpdateConfig.
**Patterns:** stat cards + param grid (`DetailPageParts`), live tag values
table, collapsible "edit configuration" form (per-protocol fields:
MODBUS_TCP_FIELDS etc.) with YAML preview (`js-yaml dump`) and hot-reload
via useUpdateConfig. Parses raw config with `parseConfigYaml` to find the
driver's settings.

#### `TransportsPage.tsx` — `/admin/transports` (KEEP)
**API hooks:** useTransports, useUpdateConfig. **Patterns:** table of
transports, add/edit via `TransportWizard`, delete confirm, search. Uses
`useNavigate` to detail page.

#### `TransportDetailPage.tsx` — `/admin/transports/:name` (KEEP)
**API hooks:** useConfigRaw, useTransport, useUpdateConfig. **Patterns:**
mirrors DriverDetailPage — stat cards, param grid, collapsible edit form
(MQTT/HTTP fields), YAML preview, hot-reload. Uses `DetailPageParts`.

#### `RulesPage.tsx` — `/admin/rules` (KEEP)
1014 lines. **API hooks:** useRules, useToggleRule, useUpdateConfig.
**Patterns:** rule table with enable/disable `Switch` (toggleRule PATCH),
priority sort, hit/miss stats, add/edit via `RuleWizard`, delete confirm +
apply dialog, search, validation banner. Uses configStore + useQueryClient.

#### `WriteControlPage.tsx` — `/admin/write` (KEEP)
598 lines. **API hooks:** useDeadLetters, useDrivers, useWriteTag.
**Patterns:** manual write form (driver/device/tag/type/value with
`validateValue`), dead-letter queue table with retry + purge
(`AlertDialog` confirms), write result feedback. No WebSocket.

#### `DashboardEditorPage.tsx` — `/admin/dashboard-editor` (REMOVE)
533 lines. **Uses react-grid-layout** (`Responsive`/`WidthProvider` from
`react-grid-layout/legacy`). **Store:** useDashboardStore (addCard/
removeCard/updateCardLayout/resetToDefault/setEditing). **Patterns:**
drag/resize grid editor, card-type palette (6 types), 3 templates
(overview/production/debug), import/export layout JSON, live preview.
**This page + its route + the sidebar link are to be REMOVED.**

#### `ConfigCenterPage.tsx` — `/admin/config` (KEEP, largest page — 1156 lines)
**API hooks:** useConfigRaw, useConfigs, usePatchConfig, useUpdateConfig,
useValidateConfig. **Components:** Monaco `Editor` (YAML), EventLogTerminal,
GlobalConfigEditor, NodeConfigEditor, RuleProviderEditor, RuleGroupEditor,
ConfigApplyConfirmationDialog, ValidationBanner. **Patterns:** Monaco YAML
editor with secret-sentinel round-trip, template gallery (`CONFIG_TEMPLATES`),
structured form editors (global/node/rule-providers/rule-groups) synced
bidirectionally with the YAML via configStore (`loadFromYaml`/
`getWorkingYaml`), server-side validate (`useValidateConfig`), apply via
`useUpdateConfig` (PUT /configs), runtime log-level PATCH, dirty banner,
revert. Uses configStore + themeStore (Monaco theme).

#### `TopologyPage.tsx` — `/admin/topology` (KEEP)
**API hooks:** useServerInfo, useDrivers, useTransports, useStats, useRules,
useConfigs. **Patterns:** node identity card, driver→rule→transport pipeline
visualization (sorted by priority), connection-state badges, error banner.
Read-only overview. No WebSocket.

#### `DiagnosticsPage.tsx` — `/admin/diagnostics` (KEEP)
**API:** `getMetricsText()` (Prometheus text, direct endpoint import).
**Components:** EventLogTerminal. **Patterns:** parsed Prometheus metrics
(`parsePrometheusMetrics`) rendered as histogram tiles (avg/count/sum),
pprof download links (heap/goroutine/profile/trace/block/mutex via
`baseUrl`), live log terminal. Uses connectionStore for pprof URLs.

#### `SettingsPage.tsx` — `/admin/settings` (MOVE to global /settings)
330 lines. **Stores:** connectionStore (baseUrl/secret/setConnection/
revalidate), themeStore, dashboardStore (currentLayout/resetToDefault).
**Patterns:** connection edit form (URL + token, save → revalidate),
theme radio (system/dark/light), language toggle, **dashboard layout
import/export/reset** (JSON file picker). **No API hooks, no WebSocket.**
**To be MOVED to a global `/settings` route** in the rewrite; the dashboard-
layout section should be dropped (it belongs to the removed dashboardStore).

### Admin sub-editors (used by ConfigCenterPage)

- **`GlobalConfigEditor.tsx`** (630 lines) — structured form for `global`
  (log-level/log-format/api/engine/buffer) via `configStore.updateGlobalField`.
  Marks restart-required fields. KEEP.
- **`NodeConfigEditor.tsx`** (node id/role/subscribe/topic-prefix) —
  conditional logic by role (collector/relay/aggregator/sink) via
  `configStore.updateNodeField`. KEEP.
- **`RuleGroupEditor.tsx`** — CRUD for `rule-groups` (named sub-rule
  collections) via `configStore.upsertRuleGroup/removeRuleGroup`. Accordion
  UI. KEEP.
- **`RuleProviderEditor.tsx`** — CRUD for `rule-providers` (external file
  rule-sets) via `configStore.upsertRuleProvider/removeRuleProvider`.
  Inline form rows. KEEP.
- **`DriverWizard.tsx`** (537 lines) — 5-step wizard (type→connection→tags→
  advanced→preview) → `configStore.upsertDriver`. Edit mode pre-fills +
  locks type step. KEEP.
- **`TransportWizard.tsx`** (362 lines) — 4-step wizard (type→connection→
  publishing→advanced→preview) → `configStore.upsertTransport`. KEEP.
- **`RuleWizard.tsx`** (527 lines) — 4-step wizard (basics→action→target→
  preview) with action-conditional steps → `configStore.upsertRule`. KEEP.

---

## 6. Charts (`src/components/charts/`)

### `TrafficChart.tsx` (KEEP)
`memo`'d. **WebSocket:** `CoreCWebSocket<TrafficFrame>('/traffic',{interval:'1s'})`.
Converts cumulative counters to per-second rates by diffing prev frame
(handles counter resets). recharts `AreaChart` (read/publish, gradient
fills), keeps last 25 points. No props.

### `MemoryChart.tsx` (KEEP)
`memo`'d. **WebSocket:** `CoreCWebSocket<MemoryFrame>('/memory',{interval:'1s'})`.
recharts `LineChart` (allocMb/sysMb/goroutines), 25-point window. No props.

---

## 7. Admin components (`src/components/admin/`)

### `EventLogTerminal.tsx` (KEEP)
xterm.js `Terminal` + `FitAddon` subscribed to `CoreCWebSocket<LogEvent>('/logs')`.
Log-rate limiting (16ms flush buffer, MAX_BATCH=200, drops overflow with
count notice). Pause/resume/clear controls. ANSI-colored log lines by level.
Props: `height` (default `h-80`). Reusable (used by DiagnosticsPage +
ConfigCenterPage).

### `DetailPageParts.tsx` (KEEP)
Shared primitives for DriverDetailPage/TransportDetailPage:
- `formatTimestamp(ts)` — handles zero-time
- `BackLink` — arrow-back Link button
- `StatCard` — icon + label + value card
- `Param` — label/value pair
- `EntityEditConfigCard` — collapsible edit-config shell (toggle header,
  field grid, YAML preview `<pre>`, status block, reload button). Props
  carry fields/values/yaml/status so the shell is entity-agnostic.
- `EditField`/`EditConfigStatus` interfaces.

---

## 8. Wizard framework (`src/components/wizard/`)

- **`Wizard.tsx`** (284 lines) — generic multi-step wizard (controlled
  `value`/`onValueChange`, per-step `canProceed` gate, `renderPreview` slot,
  progress header, keyboard-accessible Back/Next, optional `allowJumpBack`).
  Presentation-only. Rendered inside a `Dialog`. KEEP.
- **`ConfigApplyConfirmationDialog.tsx`** (428 lines) — safety gate before
  PUT /configs. Side-by-side YAML diff, affected-section summary, explicit
  Apply confirm, engine-suspend warning, blocks close mid-apply. KEEP.
- **`EntitySearchBar.tsx`** (64 lines) — search input + `filterEntities`
  helper (case-insensitive name+type match). KEEP.
- **`ExprValidationMessages.tsx`** — renders expression validation errors/
  warnings. KEEP.
- **`KeyValueField.tsx`** — key/value pair editor (for headers etc.). KEEP.
- **`RegistryFieldGrid.tsx`** — renders dynamic form fields from
  `settingsRegistry` metadata. KEEP.
- **`ValidationBanner.tsx`** — top-of-form validation error/warning banner. KEEP.
- **`WizardContextValidationBanner.tsx`** — cross-entity validation banner
  for wizard preview steps. KEEP.

---

## 9. i18n (`src/i18n/`) — en.json + zh-CN.json

`index.ts`: i18next init, `zh-CN` default + fallback, `setLocale(lng)` persists
to `corec_locale`. **27 top-level namespaces, full EN/zh-CN parity (0
mismatches).** ~1120 keys per locale.

| Namespace | Keys | Notes |
|---|---|---|
| `nav` | 18 | sidebar/topbar labels + group titles |
| `common` | 69 | shared status/action words |
| `wizard` | 22 | generic wizard step labels |
| `applyDialog` | 14 | config-apply confirmation |
| `driverWizard` | 23 | driver wizard steps |
| `connection` | 13 | login/connect form |
| `dashboard` | 38 | monitor dashboard cards |
| `tags` | 33 | tag explorer |
| `write` | 47 | write control + DLQ |
| `diagnostics` | 46 | diagnostics + log terminal |
| `drivers` | 51 (+`editConfig` 23) | drivers page + edit form |
| `transports` | 38 (+`editConfig` 20) | transports page + edit form |
| `rules` | 50 (+`edit` 15) | rules page + wizard |
| `config` | 87 | config center (largest) |
| `topology` | 28 | topology page |
| `settings` | 183 | settings page (theme/lang/connection/layout) |
| `alerts` | 27 | alerts page |
| `dashboardEditor` | 42 | **REMOVE with DashboardEditorPage** |
| `monitor` | 1 | realtime stream label |
| `error` | 1 (+`boundary` 4) | error boundary |
| `topbar` | 1 | theme tooltip |
| `transportWizard` | 14 | transport wizard |
| `ruleWizard` | 35 | rule wizard |
| `globalConfig` | 58 | global config editor |
| `nodeConfig` | 23 | node config editor |
| `ruleProvider` | 13 | rule provider editor |
| `ruleGroup` | 23 | rule group editor |

---

## 10. Lib (`src/lib/`) — 13 modules

- **`utils.ts`** — `cn()` (clsx+twMerge), `formatUptime` (ns→Xd Yh Zm),
  `formatNumber`, `isZeroTime`. KEEP.
- **`constants.ts`** — `DataTypeMap`, `DataTypeString`, `Quality`/`QualityLabel`,
  `ConnState`/`ConnStateLabel`, `DriverProtocols`, `TransportProtocols`,
  `DEFAULT_COREC_URL`. KEEP.
- **`storage.ts`** — `safePersist(key,value)` (never-throws localStorage). KEEP.
- **`configYaml.ts`** (253 lines) — `parseConfigYaml`/`dumpConfigYaml` (js-yaml)
  + pure entity helpers: `findDriver/upsertDriver/removeDriver`,
  `findTransport/upsertTransport/removeTransport`, `findRule/upsertRule/
  removeRule`, `findRuleProvider/upsertRuleProvider/removeRuleProvider`,
  `findRuleGroup/upsertRuleGroup/removeRuleGroup/renameRuleGroup`, and
  `is*NameUnique` checks. KEEP (core).
- **`configSchema.ts`** (662 lines) — zod schemas mirroring server validation:
  `tagConfigSchema`, `driverConfigSchema`, `transportConfigSchema`,
  `transformConfigSchema`, `ruleConfigSchema`, `ruleProviderConfigSchema`,
  `apiConfigSchema`, `engineConfigSchema`, `bufferConfigSchema`,
  `globalConfigSchema`, `nodeConfigSchema`, `coreCConfigSchema`;
  `validateConfig` (per-entity) + `validateFullConfig` (cross-entity:
  uniqueness, target refs, data-source presence). `isValidGoDuration`. KEEP.
- **`configTemplates.ts`** (379 lines) — `ConfigTemplate` interface +
  `CONFIG_TEMPLATES` (pre-built YAML presets by category) +
  `getTemplatesByCategory`/`getTemplateById`. KEEP.
- **`settingsRegistry.ts`** (923 lines) — field metadata for dynamic forms:
  `FieldType`, `FieldGroup`, `SettingsField`, `TypeFieldRegistry`,
  `DRIVER_SETTINGS_REGISTRY`, `TRANSPORT_SETTINGS_REGISTRY`,
  `TRANSPORT_TOPLEVEL_FIELDS`, `getDriverFieldRegistry`,
  `getTransportFieldRegistry`, `buildDefaultSettings`, `flattenFields`,
  `getRequiredFields`. KEEP.
- **`prometheus.ts`** — `MetricEntry` + `parsePrometheusMetrics(raw)`. KEEP.
- **`writeValidation.ts`** — `NUMERIC_RANGES` + `validateValue(raw,dt)`. KEEP.
- **`entityValidation.ts`** — `validateDriverInContext`,
  `validateTransportInContext`, `validateRuleInContext` (cross-entity). KEEP.
- **`ruleExprValidator.ts`** — `validateRuleExpression(expr)` (match DSL),
  `VALID_FIELDS`, `ExprValidationResult`. KEEP.
- **`transformExprValidator.ts`** — `validateTransformExpression(expr)`
  (arithmetic DSL), `ArithValidationResult`. KEEP.
- **`exprShared.ts`** — shared `ValidationResult` + balanced-paren checker
  used by both expression validators. KEEP.

---

## 11. Hooks (`src/hooks/`)

- **`useConfigValidation.ts`** — bridges configStore ↔ configSchema:
  `useConfigValidation()` (runs `validateFullConfig`, returns
  `{valid,errors,hasConfig}`), `useTransportNames()`, `useDriverNames()`,
  `useRuleNames()`, `useConfigDirty()`, `useConfigYamlPair()`. KEEP.

---

## 12. UI (`src/components/ui/`) — 14 shadcn/ui components

| Component | Radix dep |
|---|---|
| `alert-dialog.tsx` | `@radix-ui/react-alert-dialog` |
| `badge.tsx` | cva (no Radix) |
| `button.tsx` | `@radix-ui/react-slot` |
| `card.tsx` | none |
| `checkbox.tsx` | `@radix-ui/react-checkbox` |
| `dialog.tsx` | `@radix-ui/react-dialog` |
| `form.tsx` | react-hook-form bridge (no Radix) |
| `input.tsx` | none |
| `label.tsx` | `@radix-ui/react-label` |
| `radio-group.tsx` | `@radix-ui/react-radio-group` |
| `scroll-area.tsx` | `@radix-ui/react-scroll-area` |
| `select.tsx` | `@radix-ui/react-select` |
| `switch.tsx` | `@radix-ui/react-switch` |
| `textarea.tsx` | none |

**Not installed:** table, tabs, tooltip, popover, dropdown-menu, accordion,
command, toast/sonner, separator, skeleton, progress, slider, calendar,
avatar, breadcrumb, pagination, sheet, menubar, navigation-menu.

---

## 13. Other root files

- `src/App.tsx` — router + QueryClient (retry 1, staleTime 3s,
  refetchOnWindowFocus false) + `RequireConnection` gate +
  `RouteErrorBoundary` (keyed on pathname). KEEP (rework routes for removals).
- `src/main.tsx` — StrictMode + createRoot + Monaco CDN loader config +
  **imports `react-grid-layout/css/styles.css` + `react-resizable/css/styles.css`
  (REMOVE these imports with react-grid-layout)**.
- `src/components/ErrorBoundary.tsx` — class boundary with reset + reload. KEEP.
- `src/App.css`, `src/index.css` — Tailwind + custom glow/grid utilities.
  `index.css` references a "12-column responsive grid matching
  react-grid-layout" (clean up on removal).

---

## 14. Rewrite directives (explicit)

| Target | Action | Touches |
|---|---|---|
| **`dashboardStore.ts`** | **REMOVE** | store + all imports (DashboardPage, DashboardEditorPage, SettingsPage) |
| **`DashboardEditorPage.tsx`** + route `/admin/dashboard-editor` | **REMOVE** | App.tsx route, Sidebar link (`nav.dashboardEditor`), `dashboardEditor` i18n namespace (42 keys) |
| **react-grid-layout** dependency + CSS imports | **REMOVE** | `package.json`, `main.tsx` (2 CSS imports), `index.css` grid comment |
| **`connectionStore.ts`** | **REPLACE** with multi-instance store | login flow, `client.ts`, `websocket.ts`, TopBar, SettingsPage, every `useConnectedQuery` gate |
| **`SettingsPage.tsx`** + route `/admin/settings` | **MOVE** to global `/settings` | App.tsx (lift out of `/admin`), Sidebar link; drop the dashboard-layout import/export section (belongs to removed dashboardStore) |

**Keep-as-is:** configStore, themeStore, the entire API layer, all types
except `dashboard.ts`, all lib modules, all wizard components, all admin
sub-editors, charts, EventLogTerminal, DetailPageParts, all monitor pages
(rework DashboardPage's card-driven layout to a fixed/curated layout after
dashboardStore removal), DriversPage/DriverDetailPage/TransportsPage/
TransportDetailPage/RulesPage/WriteControlPage/ConfigCenterPage/TopologyPage/
DiagnosticsPage, ConnectionPage (rework for multi-instance).

**WebSocket usage summary** (5 consumers of `CoreCWebSocket`):
`/traffic` (TrafficChart), `/memory` (MemoryChart), `/logs` (EventLogTerminal
+ AlertsPage), `/tags/stream` (TagExplorerPage).
