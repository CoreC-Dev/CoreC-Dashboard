# Performance & Reliability Audit (subagent: 6e3cf207)

## Summary
Audited full `src/` tree of React 19 + Vite 8 + TS + Zustand + @tanstack/react-query dashboard for IIoT ("CoreC") backend with real-time WebSocket streams, charts, Monaco config editor, xterm terminal.

**Overall: unusually well-engineered for perf/reliability.** Highest-risk streaming paths already hardened:
- `CoreCWebSocket` (`api/websocket.ts`): exponential backoff + ±20% jitter, max-retry cap (10), fixed-size ring-buffer rate limiter (500 msg/s, O(1), zero alloc), upgrade-rejection detection, full handler-nulling cleanup in `destroy()`.
- `TrafficChart`/`MemoryChart`: cap sliding windows at 25 points, clean up sockets on unmount.
- `AlertsPage`: batches WS log events via rAF, caps `liveLogs` at 50.
- `TagExplorerPage`: virtualizes tag table (`@tanstack/react-virtual`), `memo`s rows, `useDeferredValue` for search, rAF-batches WS merges, caps trend samples at 100.
- `EventLogTerminal` (xterm): batched-flushes logs every 16ms (max 200/flush), disposes terminal + socket on unmount.
- `apiRequest`: 15s AbortController timeout; homepage probe 8s per-request timeouts + abort-on-unmount; only `setInterval` cleaned up.
- No unbounded buffers in stores, no leaked sockets, no N+1 fetch loops (detail hooks used one-at-a-time, never inside `.map`).

**No P0.** 2× P1, 10× P2. Gaps concentrated in (a) one unvirtualized tag list in a dialog, (b) one untimeouted fetch, (c) several unmemoized per-render computations on polled pages, (d) form-mode zod validation running per-keystroke.

## Findings

- **Title**: Driver "View Tags" dialog renders the full tag list without virtualization or a row cap
- **Location**: `src/features/admin/DriversPage.tsx:480,522`
- **Category**: 性能
- **Severity (suggested)**: P1
- **Evidence**: `const tags = tagsData?.tags ? Object.values(tagsData.tags) : []` then `{tags.map((tag) => { … })}` with no `.slice` and no `useVirtualizer`. Sibling `DriverDetailPage.tsx:717` explicitly caps at `tags.slice(0, 200)` and `TagExplorerPage` virtualizes same data — this dialog is inconsistent outlier. IIoT PLC drivers routinely carry 500–5000 tags; opening dialog mounts that many `<tr>` nodes at once.
- **Fix suggestion**: Cap with `tags.slice(0, 200)` (matching DriverDetailPage) or virtualize `<tbody>` with `@tanstack/react-virtual` (already a dep).
- **Behavior impact**: 无

- **Title**: pprof download uses a raw `fetch` with no timeout / AbortController — can hang forever
- **Location**: `src/features/admin/DiagnosticsPage.tsx:149`
- **Category**: 可靠性
- **Severity (suggested)**: P1
- **Evidence**: `const res = await fetch(url, { headers: { Authorization: … } })` — no `signal`, no `AbortController`, no per-call timeout. `trace?seconds=5` and `profile?seconds=5` profiles block server-side ≥5s; hung/unreachable CoreC leaves promise pending indefinitely, `pprofLoading` stays set, spinner never clears. Every other fetch (apiRequest, useHomepageProbe) has timeout; this bypasses wrapper.
- **Fix suggestion**: Route through `apiRequest` (15s default, overridable timeoutMs) or wrap fetch in AbortController with generous timeout (e.g. 30s for 5s CPU/trace profiles) and abort on dialog unmount.
- **Behavior impact**: 无

- **Title**: Form-mode config validation runs full zod `validateFullConfig` on every keystroke (no debounce)
- **Location**: `src/features/admin/ConfigCenterPage.tsx:190` + `src/hooks/useConfigValidation.ts:28-34`
- **Category**: 性能
- **Severity (suggested)**: P2
- **Evidence**: `useConfigValidation()` subscribes to `workingConfig` and runs `validateFullConfig(workingConfig)` inside `useMemo([workingConfig])`. In form view, `GlobalConfigEditor`/`NodeConfigEditor` call `updateGlobalField(...)` on every `onChange`, producing new `workingConfig` ref per keystroke → whole-config zod traversal fires synchronously per keypress. YAML diff preview correctly debounced (`debouncedYaml = useDebouncedValue(yamlContent, 300)` :201), but validation is not. Large config → input lag.
- **Fix suggestion**: Debounce validation input — `useDebouncedValue(workingConfig, 150-300)` fed into validateFullConfig, or run in `useDeferredValue`/setTimeout-debounced effect — mirroring diff-preview pattern.
- **Behavior impact**: 无

