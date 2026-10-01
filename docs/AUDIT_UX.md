# CoreC-Dashboard UX/Interaction Audit

**Scope:** Interaction-quality audit of the React 19 + TS dashboard (shell, home, monitor, admin, wizard, hooks, i18n). Read-only review — no source modified.
**Baseline:** Route-level Suspense + per-route ErrorBoundary present; TanStack Query + react-hook-form/zod; i18n en/zh-CN at 100% key parity (1161 keys each). The foundations are solid; findings below are interaction-polish gaps that affect a real operator running a production gateway.

---

## Summary

The dashboard has strong infrastructure: every route is lazy-loaded with Suspense + ErrorBoundary, destructive config applies are gated behind a diff confirmation dialog, and the Rules page toggle is a model of per-row pending + error feedback. The gaps cluster in **mutation feedback on the most critical admin operation** (silent config-apply failures), **mobile navigation flow** (drawer doesn't close on route change), **misleading save/discard labeling** ("Cancel" silently reverts edits), and a set of **polish/a11y/i18n** issues (decorative progress bar, hardcoded aria-labels, empty-state flashing). No data-loss P0s were found — all deletes are confirmed — but a silent failed hot-reload on a production gateway is the highest-risk item.

**Top 5 findings:** (1) Config apply failures are silently swallowed — no `onError`, no error surface in the confirmation dialog; (2) mobile nav drawer stays open after tapping a link; (3) "Cancel" in the unsaved-changes banner discards all edits without warning; (4) runtime list empty states flash "No drivers"/green "No dead letters" during initial fetch; (5) topbar "Realtime stream connected" is hardcoded green regardless of actual WebSocket state.

---

## Findings

### P1 — Silent config-apply failure (highest risk)
**(a) Location:** `DriversPage.tsx:434-440`, `TransportsPage.tsx:415-424`, `RulesPage.tsx:936-945`, `ConfigCenterPage.tsx:861-870` — all call `updateConfig.mutate({ payload }, { onSuccess })` with **no `onError`**. `ConfigApplyConfirmationDialog.tsx:253-369` accepts only `applying` + pre-apply `validationErrors` — it has no prop or render path for a *failed* apply.
**(b) Impact:** The operator clicks "Apply", the spinner spins, the PUT fails (engine rejects the YAML at reload time, network drops, 5xx), `isPending` flips false, the spinner stops — but the dialog stays open with **no message**. `onSuccess` (which closes the dialog + `markSaved`) is skipped, so the dirty banner persists, but there is no explicit failure indication. The operator likely clicks Cancel, unsure whether the reload happened. On a production gateway this is dangerous: a rejected hot-reload looks identical to a stalled UI.
**(c) Fix:** Add an `applyError?: string` prop to `ConfigApplyConfirmationDialog` and render a destructive banner (mirror the existing `validationErrors` block at lines 273-282). In each caller, pass `applyError={updateConfig.isError ? extractApiError(...) : undefined}` and add `onError` to `mutate` that keeps the dialog open and surfaces the message. Clear `updateConfig.error` on dialog close or retry. Rationale: the dialog already owns the apply lifecycle; the error belongs there, not in a separate toast.
**(d) Risk:** Low — additive prop, no behavior change on success. Note `RulesPage.tsx:289-303` (`handleGenerateAndReload`) and `ConfigCenterPage.tsx:364-373` (`handleHotReload`) already do this correctly with `mutateAsync` + try/catch + status — reuse that pattern.

### P1 — Mobile drawer does not close on navigation
**(a) Location:** `AppShell.tsx:105-107` — `useEffect(() => { setMobileOpen(false) }, [])` has **empty deps**, so it runs once on mount (where `mobileOpen` is already false) and never again. The comment "Close mobile drawer on route change" is dead. `renderItem` (`AppShell.tsx:149-172`) renders `NavLink` with no `onClick` to close.
**(b) Impact:** On mobile (<768px), the operator opens the drawer, taps "Alerts", the route changes, but the drawer + backdrop remain fully visible over the new page. They must manually tap the X or backdrop to see content. This breaks the primary navigation loop on mobile.
**(c) Fix:** Add `location.pathname` to the effect deps: `}, [location.pathname])`. Or add `onClick={() => setMobileOpen(false)}` to each `NavLink` in `renderItem`. The dep fix is one character and covers all nav items.
**(d) Risk:** Negligible.

### P1 — "Cancel" silently discards all unsaved config edits
**(a) Location:** `DriversPage.tsx:155-157` (and the same pattern in `TransportsPage.tsx` / `RulesPage.tsx` unsaved-changes banners) — the ghost button labeled `t('common.cancel')` calls `useConfigStore.getState().revert()`.
**(b) Impact:** "Cancel" reads as "dismiss this banner." It actually **throws away all staged driver/transport/rule edits** in the working config. An operator who built up several changes, sees the banner, and taps "Cancel" expecting to just hide the notice loses everything with no confirmation and no undo.
**(c) Fix:** Relabel to `t('common.discardChanges')` / `t('common.revert')` (add the key), and gate behind an `AlertDialog` confirming "Discard N unsaved changes?" Alternatively, rename to "Revert" and add a tooltip. Rationale: the action is destructive on in-memory work; the label must say so.
**(d) Risk:** Low — label + confirmation only. Coordinate the new i18n key across en/zh-CN.

### P2 — Dual "Apply Changes" buttons when dirty
**(a) Location:** `DriversPage.tsx:113-123` (header button) **and** `DriversPage.tsx:159-167` (banner button) — both render when `dirty`, both open `applyDialogOpen`. Same in TransportsPage/RulesPage.
**(b) Impact:** Two identical primary actions on screen at once. The operator wonders which to use; it clutters the header. Inconsistent primary-action placement (the design system should have one obvious CTA per page state).
**(c) Fix:** Keep the banner as the single apply/revert control surface when dirty; remove the header apply button (or vice-versa). The banner is co-located with the "unsaved changes" explanation, which is the better home.
**(d) Risk:** Low.

### P2 — Runtime empty states flash during initial load
**(a) Location:** `DriversPage.tsx:270-273` (`drivers.length === 0` → `t('drivers.empty')`), `TransportsPage.tsx` (same `data?.transports || []` + empty card), `AlertsPage.tsx:284-292` (green `CheckCircle2` "No failed dead letters" while `useDeadLetters` is still fetching).
**(b) Impact:** On first paint, before the query resolves, `data` is undefined → array is empty → the "no data" empty state shows for ~100-500ms, then the real list pops in. For Alerts, a **green checkmark** "No dead letters" appears then vanishes — briefly giving false confidence that the queue is clean.
**(c) Fix:** Gate the empty state behind `!isLoading` (destructure `isLoading` from the hook). Show a `Skeleton` row or the `Loader2` spinner while `isLoading && list.length === 0`. `DashboardPage.tsx:77-84` and `TagExplorerPage.tsx:686-690` already do this correctly — mirror them.
**(d) Risk:** Negligible.

### P2 — Topbar "Realtime stream connected" is always green
**(a) Location:** `AppShell.tsx:487-494` — on any `/monitor` route, renders a green dot (`bg-status-running glow-running`) + `t('monitor.realtimeStreamConnected')` unconditionally.
**(b) Impact:** The badge claims the realtime WebSocket stream is connected regardless of actual WS state. If the proxy dropped the WS upgrade or the stream is dead, the operator is misled. `EventLogTerminal.tsx:144-171` writes the *real* WS status into the terminal, but the always-visible topbar badge contradicts it during outages.
**(c) Fix:** Drive the badge from a shared WS-health signal (the terminal already tracks `open/closed/error/rejected`). At minimum, soften the label to "Realtime" and color the dot from a connection-status context. If no signal is available yet, remove the dot and keep a neutral label to avoid false positives.
**(d) Risk:** Medium — requires exposing WS status up to the shell; scope to a shared hook.

### P2 — Route progress bar fires once, not on navigation
**(a) Location:** `AppShell.tsx:86-98` — `useEffect` with `[]` deps animates `30→70→100→0` on mount only.
**(b) Impact:** Labeled "Route progress bar" but it never fires on subsequent route changes, so it's decorative on first load and invisible thereafter. Lazy route chunks (Suspense) get no progress indication.
**(c) Fix:** Depend on `location.pathname` and drive `progress` from the Suspense transition (or a router pending-state). At minimum, add `location.pathname` to deps so it re-fires per navigation.
**(d) Risk:** Low.

### P2 — ErrorBoundary exposes full stack; Reset is unreliable
**(a) Location:** `ErrorBoundary.tsx:61-64` (renders `error.message + error.stack` in a `<pre>`), `ErrorBoundary.tsx:66-69` ("Reset" calls `this.reset()` clearing boundary state only).
**(b) Impact:** A production operator sees a raw JS stack trace — intimidating and a mild info-leak. "Reset" re-renders the same subtree without clearing TanStack Query cache, so a deterministic error (bad cached data) immediately re-throws, making Reset appear broken; only "Reload" reliably recovers.
**(c) Fix:** In production, show the message + a collapsed/hidden stack behind a "Show details" toggle. On Reset, also `queryClient.clear()` / invalidate to drop poisoned cache. Rationale: the boundary is keyed on pathname (`App.tsx:70`), so Reset + cache clear gives a genuine fresh subtree.
**(d) Risk:** Low — guard stack behind a toggle; cache clear is safe.

### P2 — Hardcoded English aria-labels (i18n gap)
**(a) Location:** `AppShell.tsx:204` ("Collapse sidebar"), `:214` ("Close sidebar"), `:227` ("Expand sidebar"), `:338` ("Select theme"), `:390` ("Disconnect"), `:461` ("Open menu"), `:193` ("CoreC home").
**(b) Impact:** Screen-reader users in the zh-CN locale hear English labels for primary nav/controls, breaking the localized experience.
**(c) Fix:** Replace each with `t('aria.x')` and add the keys to both `en.json` and `zh-CN.json`.
**(d) Risk:** Negligible — string-only.

### P2 — THEME_LABELS not internationalized
**(a) Location:** `themeStore.ts:23-31` — `Light/Dark/Sepia/Nord/Midnight/Forest` hardcoded; consumed in `AppShell.tsx:347,362,372` and `InstancePanel.tsx:137,147`.
**(b) Impact:** Theme menu shows English names in both locales.
**(c) Fix:** Move labels to i18n (`settings.theme.light`, etc.) or accept English as universal theme names. If the latter, document the decision.
**(d) Risk:** Negligible.

### P2 — Hardcoded "Dashboard" + no-results fallback
**(a) Location:** `InstancePanel.tsx:108` (`<span>Dashboard</span>`), `DriversPage.tsx:191` (`t('common.noResults', {...}) || \`No results for "${searchQuery}"\``).
**(b) Impact:** "Dashboard" badge in the home header is always English. The no-results fallback is dead in practice (i18n returns the string), but the English literal is a latent gap if the key is ever removed.
**(c) Fix:** `t('nav.dashboard')` for the badge; drop the `||` English fallback (rely on the key).
**(d) Risk:** Negligible.

### P2 — Mobile drawer lacks dialog a11y semantics
**(a) Location:** `AppShell.tsx:426-436` — plain `<aside>` + backdrop, no `role="dialog"`, no `aria-modal="true"`, no focus trap, no Escape-to-close.
**(b) Impact:** Keyboard/screen-reader users can Tab out of the drawer into the hidden page behind it; Escape doesn't close it.
**(c) Fix:** Wrap the mobile drawer in Radix `Dialog` (reuse the existing `@radix-ui/react-dialog` dependency) or add `role="dialog" aria-modal="true"`, an Escape handler, and a focus trap. Radix gives all three for free.
**(d) Risk:** Low-medium — refactor to Radix Dialog changes the markup; test mobile nav.

### P2 — ConnectionGate retry button inconsistent + raw error
**(a) Location:** `App.tsx:105-118` — raw `<button>` with inline classes (not the `Button` component); displays `{error}` directly.
**(b) Impact:** Styling diverges from the rest of the app. The error string (`ConnectionContext.tsx:133-141`) can be a raw `err.message` (e.g., "Failed to fetch") — unfriendly and locale-neutral.
**(c) Fix:** Use `<Button variant="default">`, and map known error shapes (`AbortError`→timeout, network→`t('connection.failed')`) to translated strings before display.
**(d) Risk:** Negligible.

### P2 — Dead-letter retry disables all buttons for one pending
**(a) Location:** `AlertsPage.tsx:318` — `disabled={writeMutation.isPending}` on every retry button.
**(b) Impact:** Retrying one dead letter disables retry on all others until it settles. For a queue with many entries, the operator must wait serially.
**(c) Fix:** Track the pending entry key (e.g., `pendingRetryKey` state) and disable only the matching button.
**(d) Risk:** Low.

### P2 — Icon-only InstanceCard edit button missing aria-label
**(a) Location:** `InstanceCard.tsx:421-423` — `<Button size="sm" variant="outline">` with only a `Pencil` icon, no `aria-label` or `title`.
**(b) Impact:** Screen readers announce "button" with no purpose. (The config-managed edit/delete in `DriversPage.tsx:220-235` use `title=` — better, but `title` isn't a reliable a11y name; add `aria-label`.)
**(c) Fix:** Add `aria-label={t('common.edit')}`.
**(d) Risk:** Negligible.

### P2 — Config status auto-dismiss too short to read
**(a) Location:** `ConfigCenterPage.tsx:101` — `STATUS_AUTO_DISMISS_MS = 2500`.
**(b) Impact:** Success/error notices for import, sync, log-level change, and hot-reload vanish in 2.5s — faster than an operator can read "Config reloaded successfully."
**(c) Fix:** Raise to ~4000-5000ms (the shared `useStatusMessage` default is already 4000ms; this page overrides it shorter). Make errors non-auto-dismissing (require explicit dismiss).
**(d) Risk:** Negligible.

### P2 — Homepage probe: 5 endpoints × N instances every 15s, no backoff
**(a) Location:** `useHomepageProbe.ts:19` (15s interval), `:75` (5 parallel fetches per instance), `:222` (`setInterval` with no error backoff).
**(b) Impact:** An operator with 10 instances generates 50 requests every 15s continuously, even when instances are unreachable. No backoff on repeated `Connection failed` — the probe hammers dead endpoints.
**(c) Fix:** Exponential backoff per-instance on consecutive failures (e.g., cap at 60s while erroring). Consider pausing probes for instances whose tab/card isn't visible.
**(d) Risk:** Medium — changes probe cadence; verify card freshness expectations.

---

## Prioritized Fixes

| # | Sev | Effort | Fix |
|---|-----|--------|-----|
| 1 | P1 | M | Add `applyError` to `ConfigApplyConfirmationDialog` + `onError` in all 4 callers (Drivers/Transports/Rules/ConfigCenter apply paths) |
| 2 | P1 | S | Add `location.pathname` to `AppShell.tsx:107` effect deps (mobile drawer close on nav) |
| 3 | P1 | S | Relabel revert button to "Discard changes" + confirm `AlertDialog`; add i18n key |
| 4 | P2 | S | Gate runtime empty states behind `!isLoading` in Drivers/Transports/Alerts |
| 5 | P2 | S | Remove duplicate header "Apply Changes" button; keep banner-only |
| 6 | P2 | M | Drive topbar realtime badge from real WS health (shared hook) |
| 7 | P2 | S | Add `location.pathname` dep to progress-bar effect |
| 8 | P2 | S | i18n all hardcoded aria-labels + THEME_LABELS + "Dashboard" badge |
| 9 | P2 | S | Collapse ErrorBoundary stack behind toggle; clear query cache on Reset |
| 10 | P2 | M | Mobile drawer → Radix Dialog (focus trap + Escape + aria-modal) |
| 11 | P2 | S | ConnectionGate: use `Button` + translate error strings |
| 12 | P2 | S | Per-entry dead-letter retry disable; raise config status dismiss to 4-5s; icon-button aria-labels |
| 13 | P2 | M | Homepage probe per-instance exponential backoff on error |

**Positive exemplars to preserve:** `RulesPage` toggle (`handleToggle` + `togglingIndices` + error banner, `RulesPage.tsx:210-226`), `WriteControlPage` write (`mutateAsync` + try/catch + `extractApiError`, `:172-194`), `TagExplorerPage` loading/error/empty triad (`:612-710`), `ConfigApplyConfirmationDialog` diff + restart warning (excellent pre-apply UX — only missing the *post*-apply error path).

---

## i18n Gaps

- **Key parity: 100%** — `en.json` and `zh-CN.json` each have 1161 flat keys; **0 missing** in either direction. 17 values are identical across locales, all intentional (URLs, `mTLS`/`QoS`/`TLS`/`Webhook`, code placeholders). Coverage is strong.
- **Hardcoded aria-labels (English):** `AppShell.tsx` lines 193, 204, 214, 227, 338, 390, 461 — "CoreC home", "Collapse/Close/Expand sidebar", "Select theme", "Disconnect", "Open menu". Add `aria.*` keys.
- **THEME_LABELS:** `themeStore.ts:23-31` — "Light/Dark/Sepia/Nord/Midnight/Forest" not in i18n; shown in both AppShell and InstancePanel theme menus.
- **Hardcoded visible text:** `InstancePanel.tsx:108` ("Dashboard" badge).
- **Hardcoded English fallback:** `DriversPage.tsx:191` (`|| \`No results for "${searchQuery}"\``) — dead but latent.
- **Raw error strings shown to users:** `App.tsx:108` (`{error}`), `ConnectionContext.tsx:137` (`err.message`) — not translated; map to `connection.*` keys.
- **Example placeholders in wizards** (`DriverWizard` "plc-modbus", `TransportWizard` "cloud-mqtt", etc.): technical sample values in English — acceptable, but document if intentional.
- **`defaultValue` inline fallbacks** (e.g., `App.tsx:60,114`, `AlertsPage:250,289,403,409`, `DashboardPage:94,106`): these are safe (i18next returns the default if the key is missing), but several duplicate the canonical key value — consider verifying the keys exist to drop the inline defaults.
