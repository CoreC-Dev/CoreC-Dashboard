# CoreC-Dashboard — Performance Audit Report

**Stack:** React 19 + Vite 8 (rolldown) + TanStack Query v5 + Zustand v5 + recharts v3 + lightweight-charts v5 + xterm v6 + monaco-editor
**Build inspected:** `dist/assets/` (12 vendor chunks, 2.3 MB JS total; Monaco core 25 MB self-hosted at `/monaco/min/vs`)

---

## 1. Bundle / Chunking

### Finding 1.1 — recharts + lightweight-charts redundancy (MAJOR)
- **Files:** `vite.config.ts:204`, `src/components/charts/MemoryChart.tsx:3-11`, `src/components/charts/TrafficChart.tsx:3-11`, `src/hooks/useTrendChart.ts:2-7`
- **Evidence:** `vendor-recharts-*.js` = **364 KB** (largest chunk, includes d3 deps); `vendor-charts-*.js` (lightweight-charts) = **164 KB**. Both chart libraries ship in the same app.
- **Usage:** recharts renders only **2 simple charts** (MemoryChart = `LineChart`, TrafficChart = `AreaChart`) — both 25-point sliding windows with `isAnimationActive={false}`. lightweight-charts renders the TagExplorer trend chart (canvas, high-frequency).
- **Problem:** 364 KB of recharts+d3 for two trivial SVG line/area charts is a poor size-to-value ratio. lightweight-charts (already bundled) handles equivalent line/area charts on a `<canvas>` at a fraction of the cost and with better performance for streaming data.
- **Suggested fix:** Migrate MemoryChart and TrafficChart to `lightweight-charts` (`LineSeries` / `AreaSeries`), then remove `recharts` entirely. Expected impact: **−364 KB** gzip-uncompressed from the monitor route's graph, faster chart rendering (canvas vs SVG), and one fewer chart abstraction. If migration is too costly, at minimum lazy-load the charts so recharts isn't in the dashboard's critical path.
- **Note:** Both chart chunks are currently **eagerly loaded** by `DashboardPage` (the default `/monitor` route). Since `DashboardPage` is `lazy()`-split at the route level (`App.tsx:19-21`), recharts loads on first monitor entry — but it still blocks dashboard first paint.

### Finding 1.2 — manualChunks is well-structured (GOOD, with minor gaps)
- **File:** `vite.config.ts:202-219`
- **Evidence:** Function-form `manualChunks` splits 12 vendor groups. `chunkSizeWarningLimit: 500` (default) surfaces regressions. Largest chunks: recharts 364 KB, xterm 332 KB, react 253 KB, lightweight-charts 164 KB, radix 141 KB.
- **Good:** Heavy libs (xterm, monaco wrapper, rhf, zod, i18n, js-yaml) are isolated and only loaded by the routes that use them (all routes are `lazy()`-split in `App.tsx:13-54`).
- **Minor gap:** `lucide-react` is not in `manualChunks`; Vite auto-splits per-icon (e.g. `activity-czbN1Ee8.js` 263 B). This is fine and even optimal — no action needed.
- **Minor gap:** `clsx` / `tailwind-merge` / `class-variance-authority` (the `cn()` utility deps) are not split, but they're tiny and shared — correctly bundled into the index chunk.

### Finding 1.3 — Monaco loading strategy is correct (GOOD)
- **Files:** `src/main.tsx:14`, `vite.config.ts:124-167`, `src/components/admin/ConfigCenterYaml.tsx:117`
- **Evidence:** `loader.config({ paths: { vs: '/monaco/min/vs' } })` self-hosts the 25 MB Monaco core. The `@monaco-editor/react` wrapper is only 8 KB (`vendor-monaco-*.js`). Monaco is used only in `ConfigCenterYaml`, which lives behind the lazy `ConfigCenterPage` route — so the 25 MB of static Monaco assets are never fetched until the user opens Config Center. The `monacoSelfHostPlugin` copies assets to `dist/monaco/` at build time and serves them in dev.
- **Verdict:** No CDN dependency, air-gapped compatible, route-gated. Excellent.

