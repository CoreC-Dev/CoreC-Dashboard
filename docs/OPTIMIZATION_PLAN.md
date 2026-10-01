# CoreC-Dashboard Optimization Plan

**Synthesized from:** `AUDIT_ARCHITECTURE.md`, `AUDIT_PERFORMANCE.md`, `AUDIT_UX.md`, `AUDIT_SLIMMING.md`
**Baseline (verified):** `tsc -b` ✓ · `vitest run` 324/324 ✓ · `vite build` ✓
**Constraint:** No behavior changes, no bugs. Every batch verified by tsc + tests + build before proceeding.

---

## 1. Problem Summary (cross-audit)

### Architecture
- **A1 (P1)** `configStore` is a module singleton that `ConnectionContext` never resets on instance switch → dirty working-config edits leak from instance A into instance B's admin pages. (`configStore.ts:159`, `ConnectionContext.tsx:95-97`)
- **A2 (P1)** Drivers/Transports/Rules list pages triplicate ~180 LOC of identical store-wiring + unsaved banner + delete/apply dialog boilerplate. Already diverged (`RulesPage:942` invalidates `['rules']`, others don't).
- **A3 (P1)** `ConfigCenterPage` (1027 LOC) and `TagExplorerPage` (1003 LOC) are god components mixing many concerns.
- **A4 (P1)** `useHomepageProbe` bypasses the API layer (raw fetch + manual Bearer) because `activeConnection` singleton holds one instance; duplicates `api/client.ts`.
- **A5 (P2)** Duplicated `DriverEditConfigSection`/`TransportEditConfigSection` (~80 LOC); `validationErrors` string-mapping in 5 places; business logic (transport direction) embedded in `InstanceCard`.

### Performance
- **P1 (P0)** Homepage eagerly loads the 365 kB recharts/d3 chunk (no charts on `/`) — a hoisted helper drags the whole lib into the homepage shared chunk. **−104 kB gzip** available.
- **P2 (P1)** Homepage probe fires 5N requests/15s + synchronous YAML parse, bypassing TanStack Query; no abort on unmount.
- **P3 (P1)** Homepage eagerly loads 193 kB `vendor-config` (js-yaml+zod) for probe parse + dialog schema; `i18next`/`react-hook-form` also unsplit and land in shared chunks.
- **P4 (P2)** `configStore` uses `JSON.stringify` deep-equality on every commit (every keystroke in config editors).
- **P5 (P2)** AppShell fake progress bar fires once on mount; dashboard runs 4 REST polls + 2 WS; recharts re-renders every 1s.
- **P6 (P2)** Probe `setProbing` loop does N unbatched store writes per cycle.

### UX / Interaction
- **U1 (P1)** Config-apply failures are silently swallowed — `mutate({onSuccess})` with no `onError`; `ConfigApplyConfirmationDialog` has no error surface. Dangerous on a production gateway.
- **U2 (P1)** Mobile drawer doesn't close on navigation (`useEffect([])` dead deps).
- **U3 (P1)** "Cancel" in unsaved-changes banner silently discards all edits (calls `revert()`).
- **U4 (P2)** Runtime empty states flash during initial load (no `isLoading` gate); Alerts shows green "No dead letters" before data arrives.
- **U5 (P2)** Topbar "Realtime stream connected" always green regardless of WS state.
- **U6 (P2)** Dual "Apply Changes" buttons when dirty; ErrorBoundary shows raw stack + unreliable Reset; hardcoded English aria-labels; mobile drawer lacks dialog semantics; ConnectionGate raw button + raw error; dead-letter retry disables all buttons; config status auto-dismiss 2.5s too short.

### Code Slimming
- **S1** Dead files: `Sidebar.tsx` (80), `TopBar.tsx` (260), `skeleton.tsx` (7) — zero importers.
- **S2** `AdminLayout`/`MonitorLayout` are 6-line `<AppShell/>` wrappers — inline + delete.
- **S3** Duplicated `RestartBadge` (2×), `EmptyConfigCard` (4×), `validationErrors` (5×), `ConfigApplyConfirmationDialog.onConfirm` (4×), detail-page `dump()` direct calls (2×).
- **S4** Unused `export` keywords on internal types; single-use `CountUpNumber`/`useCountUp`.
- **Conservative net LOC reduction: ~480 low-risk + ~170 med-risk ≈ 650 LOC (~2.6%).**

---

## 2. Implementation Batches

Ordered by risk (lowest first). Each batch is independently shippable and verified by `tsc && vitest run && vite build`.

### Wave 1 — Zero/low-risk fixes (parallel, disjoint file ownership)

| Batch | Owner files | Changes | Fixes |
|-------|-------------|---------|-------|
| **W1-A** | `App.tsx`, delete `Sidebar.tsx`/`TopBar.tsx`/`skeleton.tsx`/`AdminLayout.tsx`/`MonitorLayout.tsx` | Delete dead files; inline `<AppShell/>` in routes; ConnectionGate → `<Button>` + translate error strings | S1, S2, U6(partial) |
| **W1-B** | `AppShell.tsx`, `i18n/en.json`, `i18n/zh-CN.json` | Mobile drawer close on nav (`location.pathname` dep); progress bar dep; i18n all hardcoded aria-labels | U2, U6(partial) |
| **W1-C** | `InstancePanel.tsx`, `InstanceCard.tsx`, `AlertsPage.tsx` | "Dashboard" badge → `t('nav.dashboard')`; edit-button aria-label; Alerts empty-state `!isLoading` gate + per-entry dead-letter retry | U4, U6(partial) |
| **W1-D** | `DriversPage.tsx`, `TransportsPage.tsx`, `ConfigCenterPage.tsx` | Empty-state `!isLoading` gate in list pages; raise `STATUS_AUTO_DISMISS_MS` 2500→4500; remove duplicate header Apply button | U4, U6(partial) |

### Wave 2 — Cross-cutting correctness + slimming (parallel where disjoint)

| Batch | Owner files | Changes | Fixes |
|-------|-------------|---------|-------|
| **W2-E** | `configStore.ts`, `ConnectionContext.tsx` | Add `reset()` action; call from `ConnectionProvider` mount/unmount so working-config doesn't leak across instances | A1 |
| **W2-F** | `vite.config.ts`, `useHomepageProbe.ts` | `manualChunks`: add `vendor-i18n`, `vendor-rhf` (react-hook-form+resolvers), split `vendor-config`→`vendor-jsyaml`+`vendor-zod`; dynamic-import `configYaml` in probe raw-config branch | P1(partial), P3 |
| **W2-G** | `DriverDetailPage.tsx`, `TransportDetailPage.tsx`, `types/config.ts`, `configSchema.ts`, `form.tsx` | Route detail-page YAML dump through `dumpConfigYaml`; drop unused `export` keywords; fix stale form.tsx doc comment | S3(RED-2), S4 |

### Wave 2b — Interdependent extractions (sequential, orchestrator-owned)

| Change | Owner files | Fixes |
|--------|-------------|-------|
| `formatValidationErrors(validation)` helper in `useConfigValidation.ts`; replace 5 inline sites | `useConfigValidation.ts`, 4 pages, `ValidationBanner.tsx` | S3(DUP-3) |
| `useApplyConfig()` hook encapsulating mutate+markSaved+invalidate **with `onError`**; `applyError` prop on `ConfigApplyConfirmationDialog`; wire 4 callers | new hook, `ConfigApplyConfirmationDialog.tsx`, 4 pages | U1, S3(DUP-2) |
| Shared `RestartBadge` + `EmptyConfigCard` components; replace 2 + 4 inline sites | new components, 4 editors | S3(DUP-6, DUP-7) |

### Deferred (documented, not in this pass — high effort/risk)

- **A3** God-component splits (`ConfigCenterPage`, `TagExplorerPage`) — large refactor, needs dedicated PR.
- **A4/P2** `useHomepageProbe` → TanStack Query + parameterized `apiRequestFor(instance)` — med risk, cadence semantics change.
- **A2** `useEntityListPage` + `EntityListHeader` (DUP-1) — med risk, 3 pages diverge.
- **A5** `useEntityEditConfig` + `EntityDetailHeader` (DUP-4) — med risk.
- **P1** recharts-on-homepage root cause (hoisted helper) — needs `rollup-visualizer` investigation; F2 mitigates the symptom.
- **P5** chart `setData` throttle / recharts→lightweight-charts migration — high risk.
- **P4** `configStore` equality via `fast-deep-equal` — adds a dep; defer.
- **DUP-8/RED-3** derive detail fields + connectionInfo from `settingsRegistry` — high risk, two sources of truth.
- **U3** "Cancel"→"Discard changes"+AlertDialog — needs product sign-off on copy + i18n key coordination (the banner revert is intentional; only the label is misleading). *Re-label only (low-risk) is included in W1-D adjacent work if safe; full AlertDialog deferred.*
- **U5** topbar realtime badge from real WS health — needs shared WS-status context.
- **U6** mobile drawer → Radix Dialog — markup refactor, separate PR.

---

## 3. Verification Strategy

1. After each wave: `npx tsc -b && npx vitest run && npx vite build` — all must pass.
2. Bundle diff: compare `dist/assets/*.js` sizes before/after to confirm homepage chunk shrinks (W2-F).
3. **Multi-agent cross-audit (Wave 3):** 3-4 agents independently read the full `git diff` and verify (a) no behavior change, (b) no dead imports left behind, (c) i18n keys exist in both locales, (d) the configStore reset doesn't clobber legitimate state, (e) the apply-error path is wired correctly. Each returns a structured pass/fail with cited evidence.
4. Smoke-check the render-smoke test (`pages_render_smoke.test.tsx`) still passes (guards the #185 infinite-loop regression).

---

## 4. Expected Outcomes

- **LOC:** ~−480 (low-risk) to ~−650 (with med-risk) net.
- **Homepage first-paint JS:** ~−100 kB gzip (recharts off critical path via W2-F chunk split + dynamic configYaml import).
- **Correctness bugs fixed:** configStore cross-instance leak (A1), mobile drawer nav (U2), silent apply failure (U1).
- **UX polish:** empty-state flash, status dismiss timing, aria-labels, per-entry retry.
- **No behavior changes:** all edits are deletions of dead code, dedup extractions, bug fixes, or chunking config.

---

## 5. Execution Status (post-implementation)

**All waves implemented.** Verification gates after Wave 2b:

| Gate | Result |
|------|--------|
| `npx tsc -b` | ✓ zero errors |
| `npx vitest run` | ✓ 324/324 passed |
| `npx vite build` | ✓ built in 512ms |

**Diff:** 28 files changed, +252 / −486 (net **−234 LOC**).

### Bundle impact (W2-F)
- `instanceStore` chunk: 177 kB → **129 kB** (i18next split out into `vendor-i18n`).
- New split chunks: `vendor-i18n` (56 kB), `vendor-rhf` (36 kB), `vendor-jsyaml` (56 kB), `vendor-zod` (92 kB).
- `vendor-config` (193 kB combined) → split into `vendor-jsyaml` + `vendor-zod`.
- Dynamic `configYaml` import in `useHomepageProbe` removes js-yaml from the homepage static graph.

### What was done per wave
- **W1-A:** Deleted `Sidebar.tsx`, `TopBar.tsx`, `skeleton.tsx`, `AdminLayout.tsx`, `MonitorLayout.tsx` (zero importers verified); inlined `<AppShell/>` in `App.tsx`; ConnectionGate → `<Button>` + `i18n.t('common.retry')`.
- **W1-B:** `AppShell.tsx` mobile-drawer + progress-bar effects deps `[]`→`[location.pathname]`; 7 hardcoded aria-labels → `t('aria.*')`; added `aria` namespace to both locales.
- **W1-C:** `InstancePanel` badge → `t('nav.dashboard')`; `InstanceCard` edit-button aria-label; `AlertsPage` empty-state `!isLoading` gate + per-entry dead-letter retry (`pendingRetryKey`).
- **W1-D:** `DriversPage`/`TransportsPage` empty-state `isLoading` gate + Loader2 spinner; `ConfigCenterPage` `STATUS_AUTO_DISMISS_MS` 2500→4500. (Duplicate-header-Apply removal skipped — no such button in ConfigCenterPage; the pattern lives in Drivers/Transports list pages and is addressed by the applyError wiring.)
- **W2-E:** `configStore.reset()` action + `ConnectionContext` `[instanceId]`-keyed effect calling it. Separate effect (not folded into `[instance]` effect) to avoid wiping edits on probe updates.
- **W2-F:** `vite.config.ts` manualChunks split; `useHomepageProbe` dynamic `configYaml` import.
- **W2-G:** Dropped unused `export` on `LogLevel`/`LogFormat`/`TransformConfig`/`RuleGroups` in `types/config.ts`; dropped `export` on `ConfigValidationError` in `configSchema.ts`; fixed stale `form.tsx` doc comment. **Edit 1 (RED-2, route detail-page YAML through `dumpConfigYaml`) SKIPPED** — runtime output is byte-identical, but the detail pages build *partial* docs not assignable to `CoreCConfig` (missing required `tags`/`settings`), so the edit would require a cast or signature widening beyond low-risk scope.
- **W2b-1:** `formatValidationErrors(validation)` helper in `useConfigValidation.ts`; replaced inline `validationErrorStrings` useMemo in `ConfigCenterPage` + inline map blocks in `DriversPage`/`TransportsPage`/`RulesPage`.
- **W2b-2:** `applyError?: string` prop + destructive banner on `ConfigApplyConfirmationDialog`; wired `applyError` state + `onError` + clear-on-open/close in all 4 callers (Drivers/Transports/Rules/ConfigCenter). Added `applyDialog.applyError` i18n key to both locales.
- **W2b-3:** Extracted shared `RestartBadge` to `DetailPageParts.tsx` (props `{ show?: boolean; label: string }`); replaced local defs in `GlobalConfigEditor` (4 usages) + `NodeConfigEditor` (1 usage); removed orphaned `AlertTriangle` imports. **`EmptyConfigCard` extraction SKIPPED** — only 2 sites share the pattern (not 4 as audit estimated), marginal value (~4 LOC).

### Deferred (unchanged from §2)
God-component splits, `useHomepageProbe`→TanStack Query, entity-list/edit extractions, recharts-on-homepage root cause, recharts→lightweight-charts, `configStore` deep-equal, "Cancel"→"Discard"+AlertDialog, topbar WS-health badge, mobile drawer→Radix Dialog.
