# Audit Fix Report — CoreC-Dashboard

## Overview

After completing all Phase 2 feature development (commit `88527a8`), a multi-agent audit pass was conducted across three dimensions: **code quality & React patterns**, **security & performance**, and **i18n & UI/UX**. This report documents all findings and their fixes.

## Audit Reports (3 independent audits)

1. **Code Quality & React Patterns Audit** — 12 Major, 20 Minor findings
2. **Security & Performance Audit** — 4 Security, 7 Performance findings
3. **i18n & UI/UX Audit** — 1 remaining hardcoded string, 2 MAJOR accessibility gaps, contrast/responsive findings

## Fixes Applied

### Critical Bug Fixes (Major)

#### M1/M2 — Wrong field names in React keys (systemic copy-paste bug)
- **Issue**: `DeadLetterEntry.timestamp` and `LogEvent.message` don't exist on those types. React keys collapsed to `…-undefined`, causing duplicate-key collisions in 4 live-data renderers.
- **Fix**: Changed `.timestamp` → `.failed_at` + `.attempts` in dead letter keys (WriteControlPage, DashboardPage, AlertsPage). Changed `.message` → `.type` + `.payload` in log event keys (AlertsPage).
- **Also fixed**: `tsc -b` type errors (P7) — these were real runtime bugs hidden by Vite's type-stripping.

#### M3 — RulesPage local `isZeroTime` misses Unix epoch
- **Issue**: RulesPage defined its own `isZeroTime` that only caught Go's `0001-01-01` zero time, missing the Unix epoch (`1970-01-01`) that CoreC emits for `rule.hit_at`/`rule.miss_at`.
- **Fix**: Deleted local `isZeroTime`, imported shared `isZeroTime` from `@/lib/utils` (which catches both variants).

#### M4 — TopologyPage mutates React Query cache during render
- **Issue**: `rules.sort()` was called inline during render, mutating the cached array.
- **Fix**: Wrapped in `useMemo(() => [...rules].sort(...), [rules])` — sorts a copy, memoized.

#### M5/M6/M7 — localStorage persistence issues
- **M5**: `localStorage.setItem` called on every drag pixel in DashboardEditor → UI jank. **Fix**: Debounced persistence (300ms) via `debouncedPersist()`.
- **M6**: `y: Infinity` in new cards → `JSON.stringify(Infinity)` → `null` on reload → cards stacked at row 1. **Fix**: Compute actual bottom-y from existing cards.
- **M7**: Unguarded `localStorage.setItem` → `QuotaExceededError` crash. **Fix**: `safePersist()`/`safeRemove()` helpers with try/catch in both `dashboardStore` and `connectionStore`.

#### M8 — TagExplorer write dialog has no value validation (safety risk)
- **Issue**: Write values parsed with no validation — empty→0, "abc"→NaN→null, no range checks, ambiguous bool. Writes to physical actuators.
- **Fix**: Extracted `validateValue` + `NUMERIC_RANGES` from WriteControlPage into shared `src/lib/writeValidation.ts`. TagExplorerPage now validates before writing, showing errors inline.

#### M9 — TagExplorer trend drawer inaccessible
- **Issue**: Custom drawer with no `role="dialog"`, no `aria-modal`, no Escape handler, no focus management.
- **Fix**: Added `role="dialog"`, `aria-modal="true"`, `aria-label`, `tabIndex={-1}`, Escape `onKeyDown`, and focus management via `drawerRef` + `useEffect`.

#### M10 — ConfigCenterPage diff O(m×n) on every keystroke
- **Issue**: LCS diff recomputed on every keystroke in Monaco editor.
- **Fix**: Debounced `yamlContent` → `debouncedYaml` (300ms), folded `hasDiffChanges` into same `useMemo`.

#### M11/P1 — TagExplorer per-message setState (500 renders/sec)
- **Issue**: Up to 1000 React state updates/sec on `/tags/stream`, causing render thrashing on large plants.
- **Fix**: Implemented `requestAnimationFrame` batching — incoming messages staged in refs, flushed once per frame (≤60 updates/sec). Mirrors the pattern DiagnosticsPage already uses.

### Performance Fixes

#### P2 — No React.memo anywhere
- **Fix**: Wrapped `MemoryChart`, `TrafficChart` in `memo()`. Wrapped `TagRow` in `memo()` with stable `useCallback` callbacks (`openTrend`, `handleWriteClick`) so unaffected rows bail out.

#### P3 — No staleTime on React Query
- **Fix**: Added `staleTime: 3000` to QueryClient defaults — prevents redundant refetches on remount/navigation.

#### P6 — Monaco editor blocked by CSP
- **Issue**: `@monaco-editor/react` loads from jsDelivr CDN, but CSP restricted `script-src` to `'self'` only.
- **Fix**: Added `https://cdn.jsdelivr.net` to CSP `script-src`/`style-src` in `index.html`. Added `loader.config()` in `main.tsx` to pin the Monaco version explicitly.

