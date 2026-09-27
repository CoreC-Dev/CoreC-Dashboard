# CoreC-Dashboard Code Audit Report

Scope: `/workspace/codespace/CoreC-Dashboard/src/` — React hooks, error handling, type safety, memory leaks, component patterns, and Zustand state management. Every finding below was verified by reading the actual source.

Severity legend: **P0** critical · **P1** high · **P2** medium · **P3** low

---

## P1 — High

### P1-1 · 401 auth handling is broken — user gets stuck on a frozen dashboard with no redirect and no error UI
**Files:** `src/api/client.ts:67-69`, `src/stores/connectionStore.ts:72`, `src/App.tsx:76-82`

On a 401, `apiRequest` calls `useConnectionStore.getState().setError(...)`, which sets `isConnected = false` and `lastError = 'Authentication failed — please reconnect'`. The code comment in `client.ts:26-28` claims this "flips `isConnected`→false so the RequireConnection gate redirects to /login". **That claim is false.**

`RequireConnection` only inspects `baseUrl` and `secret`:
```tsx
// src/App.tsx:76-82
const RequireConnection: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { baseUrl, secret } = useConnectionStore()
  if (!baseUrl || !secret) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}
```
`setError` never clears `secret` or `baseUrl`, so the gate never redirects. A grep for `lastError`/`isConnecting` confirms **neither is ever read by any component** — the error message is written to the store and then discarded. Meanwhile every `useQuery` hook is gated on `enabled: isConnected`, so after the 401 all queries are disabled and the user is left on a blank/frozen dashboard with at most a small red dot in the `TopBar` and no path to recovery except manually clicking Disconnect.

**Fix** — make the intent true. Either clear credentials on auth failure so the existing gate fires:
```ts
// src/stores/connectionStore.ts
setError: (error) => {
  localStorage.removeItem(STORAGE_KEY)
  set({ secret: '', isConnected: false, isConnecting: false, lastError: error,
        serverName: null, serverVersion: null })
},
```
…or have `RequireConnection` also redirect when auth is known-bad:
```tsx
const { baseUrl, secret, isConnected, isConnecting } = useConnectionStore()
if (!baseUrl || !secret || (!isConnected && !isConnecting)) {
  return <Navigate to="/login" replace />
}
```
Then surface `lastError` on the `/login` page (or a banner) so the user knows *why* they were sent there.

---

## P2 — Medium

### P2-1 · `RulesPage.handleToggle` has no catch → unhandled promise rejection + silent mutation failures
**File:** `src/features/admin/RulesPage.tsx:221-228`
```ts
const handleToggle = async (index: number, currentDisabled: boolean) => {
  setTogglingIndex(index)
  try {
    await toggleMutation.mutateAsync({ index, disabled: !currentDisabled })
  } finally {
    setTogglingIndex(null)
  }
}
```
`try/finally` with **no `catch`**. `useToggleRule` (`src/api/hooks/index.ts:137-146`) defines no `onError`. When the PATCH fails, `mutateAsync` rejects, the `finally` clears the spinner, and the rejection propagates out of the async `handleToggle` invoked from an `onClick` — producing an **unhandled promise rejection**. The user sees the switch silently revert on the next poll (`useRules` refetchInterval 5s) but is never told the toggle failed. Compare with `WriteControlPage.handleConfirmWrite` and `AlertsPage.handleRetryDeadLetter`, both of which catch correctly.

**Fix:**
```ts
const handleToggle = async (index: number, currentDisabled: boolean) => {
  setTogglingIndex(index)
  try {
    await toggleMutation.mutateAsync({ index, disabled: !currentDisabled })
  } catch (err) {
    setToggleError(err instanceof Error ? err.message : 'Failed to toggle rule')
  } finally {
    setTogglingIndex(null)
  }
}
```

### P2-2 · Single global `ErrorBoundary` outside the router — one broken page bricks the whole app
**Files:** `src/App.tsx:96-149`, `src/components/ErrorBoundary.tsx`

The only `ErrorBoundary` wraps `BrowserRouter` itself. When any lazy page throws, the entire app (including `TopBar`/`Sidebar` nav) is replaced by the full-screen fallback. The `reset` handler sets `hasError=false`, which remounts the *same* route — if the error is deterministic it throws again immediately, so the user cannot navigate away and must `window.location.reload()`. The boundary also does not reset on route change.

