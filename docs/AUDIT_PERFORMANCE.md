# CoreC-Dashboard — Frontend Performance Audit

**Scope:** Read-only audit of React 19 + TS + Vite 8 (rolldown) build, runtime re-render/polling/bundle behavior. No source modified.
**Date:** 2025-10-01 · **Baseline:** tsc + 324 tests + build all green.

---

## Summary

The app is well-structured (route-level `React.lazy` + `Suspense` + per-route `ErrorBoundary`, granular Zustand selectors, `memo`'d charts/rows, rAF-batched WS streams, manualChunks vendor splitting). The dominant problems are **bundle-granularity artifacts** that bloat the homepage critical path, and a **homepage probe** that fans out N×5 requests + synchronous YAML parses on a raw `setInterval`, bypassing TanStack Query. Five concrete findings follow; the top one removes ~104 kB gzip from the default route.

---

## Findings

### F1 — P0 · Homepage eagerly loads the 365 kB recharts/d3 vendor chunk (it has no charts)

**(a) Location**
- `vite.config.ts:41` — `manualChunks` forces all `recharts` + `d3-*` into one indivisible `vendor-recharts` chunk.
- Build artifact (verified): the homepage lazy chunk `InstancePanel-*.js` statically imports the shared chunk `instanceStore-*.js`, which in turn has a **static** ESM import of `vendor-recharts-*.js`:
  ```
  InstancePanel-*.js   →  import{...} from "./instanceStore-C9Od-P9k.js"
  instanceStore-*.js   →  import{d as n,u as r} from "./vendor-recharts-B_tvIn7T.js"
  ```
- No source file outside `src/components/charts/TrafficChart.tsx` / `MemoryChart.tsx` imports recharts; both are used only by `DashboardPage`. The `instanceStore` chunk references just **2 symbols** (`d`,`u`) from the recharts chunk — rolldown hoisted a shared helper into the recharts bucket, and because the whole lib is one chunk, those 2 symbols drag 365 kB along.

**(b) Impact**
- The `/` route (default landing page, most-visited) downloads + parses **365 kB raw / ~104 kB gzip** of recharts+d3 on first paint, for zero charts. This is the single largest item on the homepage critical path and roughly doubles the homepage's JS payload.

**(c) Fix**
1. Identify the hoisted helper: `pnpm vite build --debug` / `rollup-visualizer` to see which module in the `instanceStore` chunk imports the recharts symbol.
2. Robust fix: keep that shared helper **out** of the recharts bucket — either inline it at its call sites, or split `manualChunks` so d3-scale/format helpers are a separate small chunk distinct from recharts chart components. Then the homepage shared chunk no longer references `vendor-recharts`.
3. Quick mitigation: refine the `manualChunks` function so the offending helper module returns `undefined` (its own tiny chunk) instead of falling into `vendor-recharts`.

**(d) Risk:** Low — chunking-only; no runtime behavior change. Verify `DashboardPage` still loads recharts and renders charts after the change.

---

### F2 — P1 · Homepage probe fires N×5 requests every 15 s + synchronous YAML parse, bypassing TanStack Query

**(a) Location**
- `src/features/home/useHomepageProbe.ts:75-81` — per instance, 5 parallel `fetch` (GET `/`, `/stats`, `/tags`, `/rules`, `/configs/raw`).
- `src/features/home/useHomepageProbe.ts:152` — `parseConfigYaml(rawText)` (js-yaml `load`) on the main thread, per instance, every cycle.
- `src/features/home/useHomepageProbe.ts:222` — `setInterval(probeAll, 15_000)` (raw interval, not TanStack Query).
- `src/features/home/useHomepageProbe.ts:191-228` — cleanup sets `active=false` + clears interval, but in-flight `fetchWithTimeout` calls are **not aborted** (each has its own 8 s timer); they complete and are discarded.

**(b) Impact**
- N instances → **5N requests every 15 s**. 10 instances = 50 requests/cycle, all fired in one burst (no stagger).
- Each successful `/configs/raw` is parsed synchronously with js-yaml: ~5-20 ms per large plant config → up to a **50-200 ms long task** per cycle for 10 instances.
- Bypasses TanStack Query: no request dedupe, no `staleTime`, no integration with the per-instance `QueryClient` cache, no `refetchOnWindowFocus` gating. In-flight fetches on unmount waste bandwidth (up to 8 s of lingering requests).

**(c) Fix**
1. Move the probe into TanStack Query (`useQueries` with per-instance keys) to inherit dedupe, `staleTime`, and cache-aware refetch.
2. Make `/configs/raw` + YAML parse **conditional and lazy**: only fetch/parse once per instance on first success (cache the parsed connection summaries), not every 15 s. The connection address rarely changes.
3. Stagger probes per instance (jitter the interval) to flatten the 5N burst.
4. Abort in-flight requests on unmount via a shared `AbortController` per `probeAll` cycle.
5. At minimum: raise `REFRESH_INTERVAL` to 30 s and gate the `/configs/raw` fetch on `result.stats` already existing.

**(d) Risk:** Medium — cadence change affects "live" feel; moving to TanStack Query changes invalidation semantics. Land incrementally (stagger + conditional raw fetch first).

---

### F3 — P1 · Homepage loads vendor-config (193 kB / 57 kB gzip) for probe YAML parse + dialog zod

**(a) Location**
- `src/features/home/InstancePanel.tsx:28` → `useHomepageProbe` → `src/features/home/useHomepageProbe.ts:2` `import { parseConfigYaml } from '@/lib/configYaml'` → `src/lib/configYaml.ts:12` `import { dump, load } from 'js-yaml'`.
- `src/features/home/InstancePanel.tsx:27` → `InstanceDialog.tsx:5` `import { z } from 'zod'` + `:1` `@hookform/resolvers/zod`.
- `vite.config.ts:48` — `js-yaml` and `zod` share one `vendor-config` chunk.

**(b) Impact**
- The homepage eagerly loads the **193 kB / 57 kB gzip** `vendor-config` chunk on first paint, purely so the probe can parse YAML and the add/edit dialog can build a zod schema. Neither is needed before user interaction (the dialog is closed by default; the raw-config parse is best-effort enrichment).

**(c) Fix**
1. Dynamic-import `configYaml` inside the raw-config branch of `probeInstance` (`await import('@/lib/configYaml')`) so js-yaml moves to a dynamically-loaded chunk, off the homepage critical path.
2. Split `vendor-config` into separate `vendor-jsyaml` and `vendor-zod` chunks in `manualChunks` so each route loads only what it needs.
3. Best: combined with F2 — drop the periodic `/configs/raw` parse from the homepage entirely; then js-yaml never loads on `/`.

**(d) Risk:** Low-Medium — dynamic import of `configYaml` is mechanical; splitting vendor chunks is config-only.

---

### F4 — P2 · configStore uses JSON.stringify deep-equality on every commit (every config edit)

**(a) Location**
- `src/stores/configStore.ts:149-157` — `configEqual` via `JSON.stringify(a) === JSON.stringify(b)`.
- `src/stores/configStore.ts:163-164` — `commit()` calls `configEqual(next, get().savedConfig)` to recompute `dirty`.
- Every `upsertDriver`/`upsertTransport`/`upsertRule*`/`updateGlobalField`/`updateNodeField` routes through `commit` (`:201-313`).

**(b) Impact**
- Each config edit serializes the **entire** working config AND saved config to JSON strings and compares them. `updateGlobalField`/`updateNodeField` fire on every field change (keystroke-driven inputs). For a large plant config (hundreds of tags/drivers) this is a synchronous O(size) string build per edit — potentially 10-50 ms long tasks during typing.

**(c) Fix**
- Track dirty via reference inequality (`workingConfig !== savedConfig`) for the fast path, and only run deep equality on demand (e.g., when rendering the dirty badge). Or swap to `fast-deep-equal` (order-insensitive, faster than double `JSON.stringify`). Or debounce field updates before committing.

**(d) Risk:** Low — `fast-deep-equal` is order-insensitive (more correct than the current order-sensitive `JSON.stringify` compare).

---

### F5 — P2 · AppShell fake progress bar always animates on mount; DashboardPage runs 4 REST polls + 2 WS, recharts re-renders every 1 s

**(a) Location**
- `src/components/layout/AppShell.tsx:88-98` — `useEffect([], …)` schedules 4 `setTimeout`s (30→70→100→0 %) on every mount. AppShell backs all `/corec/:id/*` routes (MonitorLayout/AdminLayout both render it).
- `src/features/monitor/DashboardPage.tsx:41-44` — `useStats` (5 s), `useDrivers` (5 s), `useTransports` (5 s), `useDeadLetters` (4 s): 4 background polls with desynchronized 4 s/5 s intervals.
- `src/components/charts/TrafficChart.tsx:40` + `MemoryChart.tsx:26` — two persistent WebSockets (`/traffic`, `/memory`) at 1 s interval; each message → `setData` → recharts SVG re-render.

**(b) Impact**
- Progress bar: fires on every instance entry even when the page chunk is already cached (misleading 500 ms flash); 4 timers + 4 `setState`. Minor jank, not a bottleneck.
- Dashboard: 4 REST intervals + 2 WS = 6 concurrent background data sources. Charts are `memo`'d (good — the 5 s `useStats` poll does **not** re-render them), but recharts re-lays-out SVG once per second per chart — the dominant steady-state CPU cost on the dashboard.

**(c) Fix**
- Progress bar: gate on real Suspense/`useTransition` loading state, or remove (per-route `LoadingFallback` already covers chunk loading).
- Polls: align all dashboard intervals to 5 s (drop the 4 s dead-letter cadence) to avoid desync, or coalesce into one combined endpoint if the API allows.
- Charts: throttle `setData` to every 2 s, or migrate traffic/memory to `lightweight-charts` (already a dep, canvas-based, far cheaper to update than recharts SVG).

**(d) Risk:** Low for polling alignment + progress-bar removal; larger for chart-lib swap.

---

### F6 — P2 · Homepage probe `setProbing` loop does N synchronous store writes per cycle

**(a) Location** · `src/features/home/useHomepageProbe.ts:199-201` (mark all true) + `:214` (set false in finally); `src/stores/instanceStore.ts:179-182` `setProbing` does `set({ probing: { ...cur, [id]: probing } })`.

**(b) Impact** · 2N store writes per 15 s cycle, each a new `probing` object + notification. Blast radius is contained (InstanceCard selects `probing[id]` as a primitive → only the affected card re-renders), but the N synchronous `set()` calls in the "mark all" loop are unbatched → N notification passes in one tick. Noticeable at 20+ instances.

**(c) Fix** · Add a `setProbingBatch(ids, value)` action that updates all ids in a single `set()`, or fold the batch into one `setState` updater.

**(d) Risk:** Low.

---

## Prioritized Fixes

| # | Sev | Effort | Action | Expected win |
|---|-----|--------|--------|--------------|
| 1 | P0 | S-M | **F1** — remove recharts from homepage shared chunk (split helper out of `vendor-recharts`) | −104 kB gzip on `/` first paint |
| 2 | P1 | M | **F3** — dynamic-import `configYaml` in probe; split `vendor-config` into jsyaml/zod | −57 kB gzip on `/` (partial; full win needs #3) |
| 3 | P1 | M-L | **F2** — move probe to TanStack Query; make `/configs/raw`+parse conditional/once; stagger; abort on unmount | −5N req/15s, removes 50-200 ms long task, dedupe+cache |
| 4 | P2 | S | **F4** — replace `JSON.stringify` equality with ref-check + on-demand deep equal | removes 10-50 ms long task per config edit |
| 5 | P2 | S | **F5** — remove/gate AppShell progress bar; align dashboard poll intervals | removes misleading flash; fewer concurrent polls |
| 6 | P2 | S | **F6** — batch `setProbing` in the probe loop | fewer notification passes at scale |
| 7 | P2 | M | **F5** — throttle chart `setData` or migrate to lightweight-charts | lower steady-state CPU on dashboard |

---

## Bundle Notes

- **The 176 kB `instanceStore` chunk** is mostly **i18next + react-i18next** (not in `manualChunks`, so bundled into the shared chunk) plus the instance store + form glue. `i18next` is ~572 kB installed. **Recommend:** add `i18next`/`react-i18next` to `manualChunks` as a `vendor-i18n` chunk for caching clarity.
- **`react-hook-form` + `@hookform/resolvers`** are also absent from `manualChunks` and land in shared chunks. `InstanceDialog` (homepage) pulls react-hook-form + zodResolver. Consider splitting.
- **Monaco** is correctly deferred: `vendor-monaco` is only **7.8 kB** (loader shim); the editor core loads from CDN on the `ConfigCenterPage` route. Good.
- **xterm** is correctly split (`vendor-xterm` 332 kB) and only loaded by `EventLogTerminal` (Diagnostics/Config). Good.
- **lightweight-charts** is in `vendor-charts` (163 kB), only loaded by `TagExplorerPage`. Good — and a candidate to replace recharts on the dashboard (F5).
- **`vendor-config` (193 kB)** combines js-yaml + zod serving different needs (js-yaml: homepage probe + config pages; zod: InstanceDialog + config schema). Splitting (F3) lets the homepage shed both if the probe parse is also deferred.
- **Recharts on homepage (F1)** is the highest-leverage bundle fix: 104 kB gzip removed from the default route with a chunking-only change.
- **`ConnectionContext`** correctly memoizes its context value (`ConnectionContext.tsx:161-171`) and uses primitive effect deps to avoid probe restart loops — no re-render issue found there.
- **`TagExplorerPage`** is well-optimized: `@tanstack/react-virtual` row virtualization, `memo`'d `TagRow` with stable `useCallback` handlers, rAF-batched WS merges, `useMemo`'s filtered/sorted list. No re-render concern found.
- **`AlertsPage`** uses rAF-batched WS log flushing and `useMemo`'s filters — good. Polls `useDeadLetters` (4 s) + `useRules` (5 s) + one `/logs` WS.