### Finding 1.4 — index chunk is 152 KB (MINOR)
- **Evidence:** `dist/assets/index-BmInaicZ.js` = 152 KB. This is the app shell (router, ConnectionContext, AppShell, shared UI primitives, stores, i18n resources).
- **Note:** i18n resources (`en.json` + `zh-CN.json`) are bundled into `vendor-i18n` (57 KB) and the index chunk. Both locales load eagerly even though only one is active at a time. Consider lazy-loading the non-default locale. Minor.

---

## 2. Re-render Risks

### Finding 2.1 — DashboardPage re-renders every 4 s from dead-letter polling (MAJOR)
- **Files:** `src/features/monitor/DashboardPage.tsx:44`, `src/api/hooks/index.ts:131`
- **Evidence:** `useDeadLetters()` has `refetchInterval: 4000`. Every 4 s TanStack Query delivers a new `data` reference → `DashboardPage` re-renders. The page holds 6 `CountUpNumber` KPI cards + driver/transport matrices + dead-letter list.
- **Mitigations already in place:** `MemoryChart` and `TrafficChart` are `memo()`'d with no props (`MemoryChart.tsx:19`, `TrafficChart.tsx:32`), so they bail out of parent re-renders. `drivers`/`transports`/`deadLetters` are `useMemo`'d (`DashboardPage.tsx:46-48`).
- **Remaining cost:** Every 4 s, all 6 KPI cards + the dead-letter list re-render and `CountUpNumber` restarts its rAF animation (see Finding 2.4). The 4 s cadence is the fastest poll on the page and drives the most re-renders.
- **Suggested fix:** Increase `useDeadLetters` `refetchInterval` to 15–30 s (dead letters are failure records, not real-time telemetry). Expected impact: ~4× fewer DashboardPage re-renders.

### Finding 2.2 — closeTrend not memoized (MINOR)
- **File:** `src/features/monitor/TagExplorerPage.tsx:127-135`
- **Evidence:** `closeTrend` is a plain function (not `useCallback`), recreated every render, passed as `onClose={closeTrend}` to `TagTrendPanel` (line 217). Contrast with `openTrend` (line 104) and `handleWriteClick` (line 148) which are correctly `useCallback`'d.
- **Impact:** Low — `TagTrendPanel` re-renders on every tagMap flush anyway (via `trendLivePoint`). But it's an inconsistency with the documented pattern (line 144-151 comment emphasizes stable handlers for memoized children).
- **Suggested fix:** Wrap `closeTrend` in `useCallback` with `[discardPendingTrend, setTrendTag, setTrendSamples]`.

### Finding 2.3 — inline handlers in TagTable / DashboardPage (MINOR)
- **Files:** `src/components/monitor/TagTable.tsx:203` (`onRetry={() => refetch()}`), `src/features/monitor/DashboardPage.tsx:139` (`format={(n) => n.toFixed(1)}`)
- **Evidence:** Inline arrows recreated every render. `TagTable` is not `memo`'d, so these don't break memoization — they just add minor allocation. `CountUpNumber` receives an inline `format` arrow but `format` is not in its effect deps (`count-up-number.tsx:56`), so the animation isn't restarted.
- **Suggested fix:** Hoist to `useCallback`/module constants for consistency. Low priority.

### Finding 2.4 — CountUpNumber not memoized; re-animates on every value prop change (MINOR)
- **File:** `src/components/ui/count-up-number.tsx:17-58`
- **Evidence:** `CountUpNumber` is not `React.memo`'d. It's used 6× in DashboardPage. Each stats poll (5 s) changes `stats?.points_per_sec` etc. → all 6 instances re-render and restart their 800 ms rAF ease-out animation. With 5 s polling the animations overlap (new animation starts before previous finishes), which is the intended visual but means 6 concurrent rAF loops.
- **Mitigation:** `prefers-reduced-motion` is respected (line 29-35). rAF is cleaned up on unmount (line 53-55).
- **Suggested fix:** `memo` the component (props are primitives). Consider `duration={0}` (snap) when the value change is small to avoid visual churn. Low priority.