**Fix** — add a per-route boundary (and reset on navigation). Either wrap each route element:
```tsx
<Route path="dashboard" element={<ErrorBoundary><DashboardPage /></ErrorBoundary>} />
```
or use React Router 6's `errorElement` / `useRouteError`. Give the per-route boundary a `key={location.pathname}` (or reset in `componentDidUpdate` when `location` changes) so navigating to a different route clears the error.

### P2-3 · `connectionStore.revalidate` does a raw `fetch` with no timeout/abort — hung server = permanent blank state
**File:** `src/stores/connectionStore.ts:89-118` (fetch at line 97)

`revalidate` bypasses `apiRequest` (which has a 15s `AbortController` timeout) and calls `fetch` directly with no `signal`. If the persisted CoreC host accepts TCP but never responds, the promise never settles: `isConnecting` stays `true`, `isConnected` stays `false`, and — per P1-1 — `isConnecting` is not rendered anywhere. The user lands on `/monitor/dashboard` (gate passes because `baseUrl && secret` are present) with every query disabled and no spinner, error, or redirect. Only a manual reload + navigating to `/login` recovers.

**Fix** — use `apiRequest` (or an `AbortController` + timeout) for the probe, and surface `isConnecting`/`lastError` in the UI:
```ts
const ctrl = new AbortController()
const id = setTimeout(() => ctrl.abort(), 8000)
try {
  const res = await fetch(`${baseUrl}/`, { headers: {...}, signal: ctrl.signal })
  ...
} finally { clearTimeout(id) }
```

### P2-4 · `ConnectionPage.handleConnect` raw `fetch` with no timeout — Connect button spins forever on a hung host
**File:** `src/features/login/ConnectionPage.tsx:28-64` (fetch at line 44)

Same pattern as P2-3 on the login form. `loading` is set to `true` and only cleared in `finally`; a non-responding host leaves the button in its loading state indefinitely with no way to cancel.

**Fix** — wrap the probe in an `AbortController` with a timeout (or reuse `apiRequest`).

### P2-5 · WebSocket streams reconnect forever with a stale/invalid token, with no exit condition or user feedback
**File:** `src/api/websocket.ts:51-53, 104-115`

The token is sent as a `?token=` query param. After a 401 (or any credential change), the live WS connections in `TrafficChart`, `MemoryChart`, `TagExplorerPage`, `AlertsPage`, and `DiagnosticsPage` are not torn down. When the server closes the socket for bad auth, `onclose` → `scheduleReconnect` → `connect()` re-reads `baseUrl`/`secret` (still the invalid values) and reconnects — forever, up to the 30s max backoff. The WS class cannot distinguish a permanent auth failure from a transient network blip, so it never stops, never surfaces a terminal `'error'` status the UI acts on, and the user is never informed. Five streams reconnecting is low CPU but a genuine livelock that compounds P1-1.

**Fix** — check `useConnectionStore.getState().isConnected` in `connect()` and short-circuit (or emit a terminal `'error'` status) when auth is known-bad; expose WS status to the charts so a persistent error is shown instead of an empty plot.

---

## P3 — Low

### Type safety / unsafe casts
- **`src/api/client.ts:47`** — `(options as any).timeoutMs`. `RequestInit` has no `timeoutMs`; define a typed `ApiRequestOptions extends RequestInit { timeoutMs?: number }` and accept it.
- **`src/api/client.ts:31`** — `apiRequest<T = any>` default `any`; prefer `<T = unknown>`.
- **`src/api/client.ts:79,87`** — `undefined as unknown as T` / `as unknown as T` for the 204 and text paths. Acceptable but could be modeled with an explicit result type.
- **`src/api/client.ts:88`, `src/stores/connectionStore.ts:111`, `src/features/login/ConnectionPage.tsx:58`, `src/features/admin/ConfigCenterPage.tsx:172,187`, `src/features/monitor/TagExplorerPage.tsx:400`, `src/features/monitor/AlertsPage.tsx:50`, `src/features/admin/DiagnosticsPage.tsx:202`** — repeated `catch (err: any)`. Replace with `catch (err)` + `err instanceof Error ? err.message : String(err)`, or derive a typed `ApiError`.
- **`src/api/websocket.ts:5`** — `CoreCWebSocket<T = any>`; default `<T = unknown>`.
- **`src/api/websocket.ts:12`** — `private reconnectTimeout: any = null`; use `ReturnType<typeof setTimeout> | null`.
- **`src/types/models.ts:8,20`** — `DataPoint.value: any` and `WriteCommand.value: any`. Pragmatic, but `unknown` (with a typed `Value = string | number | boolean | ...`) would force callers to narrow.
- **`src/stores/themeStore.ts:28-29`** — `localStorage.getItem(STORAGE_KEY) as ThemeMode` is an unvalidated cast. If storage holds `"banana"`, `resolvedTheme` becomes `"banana"`, no theme button is highlighted, and `applyThemeToDOM` silently forces dark. Validate against `['system','dark','light']`.
- **`src/features/monitor/TagExplorerPage.tsx:379`** — `let parsedVal: any = writeValue`; type as `string | number | boolean`.
- **`src/features/monitor/AlertsPage.tsx:45`** — `handleRetryDeadLetter = async (cmd: any)`; the argument is `DeadLetterEntry.command` which is already `WriteCommand`.
- **`src/features/admin/DiagnosticsPage.tsx:113`** — `(evt: any)` for the `/logs` WS; type it as `LogEvent`.
- **`src/features/admin/WriteControlPage.tsx:230`** — `e.target.value as DataTypeString` on a `<select>` populated from the typed `DATA_TYPES` array — safe in practice, but a runtime guard is cleaner.