- **Title**: AlertsPage dead-letter list rendered without virtualization or a cap
- **Location**: `src/features/monitor/AlertsPage.tsx:340`
- **Category**: 性能
- **Severity (suggested)**: P2
- **Evidence**: `{deadLetters.map((entry) => { … })}` renders one card per dead letter with no `.slice` and no virtualizer. `deadLetters` from `useDeadLetters()` (polled every 4s). Dead-letter queue size backend-controlled; large backlog (write storms to downed transport) mounts unbounded DOM nodes, re-renders all every 4s.
- **Fix suggestion**: Cap rendered entries (e.g. `.slice(0, 100)` with "showing N of M" note) or virtualize. Live-log feed above already capped at 50 — apply same discipline.
- **Behavior impact**: 无

- **Title**: WriteControlPage dead-letter list: unmemoized per-render filter + unvirtualized render
- **Location**: `src/features/admin/WriteControlPage.tsx:137,531`
- **Category**: 性能
- **Severity (suggested)**: P2
- **Evidence**: `const visibleDeadLetters = deadLetters.filter((dl) => !clearedDlqKeys.has(dlqKeyOf(dl)))` recomputed every render (no useMemo), then `{visibleDeadLetters.map((dl) => …)}` renders all uncapped. `useDeadLetters()` polls every 4s → filter + full re-render repeats 15×/min regardless of change.
- **Fix suggestion**: Wrap filter in `useMemo([deadLetters, clearedDlqKeys])` and cap/virtualize rendered list.
- **Behavior impact**: 无

- **Title**: DiagnosticsPage `driverReads` / `transportPublishes` recomputed via `.filter` on every render
- **Location**: `src/features/admin/DiagnosticsPage.tsx:213-214`
- **Category**: 性能
- **Severity (suggested)**: P2
- **Evidence**: `const driverReads = metrics.filter((m) => m.name === 'corec_driver_read_total')` and `transportPublishes = metrics.filter(...)` in render body, no useMemo. `metrics` from `useMetrics()` (polled every 12s); page also re-renders on autoRefresh toggle / manual refetch → O(n) scans re-run every poll even when metric set unchanged. (Sibling `metricsMap`/`histogramsMap` at :177/:179 ARE correctly memoized.)
- **Fix suggestion**: `useMemo(() => metrics.filter(...), [metrics])` for both, or derive from metricsMap/dedicated useMemo.
- **Behavior impact**: 无

- **Title**: TopologyPage: unmemoized `activeRules` filter + per-item connection-summary lookup inside `.map` (O(n²))
- **Location**: `src/features/admin/TopologyPage.tsx:34` (and driver/transport `.map` bodies)
- **Category**: 性能
- **Severity (suggested)**: P2
- **Evidence**: `const activeRules = rules.filter((r) => !r.disabled)` runs every render (adjacent `sortedRules` IS memoized, :35). Inside driver/transport render loops, `getDriverConnectionSummary(config, d.name)` / `getTransportConnectionSummary(config, tr.name)` called per item per render; each does `config.drivers.find(...)` (O(drivers)) → card row O(drivers²) per render. Page mounts 7 polled queries (5–30s intervals) → re-renders frequently.
- **Fix suggestion**: Memoize `activeRules`; precompute `Map<name, summary>` once per `config` via useMemo, look up by name in loop.
- **Behavior impact**: 无

- **Title**: DriversPage calls `getDriverConnectionSummary` per card per render (O(n²) finds)
- **Location**: `src/features/admin/DriversPage.tsx:205,327`
- **Category**: 性能
- **Severity (suggested)**: P2
- **Evidence**: Inside both `filteredConfigDrivers.map` and `drivers.map`, IIFE `const summary = getDriverConnectionSummary(workingConfig, drv.name)` / `getDriverConnectionSummary(parsedConfig, drv.name)` runs per card. Each call does `config.drivers.find(d => d.name === name)` → rendering N driver cards costs O(N²). `useDrivers()` polls every 15s and `workingConfig` changes on every wizard edit → re-runs regularly.
- **Fix suggestion**: Build useMemo'd `Map<driverName, summary>` from workingConfig/parsedConfig once, index into it in loop.
- **Behavior impact**: 无