### Finding 2.5 — ConnectionContext ctxValue correctly memoized (GOOD)
- **File:** `src/contexts/ConnectionContext.tsx:183-193`
- `ctxValue` is `useMemo`'d on `[instance, isConnected, isConnecting, error, serverInfo, reconnect]`. `queryClient` is `useMemo`'d on `[instanceId]` (line 90). No inline object leaks. Good.

### Finding 2.6 — Zustand selectors return stable references (GOOD)
- **Files:** `src/App.tsx:84`, `src/contexts/ConnectionContext.tsx:70`
- `useInstanceStore((s) => s.instances.find(...))` returns the actual object from the array (not a new object), so `Object.is` equality holds unless the instance object itself is replaced. `setProbeResult` (`instanceStore.ts:196`) does create a new instance object on success, but `ConnectionContext` uses primitive deps (`instance?.id, instance?.baseUrl, instance?.secret`) for the probe effect (line 179) to avoid re-triggering. Correct.

### Finding 2.7 — queryClientCache never evicts (MINOR)
- **File:** `src/contexts/ConnectionContext.tsx:39`
- **Evidence:** `const queryClientCache = new Map<string, QueryClient>()` is module-level and never cleared. Each instance visited creates a `QueryClient` (with its own cache) that persists for the page lifetime.
- **Impact:** Low — operators typically manage a handful of instances. But visiting many instances accumulates `QueryClient` objects + their caches in memory.
- **Suggested fix:** Add an LRU cap (e.g. evict oldest beyond 5 entries) or clear on instance deletion. Low priority.

---

## 3. Data Fetching

### Finding 3.1 — useTags 5 s REST poll is redundant while WS stream is active (MAJOR)
- **Files:** `src/api/hooks/index.ts:79-85`, `src/features/monitor/TagExplorerPage.tsx:16`, `src/hooks/useTagExplorerStream.ts:175-197`
- **Evidence:** `useTags()` polls `GET /tags` every 5 s (`refetchInterval: 5000`). `TagExplorerPage` also opens a `/tags/stream` WebSocket that pushes live `DataPoint` updates. The REST poll fires every 5 s for the entire time the user is on TagExplorer, even though the WS stream is the source of truth. The `hasSeeded` guard (`useTagExplorerStream.ts:86-101`) prevents the poll from clobbering live data, but the HTTP requests still fire.
- **Impact:** 1 unnecessary HTTP request every 5 s per open TagExplorer tab. On a plant with 10 000 tags, each `/tags` response is large → wasted bandwidth + CPU (JSON parse + React reconciliation of the seed merge check).
- **Suggested fix:** Disable `refetchInterval` for `useTags` (make it fetch-on-mount only), or increase to 60 s, or conditionally disable polling when the WS stream is connected. Expected impact: eliminates continuous polling on the highest-traffic page.

### Finding 3.2 — useDeadLetters polls every 4 s (MAJOR)
- **File:** `src/api/hooks/index.ts:127-133`
- **Evidence:** `refetchInterval: 4000` — the most aggressive poll in the app. Dead letters are exhausted write-retry records, not real-time telemetry. 4 s is excessive.
- **Suggested fix:** Increase to 15–30 s. Expected impact: ~4–8× fewer fetches; reduces DashboardPage and AlertsPage re-render frequency (see Finding 2.1).

### Finding 3.3 — staleTime 3 s vs refetchInterval 5 s causes remount refetches (MINOR)
- **File:** `src/contexts/ConnectionContext.tsx:49` (`staleTime: 3000`)
- **Evidence:** Global `staleTime: 3000`. For queries with `refetchInterval: 5000` (tags, stats, driver, transport, driverTags): data goes stale 3 s after fetch, but the 5 s interval governs background refresh. However, if a component unmounts and remounts 3–5 s after the last fetch (e.g. navigating away and back), TanStack Query refetches immediately on mount because data is stale, *and* the interval continues — a double fetch in the worst case.
- **Suggested fix:** Set `staleTime` ≥ `refetchInterval` per query (or globally to 5000+), so remounts within the poll window reuse cached data. Low priority — the extra fetch is one request.

