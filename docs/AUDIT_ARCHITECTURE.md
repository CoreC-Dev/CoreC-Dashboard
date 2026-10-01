# CoreC-Dashboard Architecture Audit

**Scope:** React 19 + TS 7 frontend, 118 source files / ~22k LOC. Read-only
audit of component responsibility, state management, duplication, layering, and
testability. No source code was modified. Citations are `file:line`.

**Baseline:** `tsc -b` passes, 324 tests pass, `vite build` succeeds.

---

## Summary

The codebase is well-structured at the macro level: route-level lazy loading
with per-route `ErrorBoundary` (`App.tsx:67-74`), a clean API layer
(`api/client.ts` → `api/endpoints` → `api/hooks`), pure config helpers in
`lib/configYaml.ts`, and a single `configStore` that correctly delegates CRUD
to pure functions. The `configYaml.ts` entity-helper factory
(`configYaml.ts:61-90`) is a good example of DRY done right.

The problems are concentrated in three areas:

1. **Triplicated admin CRUD pages** — `DriversPage`, `TransportsPage`, and
   `RulesPage` repeat ~60 lines of identical store wiring, unsaved-changes
   banner, delete dialog, and apply-dialog boilerplate. The two detail pages
   repeat the same edit-config-section pattern.
2. **Two god components** — `ConfigCenterPage` (1027 LOC) and
   `TagExplorerPage` (1003 LOC) each mix data fetching, business logic, file
   I/O, and presentation in a single component.
3. **A module-singleton `configStore` that leaks across instances** — the
   store is never reset on instance switch, so dirty working-config edits
   from instance A surface in instance B's admin pages.

A latent `useEffect` bug in `AppShell` (mobile drawer never closes on route
change) and dead code (`Sidebar.tsx`, `TopBar.tsx`) round out the findings.

---

## Findings

### P1-1 · `configStore` is a module singleton that leaks across instances
**Location:** `src/stores/configStore.ts:159` (`create<ConfigStoreState>(...)`
at module scope); `src/contexts/ConnectionContext.tsx` (never references
`configStore`).

**Why it's a problem:** `configStore` holds `workingConfig` / `savedConfig` /
`dirty` for "the current config being edited." It is a single global Zustand
store. `ConnectionProvider` correctly resets the `activeConnection` singleton
on unmount (`ConnectionContext.tsx:95-97`) and provides a per-instance
`QueryClient` (`ConnectionContext.tsx:37-54`), but it does **not** reset
`configStore`. If an operator edits a driver in instance A (making `dirty =
true`), then navigates to instance B's Drivers page, instance B renders
instance A's `workingConfig.drivers` and shows a stale "unsaved changes"
banner. The `resetToEmpty()` calls in each page (`DriversPage.tsx:80-81`,
`TransportsPage.tsx:71`) only fire when `workingConfig` is `null`, so they do
not clear a leaked config.

**Refactor:** Make `configStore` instance-scoped. Either (a) move it into
`ConnectionContext` as a `useRef(create(...))` keyed by `instanceId` and
expose it via a `useConfigStore()` hook that reads from context, or (b) add a
`reset()` action and call it from `ConnectionProvider`'s mount effect
alongside `setActiveConnection`. Option (b) is the smaller change. Rationale:
the store's own header comment (`configStore.ts:1-22`) describes it as "the
config the user is currently editing" — that is inherently per-instance.

**Risk:** Medium. Touches every config-editing page's store access, but the
access surface is already uniform (`useConfigStore((s) => s.x)`).

---

### P1-2 · Triplicated CRUD page boilerplate (Drivers / Transports / Rules)
**Location:** `src/features/admin/DriversPage.tsx:51-63,146-170,425-440`;
`src/features/admin/TransportsPage.tsx:45-57,130-145,403-425`;
`src/features/admin/RulesPage.tsx:140-147,405-420,925-947`.

**Why it's a problem:** All three list pages repeat the same three blocks
byte-for-byte (modulo i18n key prefix and entity type):

- **Store wiring** — 9 identical `useConfigStore((s) => s.x)` selectors
  (`workingConfig`, `dirty`, `resetToEmpty`, `remove*`, `find*`,
  `getWorkingYaml`, `getSavedYaml`, `markSaved`) plus the
  `validationErrors` string-map (`DriversPage.tsx:60-63` ≈
  `TransportsPage.tsx:54-57` ≈ `RulesPage.tsx` equivalent).
- **Unsaved-changes banner** — the same ~25-line `dirty && (...)` JSX block
  with revert + apply buttons (`DriversPage.tsx:146-170` ≈
  `TransportsPage.tsx:130-145` ≈ `RulesPage.tsx:405-420`).