### React patterns — list keys
- **`src/features/monitor/DashboardPage.tsx:256`** — `deadLetters.slice(0,5).map((item, idx) => <div key={idx}>` — index key.
- **`src/features/monitor/AlertsPage.tsx:149`** — `deadLetters.map((entry, idx) => <div key={idx}>` — index key.
- **`src/features/monitor/AlertsPage.tsx:207`** — `liveLogs.map((log, idx) => <div key={idx}>` — **prepend-only** feed; index keys force React to re-render the entire list on every new event and can misassociate DOM. Use a stable id (e.g. `${log.timestamp}:${log.type}:${log.payload}` or a monotonic counter).
- **`src/features/admin/WriteControlPage.tsx:398`** — `deadLetters.map((dl, idx) => <div key={idx}>` — index key. Use `failed_at` + `command.tag` + `command.driver` (or a server id) instead.

### Missing loading states (pages render the *empty* state during the initial fetch, which is misleading)
- **`src/features/admin/DriversPage.tsx:48-51`** — `drivers` defaults to `[]`; while loading it shows "No drivers configured".
- **`src/features/admin/TransportsPage.tsx:36-39`** — same; shows empty card during load.
- **`src/features/admin/RulesPage.tsx:322-327`** — shows "No routing rules configured" during load.
- **`src/features/monitor/AlertsPage.tsx:138`** — shows "No failed dead letter commands recorded" during load.
- **`src/features/admin/TopologyPage.tsx`** — all sections render empty states during load.
- **`src/features/monitor/DashboardPage.tsx`** — KPIs default to `0` / `'Running'` during load (acceptable for a dashboard, but no skeleton).
- **`src/features/monitor/TagExplorerPage.tsx:507-512`** — table shows "No points found matching current filter" before the REST snapshot + WS seed arrive.
(`DriverDetailPage`, `TransportDetailPage`, and `ConfigCenterPage` handle this correctly with explicit `isLoading` branches.)

### `lightweight-charts` trend chart receives CSS variables it cannot render
**File:** `src/features/monitor/TagExplorerPage.tsx:286-301`

Chart options pass `'hsl(var(--muted-foreground))'`, `'hsl(var(--border))'`, `'hsl(var(--primary))'` to `createChart`/`addSeries`. `lightweight-charts` paints to a `<canvas>`, and canvas color parsing does **not** resolve CSS custom properties / `var()`. These resolve to invalid colors and the chart falls back to defaults (typically black text/lines), making the trend axis labels hard to read on a dark background. Resolve the CSS variable to a concrete color first, e.g. `getComputedStyle(document.documentElement).getPropertyValue('--muted-foreground')` and compose `hsl(${v})`, or pass concrete hex values. (Note: `recharts` in `TrafficChart`/`MemoryChart` renders SVG — verify those render correctly; SVG attribute colors also generally do not resolve `var()`.)

### Zustand usage — whole-store subscriptions instead of selectors
- **`src/App.tsx:77`** — `const { baseUrl, secret } = useConnectionStore()` (no selector) in `RequireConnection`.
- **`src/features/login/ConnectionPage.tsx:21`** — `const { baseUrl, secret, setConnection, setConnected, setError } = useConnectionStore()`.
- **`src/components/layout/TopBar.tsx:24`** — `const { isConnected, baseUrl, serverName, serverVersion, disconnect } = useConnectionStore()`.
- **`src/features/admin/DashboardEditorPage.tsx:62`** and **`src/features/admin/SettingsPage.tsx:15-17`** — same pattern for `useDashboardStore` / `useConnectionStore`.
These subscribe to the entire store object, re-rendering on every state change (e.g. `lastError`, `isConnecting`) even when only `baseUrl` is needed. Use `useConnectionStore((s) => s.baseUrl)` selectors (or `useShallow` for multiple fields).