### Finding 3.4 — Detail-page polls at 5 s are aggressive (MINOR)
- **Files:** `src/api/hooks/index.ts:44-60,70-77` (`useDriver`, `useDriverTags`, `useTransport` all `refetchInterval: 5000`)
- **Evidence:** Driver/transport detail pages poll every 5 s. These are admin/config views, not real-time monitors. 5 s is tighter than needed.
- **Suggested fix:** Increase to 10–15 s for detail pages. Low priority.

### Finding 3.5 — Query keys and invalidation are correct (GOOD)
- **Files:** `src/api/hooks/index.ts:28-133`
- Keys are well-structured (`['serverInfo']`, `['driver', name]`, `['driverTags', name]`, etc.) and dedupe correctly. Mutations invalidate the right keys (`useWriteTag` invalidates `['tags']`, `['deadLetters']`, `['driverTags', driver]`, `['driver', driver]` — line 140-147). `useUpdateConfig` invalidates both `['configs']` and `['configsRaw']` (line 180-186). No over- or under-invalidation observed.

---

## 4. Virtualization

### Finding 4.1 — TagTable is virtualized (GOOD)
- **File:** `src/components/monitor/TagTable.tsx:45-50`
- `useVirtualizer` with `estimateSize: () => ROW_HEIGHT` (48 px), `overscan: 8`. Rows are absolutely positioned via `transform: translateY(start)` (`TagRow.tsx:58`). `TagRow` is `memo`'d (`TagRow.tsx:23`). This is the correct pattern for a high-frequency, large list.

### Finding 4.2 — RulesPage runtime rules list is NOT virtualized (MAJOR)
- **File:** `src/features/admin/RulesPage.tsx:389` (`rules.map((rule) => ...)`)
- **Evidence:** The runtime rules table maps all rules directly to `<tr>` elements with no virtualization. Rules re-fetch every 15 s (`useRules` → `refetchInterval: 15000`). A plant with 200+ rules renders 200+ `<tr>` nodes, each with badges, switches, and date formatting.
- **Impact:** Initial render cost scales O(n) with rule count; each 15 s poll re-renders all rows. No `React.memo` on the row.
- **Suggested fix:** Apply the same `@tanstack/react-virtual` pattern as `TagTable`, or at minimum `memo` the row component. Expected impact: constant-time render regardless of rule count.

### Finding 4.3 — DriversPage / TransportsPage card grids not virtualized (MINOR)
- **Files:** `src/features/admin/DriversPage.tsx:295` (`drivers.map(...)`), `src/features/admin/TransportsPage.tsx:278` (`transports.map(...)`)
- **Evidence:** Driver/transport cards rendered in a responsive grid with no virtualization. Typically <20 drivers/transports, so this is acceptable. But the `DriverDetailDialog` tags table (`DriversPage.tsx:489`) caps at `MAX_TAGS = 200` via `slice(0, 200)` (line 447) — not virtualized, so 200 `<tr>` nodes render. For drivers with thousands of tags, this is a hard cap that hides data.
- **Suggested fix:** Virtualize the dialog tag table (reuse the `TagTable` pattern) instead of slicing. Low priority for the card grids; medium for the dialog table.

### Finding 4.4 — AlertsPage lists are capped, not virtualized (MINOR)
- **File:** `src/features/monitor/AlertsPage.tsx:182` (`deadLetters.slice(0, 100)`), line 148 (logs cap 50)
- **Evidence:** Dead letters capped at 100 DOM nodes, live logs at 50. Both re-render on every WS flush (rAF-batched). The caps bound DOM size, so this is acceptable. A "showing X of Y" message appears (line 376-379).
- **Suggested fix:** If dead-letter volumes grow, virtualize. Low priority.

---

## 5. Streaming / WebSocket