- **Apply-confirmation dialog** — the same `ConfigApplyConfirmationDialog`
  with identical `onConfirm` (`if (validationErrors) return; ... mutate({
  payload: yaml }, { onSuccess: () => { markSaved(); setApplyDialogOpen(false) } })`)
  (`DriversPage.tsx:425-440` ≈ `TransportsPage.tsx:403-425` ≈
  `RulesPage.tsx:925-947`).

This is ~180 lines of copy-paste. A bug fix to the apply flow (e.g. the
`RulesPage` variant invalidates `['rules']` on success at `:942` but the
other two don't invalidate their list queries) must be applied in three
places and has already diverged.

**Refactor:** Extract a `useEntityConfigEditor(entityKind)` hook returning
`{ workingConfig, dirty, validationErrors, revert, apply, isApplying }`, and
an `<UnsavedChangesBanner onApply={...} onRevert={...} />` presentational
component. Each page keeps only its entity-specific list rendering and
wizard trigger. Rationale: the three pages are the same algorithm with
different entity types — the shared hook captures the invariant part.

**Risk:** Low–Medium. Pure extraction; the existing tests
(`pages_render_smoke.test.tsx`) should catch regressions.

---

### P1-3 · `ConfigCenterPage` is a 1027-LOC god component
**Location:** `src/features/admin/ConfigCenterPage.tsx:161-1027`.

**Why it's a problem:** A single component owns: Monaco editor lifecycle,
YAML↔form bidirectional bridge (`handleImportYamlToForm` `:228`,
`handleSyncFormToYaml` `:244`), file upload/download (`:258-305`), template
loading (`:308`), one-time auto-load from server (`:215-222`), debounced LCS
diff (`:194`), change-history snapshots (`:199`), log-level PATCH with
optimistic UI + refetch re-sync (`:330-355`), hot-reload PUT (`:357-375`),
load-from-server (`:383-409`), pre-apply validation, and the apply
confirmation dialog. It holds 12 `useState`/`useRef` values and reads 6
store selectors. Business logic (`useConfigStore.getState().error` reads
inside event handlers at `:232,266,397` to defeat stale closures) is embedded
in the component body.

**Refactor:** Split into (1) `useConfigEditorState()` — owns `yamlContent`,
`mode`, auto-load, YAML↔form bridge, file I/O; (2) `useConfigApplyFlow()` —
owns validation, apply dialog, hot-reload, history snapshots; (3) keep
`ConfigCenterPage` as a layout shell composing `<ConfigYamlEditor>`,
`<ConfigFormView>`, `<ConfigHistoryPanel>`, `<ConfigLogLevelCard>`. The
`useStatusMessage` / `useConfigHistory` / `useDebouncedValue` extractions
already started this — finish it. Rationale: each concern has an independent
lifecycle and test surface.

**Risk:** Medium. High-touch page; split incrementally behind the existing
smoke test.

---

### P1-4 · `TagExplorerPage` is a 1003-LOC god component
**Location:** `src/features/monitor/TagExplorerPage.tsx:1-1003`.

**Why it's a problem:** One component owns: a `CoreCWebSocket` subscription
with a live-merge `tagMap`, `@tanstack/react-virtual` row virtualization,
per-row `lightweight-charts` trend dialogs, a write-value dialog with
`validateValue`, flash-on-update WAAPI animations (`TagRow` `:103-113`), and
search/filter state. The WS message handler, the virtualizer config, and the
chart lifecycle are all inline. This makes the page hard to test (the WS
client is constructed in the effect) and hard to reason about (a single
re-render touches virtualization, charting, and WS logic together).

**Refactor:** Extract `useTagStream()` (WS + merge map + flash ticks),
`<VirtualizedTagTable>` (rows + virtualizer), `<TagTrendDialog>` (chart
lifecycle), `<TagWriteDialog>` (write + validation). `TagExplorerPage`
becomes a composition root. Rationale: the WS merge logic and the chart
lifecycle have no shared state and can be tested in isolation.

**Risk:** Medium. The `TagRow` memoization (`:96`) is performance-critical;
preserve the `memo` + stable-callback contract.

---

### P1-5 · `useHomepageProbe` bypasses the API layer
**Location:** `src/features/home/useHomepageProbe.ts:56-81` (raw `fetch` +
manual `Bearer` header + own `fetchWithTimeout`); compare
`src/api/client.ts:41-109` (`apiRequest` with timeout, auth, error mapping).

**Why it's a problem:** The homepage probes **all** instances in parallel,
but `apiRequest` reads from the `activeConnection` singleton
(`activeConnection.ts:19`), which holds only one. So `useHomepageProbe`
re-implements fetch+timeout+auth from scratch, duplicating `api/client.ts`
and drifting from its error/timeout semantics. The probe also hand-shapes
the `lastKnownInfo` stats object (`:89-110`) with the same structure
declared in `instanceStore.ts:26-76` — a second copy of the stats type.

**Refactor:** Add a parameterized `apiRequestFor(instance, path, options)`
that takes an explicit `{ baseUrl, secret }` instead of reading the
singleton, and have `apiRequest` delegate to it with
`getActiveConnection()`. `useHomepageProbe` then calls
`apiRequestFor(instance, '/stats')` etc. Rationale: one fetch implementation,
shared timeout/error semantics, and the singleton becomes a convenience
wrapper rather than a constraint that forces callers to bypass the layer.

**Risk:** Low. Additive change; `apiRequest`'s existing callers are
unaffected.

---

### P1-6 · `DriverEditConfigSection` / `TransportEditConfigSection` are near-identical
**Location:** `src/features/admin/DriverDetailPage.tsx:328-409`;
`src/features/admin/TransportDetailPage.tsx:325-404`.

**Why it's a problem:** Both are ~80-line components with the same shape:
`useState(open/values/statusMsg)` → `useEffect` pre-fill from `rawYaml`
(`DriverDetailPage.tsx:347-364` ≈ `TransportDetailPage.tsx:344-359`) →
`useMemo(generatedYaml)` → `handleGenerateAndReload` try/catch
(`:373-385` ≈ `:368-380`) → `<EntityEditConfigCard {...} />`. They differ
only in the field-table constant, the YAML builder, and the
`configValueToString` special cases. The shared shell
(`EntityEditConfigCard` in `DetailPageParts.tsx:117`) was already extracted;
the remaining per-entity logic is the boilerplate around it.

**Refactor:** Extract `useEntityEditConfig({ fields, buildYaml, entityName,
valueToString })` returning `{ values, generatedYaml, statusMsg, setField,
handleReload }`, and render `<EntityEditConfigCard>` from each page with
only the field table + builder. Rationale: the effect, memo, and handler
are structurally identical; only the pure builder differs.

**Risk:** Low. The `EntityEditConfigCard` extraction already proves the
pattern works.

---

### P2-1 · `AppShell` mobile-drawer effect has stale empty dependencies
**Location:** `src/components/layout/AppShell.tsx:105-107`.

**Why it's a problem:** The effect is commented "Close mobile drawer on
route change" but has `[]` deps, so it runs only on mount. The mobile drawer
never closes when navigating between routes on a phone. `location` is already
in scope (`AppShell.tsx:68`); the dependency is simply missing.

**Refactor:** Add `location.pathname` to the dependency array:
`useEffect(() => { setMobileOpen(false) }, [location.pathname])`.

**Risk:** Trivial.

---

### P2-2 · `InstanceCard` embeds transport-direction business logic
**Location:** `src/features/home/InstanceCard.tsx:75-90`.

**Why it's a problem:** A `memo`'d presentational card classifies transports
as input/output/bidir/ambiguous with a name heuristic
(`/sub|in|from/i.test(tr.name)` at `:89`). This is domain classification
logic that belongs in `lib/` (where `connectionInfo.ts` already lives
similar summaries), not in a card component. It is untestable in isolation
and will diverge from any other place that needs the same classification.

**Refactor:** Move `classifyTransportDirection(stats)` to
`lib/connectionInfo.ts` (or a new `lib/topology.ts`) and unit-test it;
`InstanceCard` calls the pure function.

**Risk:** Low.

---

### P2-3 · Dead code: `Sidebar.tsx` and `TopBar.tsx` are unused, `AppShell` re-inlines their nav
**Location:** `src/components/layout/Sidebar.tsx` (80 LOC, unimported);
`src/components/layout/TopBar.tsx` (260 LOC, unimported);
`src/components/layout/AppShell.tsx:116-129` (inline `monitorItems` /
`adminItems` nav arrays).

**Why it's a problem:** `AdminLayout` and `MonitorLayout` both render
`AppShell` directly (`AdminLayout.tsx:4`, `MonitorLayout.tsx:4`), so
`Sidebar`/`TopBar` are dead. `AppShell` then re-implements the same nav
groupings inline that `Sidebar.tsx:13-39` already declares — an abandoned
extraction that left two stale copies of the nav structure. Changes to nav
items must be made in `AppShell`, and the dead files silently rot.

**Refactor:** Delete `Sidebar.tsx` and `TopBar.tsx`. (If a split layout is
ever needed again, extract `AppShell`'s nav arrays into a shared
`navConfig.ts` rather than a dead component.)

**Risk:** Trivial (deletion of unimported files).

---

### P2-4 · Wizard "reset on open" anti-pattern duplicated across three wizards
**Location:** `src/features/admin/DriverWizard.tsx:148-160`;
`src/features/admin/TransportWizard.tsx:109-126`;
`src/features/admin/RuleWizard.tsx:152-165`.

**Why it's a problem:** All three wizards reset form state when `open`
transitions false→true using the `lastOpen` + setState-during-render pattern
(`const [lastOpen, setLastOpen] = useState(open); if (open && !lastOpen) {
setLastOpen(true); reset(...) }`). This is a recognized React anti-pattern
(setState during render) that works but is fragile, and it is copy-pasted
three times with per-wizard field lists inlined.

**Refactor:** Extract `useResetOnOpen(open, resetFn)` that wraps the
`lastOpen` guard, or convert to a `useEffect` keyed on `open`. Pass the
per-wizard initial values as a factory. Rationale: centralizes the
transition logic and removes the render-phase setState.

**Risk:** Low.

---

### P2-5 · `validationErrors` string-mapping duplicated in four places
**Location:** `src/features/admin/DriversPage.tsx:60-63`;
`src/features/admin/TransportsPage.tsx:54-57`;
`src/features/admin/RulesPage.tsx` (same shape);
`src/features/admin/ConfigCenterPage.tsx:182-185`.

**Why it's a problem:** The expression
`validation.hasConfig && !validation.valid ? validation.errors.map((e) =>
\`${e.path}: ${e.message}\`) : undefined` is repeated. A change to the error
string format must be applied in four places.

**Refactor:** Add `useValidationErrorStrings()` to
`hooks/useConfigValidation.ts` returning the `string[] | undefined` directly.

**Risk:** Trivial.

---

## Recommended Refactors (prioritized)

| # | Change | Severity | Effort | Impact |
|---|--------|----------|--------|--------|
| 1 | Reset `configStore` on instance switch (P1-1) | P1 | S | Fixes a latent cross-instance data-leak bug |
| 2 | Extract `useEntityConfigEditor` + `<UnsavedChangesBanner>` (P1-2) | P1 | M | Removes ~180 LOC of triplicated boilerplate |
| 3 | Parameterize `apiRequest` for multi-instance probing (P1-5) | P1 | S | One fetch implementation; unblocks future multi-instance features |
| 4 | Extract `useEntityEditConfig` for detail pages (P1-6) | P1 | S | Removes ~80 LOC of duplicated edit-section logic |
| 5 | Decompose `ConfigCenterPage` into hooks + sub-components (P1-3) | P1 | L | Testable config-editing concerns; smaller render surface |
| 6 | Decompose `TagExplorerPage` into stream/table/chart/dialog (P1-4) | P1 | L | Testable WS + charting; preserves memoization |
| 7 | Fix `AppShell` mobile-drawer effect deps (P2-1) | P2 | XS | Correct UX bug |
| 8 | Delete `Sidebar.tsx` / `TopBar.tsx` dead code (P2-3) | P2 | XS | Removes 340 LOC of rot |
| 9 | Extract `useResetOnOpen` for wizards (P2-4) | P2 | S | Removes render-phase setState anti-pattern |
| 10 | Move transport classification to `lib/` (P2-2) | P2 | S | Testable domain logic |
| 11 | Extract `useValidationErrorStrings` (P2-5) | P2 | XS | Single error-format source |

Effort: XS < 1h, S = 1–3h, M = 1–2d, L = 3–5d.

---

## Open Questions

1. **Is multi-instance editing a real workflow?** P1-1 (configStore leak) is
   only user-visible if operators switch between instances with unsaved
   edits. If the product is effectively single-instance-per-session, the fix
   is lower priority. Confirm with product.
2. **Should `configStore` be per-instance or global-with-reset?** The
   per-instance option (move into `ConnectionContext`) is cleaner but means
   every config-editing page must consume the store via context instead of
   the module hook — a larger blast radius. The global-with-reset option is
   pragmatic. Which is preferred?
3. **`ConfigCenterPage` form-vs-YAML mode:** the YAML↔form bridge
   (`:228-253`) bidirectionally syncs `yamlContent` and `configStore`. Is
   the structured form view (`GlobalConfigEditor`, `NodeConfigEditor`,
   `RuleGroupEditor`, `RuleProviderEditor`) actively used, or is YAML the
   primary editing surface? If form mode is secondary, P1-3 can be scoped
   down.
4. **`TagExplorerPage` WS rate limiting:** the `CoreCWebSocket` already
   drops messages above 500/s (`websocket.ts:25`), and `EventLogTerminal`
   adds a 16ms flush buffer (`EventLogTerminal.tsx:82-95`). Does
   `TagExplorerPage` need its own backpressure, or can it rely on the socket
   cap? This affects the P1-4 decomposition (whether the stream hook owns
   buffering).
5. **`apiRequestFor` vs. a multi-connection store:** P1-5 proposes
   parameterizing `apiRequest`. An alternative is making `activeConnection`
   a map keyed by instance ID. The parameterized approach is simpler; the
   map approach would also let background probes share the API layer's
   error mapping. Preference?