#### P7 — `npm run build` fails type-check
- **Issue**: 11+ type errors in `tsc -b` (hidden because Vite strips types without checking).
- **Fix**: Fixed `ApiError` import, `import type React` → `import * as React` in 5 UI primitives, `Layout` type parameter, `clearTimeout` null handling, wrong field names (M1/M2).

### Security Fixes

#### S3 — No URL scheme validation
- **Issue**: Connection URL input had no scheme validation.
- **Fix**: Added `new URL()` validation requiring `http:`/`https:` protocol. Changed input `type="text"` → `type="url"`. Added `connection.invalidUrl` i18n key.

### Minor Fixes (m1-m20)

| # | Fix |
|---|---|
| m1 | DashboardPage: renamed shadowed `t` param → `tr` |
| m2 | AlertsPage: `ctx.resume().catch(() => {})` |
| m3 | AlertsPage: moved ref mutations to `useEffect` |
| m5 | WriteControlPage: hoisted `dlqKeyOf` to module scope |
| m6 | WriteControlPage: removed redundant `refetchDeadLetters()` after replay |
| m7 | RulesPage: guard `Number.isNaN` for priority input + `min={0}` |
| m8 | RulesPage: `QUALITY_OPTIONS` wrapped in `useMemo([t])` |
| m9 | ConfigCenterPage: removed array index from React key |
| m10 | DiagnosticsPage: `metricsMap` via `useMemo` + `useCallback` for `findMetric`/`histogram` |
| m12 | websocket.ts: replaced O(n) `Array.shift()` with index pointer + compaction |
| m13 | websocket.ts: guard binary frames with `typeof event.data === 'string'` |
| m14 | websocket.ts: `destroy()` nulls all handlers (`onopen`/`onmessage`/`onerror`) |
| m15 | connectionStore: `safePersist`/`safeRemove` for all localStorage writes |
| m16 | hooks: `useUpdateConfig` payload now required (`payload: string` not `payload?: string`) |
| m17 | TagExplorerPage: corrected stale "2s" polling comment → "5s" |
| m20 | DriverDetailPage: removed pointless `isZeroTime` alias |

### UI/UX Fixes

- **Keyboard accessibility**: Added `tabIndex`, `aria-label`, `onKeyDown` (Enter/Space) to clickable Card (DriversPage) and clickable `<tr>` (TagExplorerPage).
- **TopologyPage error states**: Added `isError` handling for all 5 queries with error banner.
- **ConfigCenterPage aria-label**: Added `aria-label` to diff toggle icon button.
- **DiagnosticsPage**: Wired last hardcoded English string (`pprofDesc`) to i18n.
- **Color contrast**: Darkened light-mode `--muted-foreground` from `46%` → `42%` lightness (WCAG AA compliance for muted-on-muted).
- **TransportDetailPage**: Added `Math.max(0, ...)` lower clamp on queue width.

### i18n Fixes

- All hardcoded English strings across charts, dialogs, sheets, TopBar, SettingsPage, DiagnosticsPage, DriverDetailPage, DriversPage, TransportDetailPage, AlertsPage, ConnectionPage, DashboardPage now use `t()` calls.
- i18n key count: 606 → **609 keys** (perfect parity between en.json and zh-CN.json).
- New keys: `connection.invalidUrl`, `config.diffToggle`, `tags.trendTitle`.

### Build/Type Fixes

- `import type React` → `import * as React` in 5 shadcn UI primitives (alert-dialog, scroll-area, select, separator, sheet) — they use `React.forwardRef` (a value) but imported React as type-only.
- `ApiError` import added to `endpoints/index.ts`.
- `Layout` type parameter fixed in DashboardEditorPage (`Layout[]` → `Layout` — it's `readonly LayoutItem[]`).
- `clearTimeout` null handling in websocket.ts.

## Verification Results

| Check | Result |
|---|---|
| `tsc -b --noEmit` | 0 errors ✅ |
| `biome check src/` | 0 errors ✅ |
| `vitest run` | 69/69 tests pass ✅ |
| `vite build` | Success (490ms) ✅ |
| i18n parity | 609 keys, perfect ✅ |

## Audit Findings Not Fixed (Deferred)

- **S1** (bearer secret in localStorage) — Requires backend changes (httpOnly cookie / WS ticket). Deferred.
- **S2** (WS token in URL query) — Requires backend WS auth handshake. Deferred.
- **S4** (imported layout shape validation) — Robustness, not exploitable. Low priority.
- **P4** (O(m×n) LCS diff) — Now debounced (M10), adequate for typical config sizes.
- **~103 unused legacy i18n keys** — Identified for future cleanup; not breaking.
- **Admin mobile sidebar** — No drawer/collapse below `lg` breakpoint. Future enhancement.