### Finding 5.1 — CoreCWebSocket backpressure is excellent (GOOD)
- **File:** `src/api/websocket.ts:112-140`
- Sliding-window rate limiter using a fixed-size ring buffer (capacity 512, power-of-2 for bitwise AND — `websocket.ts:33-34`). Messages exceeding 500/s are dropped (not queued), protecting the event loop. O(1) per message, zero allocations after init. Exponential backoff with ±20 % jitter (`websocket.ts:185-186`), `maxRetries = 10` cap (line 18), `destroy()` nulls all handlers (line 198-205). This is a well-engineered backpressure layer.

### Finding 5.2 — useTagExplorerStream rAF batching is correct (GOOD)
- **File:** `src/hooks/useTagExplorerStream.ts:129-169`
- Incoming WS messages stage into `pendingTagsRef` / `pendingFlashRef` / `pendingTrendRef` (Maps/arrays in refs). A single `requestAnimationFrame` coalesces the burst into one `setTagMap` + `setFlashTick` + `setTrendSamples` flush (≤60/s). The snapshot+clear happens outside the setState updater (line 134-136) to keep the updater pure under StrictMode double-invocation. Cleanup cancels the rAF (line 201-204). No leaks observed.

### Finding 5.3 — Chart window caps are tight (GOOD)
- **Files:** `src/components/charts/MemoryChart.tsx:31` (`if (next.length > 25) next.shift()`), `src/components/charts/TrafficChart.tsx:57` (same), `src/lib/tagExplorer.ts:6` (`MAX_TREND_SAMPLES = 100`)
- Sliding windows are capped at 25 (dashboard charts) and 100 (trend chart). `setData((prev) => [...prev, point])` with shift is O(n) but n ≤ 25/100 — negligible. No unbounded growth.

### Finding 5.4 — EventLogTerminal flush timer + batch cap (GOOD)
- **File:** `src/components/admin/EventLogTerminal.tsx:82-106`
- 16 ms timer flush coalesces log floods. `MAX_BATCH = 200` caps lines per flush; overflow is counted and reported (line 94-99). Cleanup clears timer, destroys WS, removes resize listener, disposes terminal (line 177-182). No leaks.

### Finding 5.5 — AlertsPage rAF batching + AudioContext in ref (GOOD)
- **File:** `src/features/monitor/AlertsPage.tsx:140-179`
- Same rAF-batch pattern as useTagExplorerStream. `AudioContext` stored in ref, unlocked by user gesture (line 121). WS effect deps `[]` (created once); latest `t`/prefs read via refs (line 100-113). Cleanup cancels rAF + destroys WS. Correct.