### Memory / cleanup — minor
- **`src/stores/themeStore.ts:38-44`** — module-level `matchMedia(...).addEventListener('change', …)` is never removed. Acceptable for a production singleton (lives for app lifetime), but leaks one listener per HMR cycle in dev. Detach in a `destroy()` or accept the dev-only leak deliberately.
- **`src/api/websocket.ts:42-44`** — the `!baseUrl` retry branch sets `this.reconnectTimeout` without clearing any previously scheduled one. If `connect()` is invoked twice while `baseUrl` is still absent, the first timer leaks and both eventually fire. Clear `this.reconnectTimeout` before setting a new one.
- **`src/features/admin/DiagnosticsPage.tsx:180-210`** — `downloadPprof` has no `AbortController`/is-mounted guard and no timeout; a hung pprof endpoint leaves `pprofLoading` set and can `setState`/`xterm.writeln` after unmount. (React 18 no longer warns, but the spinner never clears.)

### React Query invalidation gaps
- **`src/api/hooks/index.ts:130-133`** — `useWriteTag` invalidates `['tags']` and `['deadLetters']` but **not** `['driverTags']` or `['driver']`. After a write, the driver-detail tag table and driver `read_count` are stale until their own poll intervals self-heal (`driverTags` 1s, `driver` 2s). Add `queryClient.invalidateQueries({ queryKey: ['driverTags'] })` (and `['driver']`) if immediate consistency is desired.

### Unawaited `refetch()` → potential unhandled rejection
- **`src/features/admin/WriteControlPage.tsx:132`** — `refetchDeadLetters()` (returns a rejecting promise on error) is called without `await`/`.catch` inside `handleReplay`.
- **`src/features/admin/ConfigCenterPage.tsx:186`** — `refetch()` after `handleHotReload` success, same pattern.
Wrap in `void refetch().catch(() => {})` or `await` inside the existing try block.

### Stale / misleading comment
- **`src/features/monitor/TagExplorerPage.tsx:537-547`** — comment claims `src/components/ui/sheet.tsx` "does not exist in this checkout" and therefore the trend drawer is hand-rolled inline. The file **does** exist (`src/components/ui/sheet.tsx`, 4155 bytes). The inline drawer can be replaced with the `Sheet` component, or the comment removed.

---

## Things done well (verified, not findings)
- WebSocket effects in `TrafficChart`, `MemoryChart`, `AlertsPage`, `TagExplorerPage`, `DiagnosticsPage` all return `() => ws.destroy()`, and `CoreCWebSocket.destroy()` clears the reconnect timer and closes the socket — no leaked WS connections on unmount.
- `ConfigCenterPage` (status timer), `DashboardEditorPage`/`SettingsPage` (saved-notice timer), and `DiagnosticsPage` (resize listener + xterm) all clean up timers/listeners in effect cleanups.
- `TagExplorerPage` correctly avoids the REST-vs-WS clobber race via the `hasSeeded` guard and a `trendTagRef` ref so the WS callback reads live state without re-subscribing.
- `DiagnosticsPage.fetchMetrics` is `useCallback`-memoized with `[]` deps and consumed by a `[fetchMetrics]` effect — correct.
- Per-row mutation isolation in `RulesPage` (`togglingIndex`) and the two-step industrial write confirmation in `WriteControlPage` are good patterns.
- `apiRequest`'s `AbortController` timeout + caller-signal respect, 204 handling, and `finally { clearTimeout }` are correct.
- `TrafficChart` correctly converts cumulative WS counters to per-second deltas and handles server-restart counter resets.

---

## Summary by severity
| Sev | Count | Headline |
|-----|-------|----------|
| P0  | 0     | — |
| P1  | 1     | 401 handling never redirects / never surfaces error |
| P2  | 5     | RulesPage unhandled rejection; global ErrorBoundary; 2× unbounded startup/connect fetches; WS infinite-reconnect with bad token |
| P3  | ~30   | `as any`/`catch:any` casts, index keys, missing loading states, canvas CSS-var colors, Zustand whole-store subs, minor cleanup gaps |

Top priorities to fix first: **P1-1** (auth gate + error surfacing), **P2-1** (RulesPage catch), **P2-3/P2-4** (fetch timeouts), **P2-2** (per-route error boundaries).