- **Title**: AppShell subscribes to the entire `instances` array (broad Zustand selector)
- **Location**: `src/components/layout/AppShell.tsx:65`
- **Category**: 性能
- **Severity (suggested)**: P2
- **Evidence**: `const instances = useInstanceStore((s) => s.instances)` selects whole array. Any mutation producing new array ref — notably `setProbeResult` (maps instances on every probe) — re-renders entire shell + `<Outlet>` subtree. ConnectionProvider probe calls setProbeResult on mount; homepage probe updates instances every 15s. `InstanceCard` correctly memo'd with narrow selectors, but shell itself isn't.
- **Fix suggestion**: If AppShell only needs instance count/ids for switcher, select derived primitive (`useInstanceStore((s) => s.instances.map(i => ({id:i.id,name:i.name})))` with shallow-equality selector, or useShallow). Otherwise accept cost — bounded and infrequent inside instance route.
- **Behavior impact**: 无

- **Title**: Monaco editor core is fetched from a public CDN at runtime — offline/air-gapped + CSP dependency
- **Location**: `src/main.tsx:14`
- **Category**: 可靠性
- **Severity (suggested)**: P2
- **Evidence**: `loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs' } })` runs at startup; `@monaco-editor/react` lazily fetches Monaco core from jsDelivr when Config Center editor mounts. Tradeoff: Monaco bundle (~3-4MB) kept out of app chunk (good for first paint), but (a) first Config Center visit incurs CDN round-trip, (b) requires internet access + CSP `script-src`/`style-src` allow-list for jsdelivr (code comment warns), (c) air-gapped IIoT control network cannot load editor → blank Config Center.
- **Fix suggestion**: For IIoT deployments, self-host `monaco-editor`'s `min/vs` assets and point loader.config at local path (or use @monaco-editor/react loader with bundled workers). Keep CDN path as dev convenience behind env flag.
- **Behavior impact**: 变更行为

- **Title**: Homepage probe fires 5 parallel HTTP requests × N instances every 15s with no concurrency cap
- **Location**: `src/features/home/useHomepageProbe.ts:83-89,232`
- **Category**: 性能
- **Severity (suggested)**: P2
- **Evidence**: `probeInstance` issues `Promise.allSettled` of 5 fetches (`/`, `/stats`, `/tags`, `/rules`, `/configs/raw`) per instance; `probeAll` runs `list.map(...)` over all instances in parallel on `setInterval(probeAll, 15_000)`. For N saved instances = 5N requests every 15s across N backends. Each request has 8s timeout + abort-on-unmount (good), but no per-instance/global concurrency limit → large instance list (or slow backends) produces burst of 5N simultaneous sockets.
- **Fix suggestion**: Intentional for "simultaneous multi-instance monitor"; fine for typical N (<20). If large N expected, add small concurrency limit (p-limit style) or stagger per-instance probes. Low priority.
- **Behavior impact**: 无

- **Title**: WriteControlPage `clearedDlqKeys` Set grows unbounded in sessionStorage
- **Location**: `src/features/admin/WriteControlPage.tsx:124`
- **Category**: 性能
- **Severity (suggested)**: P2
- **Evidence**: `sessionStorage.setItem(DLQ_CLEARED_KEY, JSON.stringify([...clearedDlqKeys]))` persists entire cleared-keys Set on every change. Since CoreC exposes no DELETE endpoint for dead letters, "Clear" is client-side hide-by-key; every cleared failure's composite key (`driver-tag-failed_at-attempts`) accumulates in Set and re-serialized on each clear. Long session with repeated write failures → Set + JSON string grows without bound.
- **Fix suggestion**: Cap Set (e.g. keep last 200 cleared keys, evict oldest) or clear stale keys when corresponding dead letter no longer appears in deadLetters.
- **Behavior impact**: 无

## Positive notes (no action needed)
`vite.config.ts` manualChunks splitting thorough (recharts/d3, react, query, radix, lightweight-charts, xterm, js-yaml, zod, i18n, rhf, monaco all split); `App.tsx` lazy-loads every route page; `ConnectionContext` uses primitive deps to avoid probe restart loops + per-instance QueryClient cache; `useStatusMessage`/`useCountUp`/`useDebouncedValue` all clean up timers/rAF; `useConfigHistory` capped at 10 snapshots; React Query staleTime 3s + per-hook refetchIntervals (4–30s) sane; all mutations invalidate right query keys.

## DONE