### Finding 5.6 — useTrendChart recreates chart on theme change (MINOR)
- **File:** `src/hooks/useTrendChart.ts:55-99`
- **Evidence:** The chart is recreated (not updated) whenever `resolvedTheme` changes (dep array line 99). This is necessary because lightweight-charts reads CSS variables via `getComputedStyle` at creation time (canvas can't resolve `hsl(var(--...))`). The recreation cost is one chart dispose+create — acceptable for an infrequent theme toggle.
- **Note:** `trendSamples` are pushed via a separate effect (line 102-107) so the chart isn't rebuilt on every sample. Good separation.

### Finding 5.7 — tRef.current = t assigned during render (MINOR, cosmetic)
- **Files:** `src/components/admin/EventLogTerminal.tsx:31`, `src/api/hooks/index.ts:243-244`
- **Evidence:** `tRef.current = t` (and `msgRef.current = onMessage`) are assigned during the render body. React docs discourage side effects during render, but this is the standard "latest-value ref" pattern and is safe in practice (the ref mutation is idempotent and doesn't affect other components).
- **Suggested fix:** Move to a `useEffect` for strict correctness. Very low priority.

---

## 6. CSS / Animations

### Finding 6.1 — .sidebar-transition animates `width` (layout property) (MAJOR)
- **File:** `src/index.css:439-441`
- **Evidence:**
  ```css
  .sidebar-transition { transition: width 0.2s ease-out; }
  ```
  Applied to the `<aside>` in `AppShell.tsx:147`. Animating `width` triggers layout recalculation on every animation frame (the content area's `maxWidth` also depends on `collapsed` — `AppShell.tsx:143`).
- **Impact:** Visible jank during sidebar collapse/expand on slower devices. The main content reflows as the sidebar width animates.
- **Suggested fix:** Use `transform: translateX()` for the collapse motion (the sidebar can slide off-canvas while keeping its layout width fixed, or use a CSS Grid track with `grid-template-columns` transition — though that also triggers layout). The cleanest fix: animate `transform` on a fixed-width sidebar and overlay, or accept the layout cost since it's user-initiated and 200 ms. At minimum, add `will-change: width` during the transition.

### Finding 6.2 — .card-hover transitions box-shadow (repaint) (MINOR)
- **File:** `src/index.css:428-436`
- **Evidence:**
  ```css
  .card-hover { transition: transform 0.25s var(--ease-spring), box-shadow 0.25s var(--ease-smooth); }
  .card-hover:hover { transform: translateY(-3px); box-shadow: var(--shadow-card-hover); }
  ```
  `transform` is composited (good). `box-shadow` is **not** composited — it triggers repaint on every frame of the hover transition. Applied to all 6 dashboard KPI cards + driver/transport cards.
- **Impact:** Minor — hover is user-initiated and 250 ms. But on a page with many cards, hovering across the grid triggers repeated repaints.
- **Suggested fix:** Use a `::before` pseudo-element with the hover shadow and animate its `opacity` (composited), or use `filter: drop-shadow()` (composited on some browsers). Low priority.

### Finding 6.3 — .glow-running animates opacity (composited) (GOOD)
- **File:** `src/index.css:353-367`
- Comment explicitly notes the choice: "The pulse animates opacity (composited) instead of box-shadow to avoid continuous repaints. The box-shadow stays static for color." `@keyframes glow-pulse` animates only `opacity`. This is the correct pattern for an infinite animation. Good.
- **Minor:** No `will-change: opacity` declared. For an infinite animation, `will-change: opacity` would promote the element to its own compositor layer. Add for micro-optimization.

### Finding 6.4 — View Transitions theme reveal animates clip-path (MINOR)
- **File:** `src/index.css:483-497`
- **Evidence:** `@keyframes theme-circle-reveal` animates `clip-path: circle(...)`. `clip-path` is not composited — it triggers repaint during the 0.5 s theme transition.
- **Impact:** One-shot 0.5 s repaint on theme change. Acceptable — it's an infrequent user action and the visual effect is the point.
- **Suggested fix:** None needed. If smoothness is a concern on large DOMs, consider reducing the transition duration or using a simpler fade.

### Finding 6.5 — page-enter / card-enter / nav-indicator animate transform+opacity (GOOD)
- **Files:** `src/index.css:388-456`
- All entrance animations use `transform` (translateY, scale, scaleY) + `opacity` — both composited. `prefers-reduced-motion` is respected (line 500-507), zeroing animation durations. Good.

### Finding 6.6 — DiagnosticsPage histogram bars set `width` (MINOR)
- **File:** `src/features/admin/DiagnosticsPage.tsx:75` (`style={{ width: ${widthPct}% }}`)
- **Evidence:** Histogram bar widths are set via inline `style.width` (a layout property). Not animated — just set once per metrics poll (12 s). Each poll re-layouts the histogram rows.
- **Impact:** Minor — 12 s cadence, few rows. Could use `transform: scaleX()` with `transform-origin: left` for a composited approach, but the gain is negligible at this cadence.

### Finding 6.7 — card-stagger delays cap at 8 children (MINOR)
- **File:** `src/index.css:418-425`
- **Evidence:** Stagger delays defined for `:nth-child(1)` through `:nth-child(8)` (0–420 ms). Children 9+ all use the last delay (420 ms) — they animate simultaneously rather than continuing the stagger.
- **Impact:** Minor visual inconsistency on grids with >8 items (e.g. driver matrix with 12 drivers). Not a perf issue.
- **Suggested fix:** Use `animation-delay: calc(var(--n) * 60ms)` with a CSS counter, or extend the pattern. Cosmetic only.

---

## 7. Image / Asset

### Finding 7.1 — SVG logos are tiny and inline-loaded (GOOD)
- **Files:** `public/logo-animated.svg` (3 KB), `public/logo.svg` (1.6 KB)
- Loaded via `<img src="/logo-animated.svg">` in `AppShell.tsx:36`. Small, vector, cacheable. No issue.

### Finding 7.2 — JetBrains Mono loaded via render-blocking Google Fonts link (MINOR)
- **File:** `index.html:16-20`
- **Evidence:**
  ```html
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
  ```
  `preconnect` + `display=swap` are good. But the stylesheet `<link>` is render-blocking (in `<head>` without `media` trick). The font is used for monospace data displays (`--font-mono` in `index.css:75`).
- **Impact:** The Google Fonts CSS request blocks first paint until it resolves (one round-trip to `fonts.googleapis.com`). On slow networks this adds ~100–300 ms to FCP. `display=swap` means the font itself doesn't block text render (falls back to `ui-monospace, monospace`).
- **Suggested fix:** Make the stylesheet load non-blocking: `<link rel="stylesheet" href="..." media="print" onload="this.media='all'">`, or self-host the font (aligns with the air-gapped Monaco strategy and removes the external dependency + CSP `fonts.googleapis.com` allow-list). Low–medium priority.
- **Note:** The sans font is a system stack (`index.css:74`) — no web font for sans. Good, no sans font cost.

### Finding 7.3 — CSP is consistent with asset strategy (GOOD)
- **File:** `index.html:7-9`
- `font-src 'self' https://fonts.gstatic.com data:` matches the Google Fonts + Monaco strategy. `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com` allows the Google Fonts CSS. Monaco is self-hosted under `'self'`. No CDN script-src. Consistent.

---

## Summary — Prioritized Action List

| # | Severity | Finding | File | Impact of Fix |
|---|----------|---------|------|---------------|
| 1 | **MAJOR** | recharts + lightweight-charts redundancy | `vite.config.ts:204` | −364 KB from monitor route |
| 2 | **MAJOR** | useTags 5 s REST poll redundant with WS stream | `api/hooks/index.ts:83` | Eliminates continuous polling on busiest page |
| 3 | **MAJOR** | useDeadLetters 4 s poll too aggressive | `api/hooks/index.ts:131` | ~4× fewer DashboardPage re-renders |
| 4 | **MAJOR** | RulesPage runtime rules list not virtualized | `RulesPage.tsx:389` | O(1) render for 100+ rules |
| 5 | **MAJOR** | .sidebar-transition animates `width` (layout) | `index.css:439` | Smooth collapse without reflow |
| 6 | MINOR | staleTime 3 s < refetchInterval 5 s → remount double-fetch | `ConnectionContext.tsx:49` | Eliminates extra fetch on navigation |
| 7 | MINOR | Detail-page polls at 5 s | `api/hooks/index.ts:49,58,75` | Reduced polling on admin pages |
| 8 | MINOR | closeTrend not useCallback | `TagExplorerPage.tsx:127` | Consistency with memo pattern |
| 9 | MINOR | DriverDetailDialog tags table capped at 200, not virtualized | `DriversPage.tsx:447` | Full tag list without DOM cap |
| 10 | MINOR | .card-hover transitions box-shadow (repaint) | `index.css:430` | Composited hover |
| 11 | MINOR | Google Fonts stylesheet render-blocking | `index.html:18` | ~100–300 ms FCP improvement |
| 12 | MINOR | queryClientCache never evicts | `ConnectionContext.tsx:39` | Bounded memory across instances |
| 13 | MINOR | CountUpNumber not memo'd; 6 concurrent rAF loops | `count-up-number.tsx:17` | Fewer rAF loops on dashboard |

**Overall assessment:** The codebase shows strong performance engineering discipline — rAF batching, WS backpressure with a ring-buffer rate limiter, route-level code splitting, memoized chart components, `useDeferredValue` on the high-frequency tag list, and a well-structured `manualChunks` strategy. The highest-impact improvements are (1) eliminating the recharts redundancy, (2) stopping the redundant REST poll while the WS stream is live, and (3) reducing the dead-letter poll cadence. The CSS animations are mostly composited; the sidebar `width` transition is the only layout-thrash concern.
