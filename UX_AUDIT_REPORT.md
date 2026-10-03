# CoreC-Dashboard — UX & Responsive Layout Audit Report

**Scope:** React 19 + Tailwind v4 + Radix UI. Target: ops/control engineers, desktop + mobile.
**Method:** Static analysis of `src/index.css`, layout, monitor, admin, UI primitives, and i18n files.
**Verdict:** Strong visual design and a11y foundations (Radix focus traps, aria-labels, reduced-motion). Key gaps: **no tablet breakpoint**, **no toast system**, **tag table unusable on mobile**, **sub-40px touch targets**, **dialogs touch screen edges on mobile**, and a handful of hardcoded strings.

---

## 1. Responsive Breakpoints

### 1.1 [MAJOR] No tablet breakpoint — binary mobile/desktop switch at 768px
**File:** `src/components/layout/useSidebarState.ts:8,11`
The only breakpoint is `matchMedia('(max-width: 767px)')`. Below 768px → mobile drawer; at 768px+ → full desktop sidebar+content. There is **no tablet (768–1024px) treatment**. On a 768px tablet the desktop layout renders with a 220px sidebar + 16px gap + 32px padding ≈ 268px overhead, leaving ~500px for content — workable but unoptimized, and the `maxWidth: calc(220px + 1448px)` (`AppShell.tsx:143`) means the centered group doesn't even engage until ~1668px.
**Fix:** Add a tablet tier (e.g. `768–1024px`): auto-collapse the sidebar to icon-rail (72px) and/or reduce content padding. Consider a 3-tier `isMobile / isTablet / isDesktop` state.

### 1.2 [MINOR] Inconsistent responsive grid variants
**Files:** Multiple admin editors.
Several grids use only `grid-cols-2` with no responsive breakpoints, so they don't expand on wide screens or adapt on narrow ones:
- `src/features/home/InstanceCard.tsx:222` — `grid grid-cols-2 gap-2` (metrics)
- `src/features/admin/DriversPage.tsx:235,336` — `grid grid-cols-2`, `grid grid-cols-3`
- `src/features/admin/TransportsPage.tsx:210,319` — same
- `src/features/admin/NodeConfigEditor.tsx:255`, `RuleGroupEditor.tsx:169`, `RuleParts.tsx:185,347` — `grid grid-cols-2`
By contrast, `DashboardPage.tsx:111` correctly uses `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`.
**Fix:** Add `sm:`/`lg:` variants where the content would benefit from reflow.

### 1.3 [MAJOR] Fixed-pixel grid columns in DriverWizard tag table overflow on mobile
**File:** `src/features/admin/DriverWizard.tsx:466,477`
```
grid grid-cols-[1fr_1fr_100px_1fr_90px_36px]
```
Three columns are fixed (100px + 90px + 36px = 226px). The four `1fr` columns need meaningful width for text inputs. Inside a dialog on a 360px mobile screen this **will overflow** — and the wrapper (`rounded-md border overflow-hidden`, line 465) clips rather than scrolls, so columns/inputs get cut off.
**Fix:** Wrap in `overflow-x-auto`, or switch to a responsive layout (stacked rows on mobile, grid on `sm:`+).

---

## 2. Mobile Layout Issues

### 2.1 [CRITICAL] TagTable is unusable on mobile — 8 columns squeeze into ~360px
**File:** `src/components/monitor/TagTable.tsx:84-151`, `src/lib/tagExplorer.ts:10-19`
The table uses `display:block` with flex rows and **percentage** column widths (tag 20%, driver 12%, group 10%, value 14%, type 10%, quality 10%, timestamp 16%, actions 8%). Percentages sum to 100% so there's no horizontal scroll — instead every column shrinks proportionally. On a 360px mobile screen: tag col ≈ 72px, driver ≈ 43px, actions ≈ 29px. With `px-4` (32px) padding per cell, usable text width is near zero; everything truncates. There is **no mobile card/list alternative**.
**Fix:** Render a stacked card list on mobile (`<768px`) and the virtualized table on desktop. Or make the table horizontally scrollable with `min-width` on columns and `overflow-x-auto`.

### 2.2 [MAJOR] Dialogs touch screen edges on mobile — no horizontal margin
**File:** `src/components/ui/dialog.tsx:38`, `src/components/ui/alert-dialog.tsx:36`
`DialogContent` is `fixed left-[50%] ... w-full max-w-lg translate-x-[-50%]`. With `w-full` on mobile, the dialog spans **edge to edge** (0px gap to viewport). `p-6` (24px) provides internal padding, but the card has no visible separation from the screen edge — looks broken on mobile.
**Fix:** Use `w-[calc(100%-1.5rem)] sm:w-full` or add `mx-4 sm:mx-0` so mobile gets a visible gutter.

### 2.3 [MAJOR] Sub-40px touch targets on icon/action buttons
**Files:** Multiple.
Several interactive controls are below the 40×40px (ideally 44×44px) touch-target minimum:
| File:Line | Class | Rendered size |
|---|---|---|
| `TagRow.tsx:127` | `h-7 px-2` | 28px height |
| `RulesPage.tsx:308,317` | `p-1.5` + `w-3.5 h-3.5` icon | ~28px |
| `DriversPage.tsx:216,224` | `p-1.5` + `w-3.5 h-3.5` | ~28px |
| `TransportsPage.tsx` (same pattern) | `p-1.5` | ~28px |
| `EventLogTerminal.tsx:204,221` | `h-7 px-2` | 28px |
| `ConfigCenterYaml.tsx:48` | `h-7 w-7` | 28px |
| `InstanceCard.tsx:166` | `h-7 w-7` | 28px |
| `button.tsx:23` (size `sm`) | `h-8` | 32px |

**Fix:** Increase to `h-9`/`p-2` minimum (36px) for touch targets, or add invisible padding (`before:absolute before:inset-[-6px]`) to expand the hit area without changing visual size.

### 2.4 [MAJOR] `font-size: 20px` body base creates density inconsistency
**File:** `src/index.css:310`
`body { font-size: 20px; }` but `html` has no explicit font-size, so `rem` = 16px (browser default). This means:
- `text-xs` = 0.75rem = **12px**, `text-sm` = 14px, `text-base` = 16px (rem-based, unaffected by body 20px)
- **Unclassed text inherits 20px** from body — jarringly larger than the 12–14px data tables.

The 20px base is a deliberate readability choice, but it creates a two-tier system: data-dense tables at 12px vs any unclassed text at 20px. On mobile, 12px table text is small for touch users, while 20px unclassed text is large.
**Fix:** Either set `html { font-size: 16px }` and `body { font-size: 1rem }` for consistency, or audit for unclassed text and add explicit `text-sm`/`text-base`.

### 2.5 [MINOR] `text-[8px]` histogram labels — below readable minimum
**File:** `src/features/admin/DiagnosticsPage.tsx:71`
`text-[8px]` on histogram bucket labels. 8px is far below any legibility threshold, especially on mobile.
**Fix:** Use `text-[10px]` minimum or `text-xs` (12px).

### 2.6 [MINOR] TagToolbar selects use `w-auto` — long driver names push row off-screen on mobile
**File:** `src/components/monitor/TagToolbar.tsx:62,78`
The driver/group `SelectTrigger` uses `w-auto` (content-sized). The toolbar's inner row (`flex flex-1 items-center space-x-2 w-full`, line 49) doesn't wrap. A long driver name expands the trigger and can overflow the row on mobile (the parent `flex-col md:flex-row` stacks on mobile, but the inner row is still a non-wrapping flex).
**Fix:** Use `min-w-0` + `max-w-[8rem]` on the selects, or allow the inner row to wrap with `flex-wrap`.

---

## 3. Layout Overflow

### 3.1 [MINOR] `whitespace-nowrap` on SelectTrigger vs `line-clamp-1` child — contradictory
**File:** `src/components/ui/select.tsx:17`
The trigger has `whitespace-nowrap` (prevents wrapping) and `[&>span]:line-clamp-1` (clips to 1 line). The `line-clamp-1` wins for display, but `whitespace-nowrap` is redundant and can cause the trigger's intrinsic width to grow beyond its container in `w-auto` contexts (see 2.6).
**Fix:** Remove `whitespace-nowrap` from the trigger; rely on `line-clamp-1` + `min-w-0`.

### 3.2 [MINOR] `overflow-hidden` on cards that contain tables — clips rather than scrolls
**Files:** `RulesPage.tsx:343`, `DiagnosticsPage.tsx:382,433`, `TopologyPage.tsx:100`
Cards with `overflow-hidden` wrap tables/grids. Where the inner content has its own `overflow-x-auto` (e.g. `RulesPage.tsx:277`) this is fine. But where it doesn't, fixed-width content is silently clipped. Verify each `overflow-hidden` card has an inner scroll container for wide content.
**Fix:** Audit; replace `overflow-hidden` with `overflow-x-auto` where horizontal scroll is intended, or add an inner `overflow-x-auto` wrapper.

### 3.3 [OK] Long YAML/config text handling
ConfigCenterPage YAML mode uses Monaco editor (`YamlEditorCard`) which handles long lines with native scroll. Form mode uses structured editors. InstanceCard URL uses `break-all` (`InstanceCard.tsx:193`). Dead-letter command strings use `break-all` (`AlertsPage.tsx:490`). **No issues found.**

---

## 4. Interaction Patterns

### 4.1 [MAJOR] No toast/notification system — no transient success feedback
**Finding:** Grep for `sonner|useToast|toast|Toaster|react-hot-toast` returns **zero results**. All feedback is inline banners (`StatusMessageView`, `ValidationBanner`, `UnsavedChangesBanner`) or local component state (`WriteControlPage`'s `successMsg`). Operators get **no immediate visual confirmation** for successful tag writes, rule deletes, config applies, or instance edits — the dialog just closes. For an ops/control tool where write actions are safety-critical, the absence of a confirmation toast is a significant UX gap.
**Fix:** Add a toast system (e.g. `sonner`) and emit success toasts on mutation success (`useWriteTag`, `useUpdateConfig`, `deleteInstance`, etc.).

### 4.2 [MINOR] No skeleton loaders — all loading states are spinners
**Files:** All pages use `Loader2 animate-spin` + text.
`DashboardPage.tsx:76` comments "Loading skeleton" but actually renders a centered spinner. Loading UX is consistent (spinners everywhere) but provides no content shape preview, causing layout shift when data arrives. For data-dense pages (dashboard KPIs, tag table) skeletons would improve perceived performance.
**Fix:** Add skeleton components for dashboard KPI cards and tag table rows.

### 4.3 [MINOR] No optimistic updates — all mutations are pessimistic
Mutations use TanStack Query (`useWriteTag`, `useUpdateConfig`) with default (pessimistic) behavior. Tag writes and config applies wait for server round-trip. For a real-time monitoring tool this is acceptable (correctness > speed for control writes), but the UI shows no intermediate state beyond `disabled={isPending}`.
**Fix:** Acceptable as-is for safety-critical writes. Consider optimistic UI for non-destructive operations (e.g. rule enable/disable toggle).

### 4.4 [OK] Empty states, error states, destructive confirmations — well handled
- **Empty states:** `InstancePanel` (logo + CTA), `DriversPage`/`TransportsPage` (dashed empty card), `TagTable` (`noPoints`), `AlertsPage` (multiple empty states), `WriteControlParts` (no dead letters).
- **Error states:** Consistent `AlertCircle` + error message + retry button pattern across all pages.
- **Destructive confirmations:** `InstanceCard` delete dialog, `RulesPage`/`DriversPage`/`TransportsPage` `AlertDialog`, `WriteControlPage` confirm + clear-all confirm. All use Radix AlertDialog with i18n strings.

---

## 5. Accessibility

### 5.1 [MAJOR] No `aria-live` regions for real-time data updates
**Finding:** Only one `role="status"` exists (`AppShell.tsx:39`, mobile connection dot). The **live tag stream** (TagTable flash animation), **alerts feed** (AlertsPage WebSocket logs), **dead letter queue**, and **config apply results** have **no screen-reader announcements**. Real-time data updates are visual-only. An SR user gets no notification when new alerts arrive or tag values change.
**Fix:** Add `aria-live="polite"` + `aria-atomic` to the alerts feed container and a status region for connection state changes. For the tag stream, announce count changes rather than every value.

### 5.2 [MAJOR] TagTable — every virtual row is tabbable, creating huge tab-stop list
**File:** `src/components/monitor/TagRow.tsx:60`
Each `<tr>` has `tabIndex={0}`. For a tag set of 10,000 tags (virtualized), this creates up to 10,000 tab stops in the DOM order (only ~overscan rows are rendered, but still dozens). Keyboard users must tab through every visible row to reach the write button or next control.
**Fix:** Use a roving-tabindex grid pattern: only one row tabbable at a time, arrow keys navigate, Enter activates. Or make the row click-only and provide a separate accessible "select tag" action.

### 5.3 [MAJOR] `text-status-error` on small text fails WCAG AA contrast
**File:** `src/index.css:79` (light theme `--status-error: 354 70% 54%` → `#d8485a`)
`#d8485a` on white = **~3.9:1 contrast**, below WCAG AA 4.5:1 for normal text. Used as `text-status-error` on `text-xs` (12px) in: `TagWriteDialog.tsx:53`, `AlertsPage.tsx:479`, `WriteControlParts.tsx:278`, `DashboardPage.tsx:91`, `TagTable.tsx:68`. Also `--status-warning: 36 78% 44%` (`#c8861a`) = ~4.3:1, borderline.
**Fix:** Darken status-error for text use (e.g. `354 70% 47%` → ~5:1), or use a dedicated `--status-error-text` token. Status colors as **background** (with white text) are fine; the issue is status colors as **text on light background**.

### 5.4 [OK] aria-labels, keyboard nav, focus traps — well handled
- **aria-labels:** Present on all icon-only buttons (AppShell menu, SidebarNav collapse/disconnect, InstanceSelector, ThemeSelector, edit/delete buttons, card role=button).
- **Focus traps:** Radix Dialog/Sheet/Select/AlertDialog handle focus trapping and restore natively.
- **Keyboard:** TagRow, driver/transport cards have `tabIndex=0` + `onKeyDown` for Enter/Space. `TagTrendPanel` closes on Escape.
- **Reduced motion:** `index.css:500-507` globally disables animations/transitions under `prefers-reduced-motion: reduce`. Excellent.

---

## 6. Visual Consistency

### 6.1 [MINOR] Border-radius token vs utility mismatch
**File:** `src/index.css:43-45` defines `--radius-sm: 8px / md: 12px / lg: 16px` and `--radius: 13px` (line 73), but components use a mix of Tailwind utilities: `rounded-md` (inputs, selects), `rounded-lg` (Card), `rounded-xl` (mobile menu button), `rounded-2xl` (AppShell content card `AppShell.tsx:64`), `rounded-full` (buttons, dots). The `--radius` token is **never referenced** by any component. This produces a slightly inconsistent rounding scale (8/12/16px tokens vs 6/8/12/16/24px utilities).
**Fix:** Either drive components from the `--radius` token via `rounded-[var(--radius)]`, or drop the unused token and document the utility-based scale.

### 6.2 [MINOR] Hardcoded color `bg-[#0c0d12]` in EventLogTerminal
**File:** `src/components/admin/EventLogTerminal.tsx:228`
`bg-[#0c0d12]` is a hardcoded dark background for the xterm terminal. It doesn't adapt to theme (always dark, which is intentional for a terminal) but should be a named token for maintainability.
**Fix:** Add `--color-terminal-bg: #0c0d12` to `@theme` and use `bg-terminal-bg`.

### 6.3 [MINOR] Mixed shadow approach — tokens via inline style vs Tailwind utilities
**Files:** `AppShell.tsx:65,129` uses `style={{ boxShadow: 'var(--shadow-card)' }}`; components use `shadow-sm`/`shadow-md`/`shadow-lg`/`shadow-2xl`.
The custom shadow tokens (`--shadow-card`, `--shadow-panel`) are applied via inline style, while Radix primitives and buttons use Tailwind shadow utilities. Both work but it's a split system.
**Fix:** Map the custom shadows into Tailwind's `--shadow-*` theme namespace so `shadow-card` utility works, eliminating inline styles.

### 6.4 [OK] Spacing, color tokenization — consistent
Spacing uses Tailwind's scale consistently (`p-4`, `gap-3`, `space-y-4`). Status/chart colors are fully tokenized in `@theme inline` with 6 theme variants (light, dark, sepia, nord, midnight, forest). Inline `hsl(var(--primary))` gradients (`AppShell.tsx:116`) are acceptable for decorative effects.

---

## 7. i18n Completeness

### 7.1 [OK] Key parity is perfect — 1181 keys in both en.json and zh-CN.json
Programmatic comparison: **0 missing keys** in either direction. 16 identical values are all legitimate (technical terms: "p50", "mTLS", "QoS", "URL", "Webhook", placeholders like "value * 2 + 1").

### 7.2 [MAJOR] Hardcoded user-facing strings not going through `t()`
| File:Line | String | Context |
|---|---|---|
| `DriversPage.tsx:268` | `Loading…` | Runtime loading state (other pages use `t('common.loading')`) |
| `TransportsPage.tsx:251` | `Loading…` | Same — inconsistent with sibling pages |
| `RulesPage.tsx:199` | `aria-label="Dismiss"` | Validation banner close button |
| `InstanceDialog.tsx:68-76` | `'Default'`, `'Blue'`, `'Green'`, `'Amber'`, `'Red'`, `'Purple'`, `'Pink'` | Color label dropdown options — user-visible, not translated |

**Fix:** Replace with `t()` calls; add keys to both JSON files.

### 7.3 [MINOR] Language toggle labels hardcoded — arguably acceptable
**Files:** `InstancePanel.tsx:162` (`'中' / 'EN'`), `SidebarNav.tsx:184` (`'中文' / 'English'`)
Language names in native script is a common i18n convention (the label tells users what they'll switch *to*). **Acceptable as-is**, but the two locations use different labels (`中`/`EN` vs `中文`/`English`) — inconsistent.
**Fix:** Pick one form and use it in both places.

### 7.4 [MINOR] Misleading `defaultValue` doesn't match the key's real meaning
**File:** `src/features/monitor/AlertsPage.tsx:221`
```js
t('alerts.realtimeWarningDesc', { defaultValue: 'Real-time alerts & dead letter queue' })
```
The actual `alerts.realtimeWarningDesc` value in `en.json` is "Pushed live over WebSocket /logs filter (level ≥ 4)" — the `defaultValue` describes a different concept. This is misleading for maintenance (the fallback would show wrong text if the key were ever removed). The same key is used correctly at line 270 with a matching defaultValue.
**Fix:** Update the defaultValue at line 221 to match the key's actual meaning, or remove the redundant defaultValue.

### 7.5 [MINOR] Example placeholders hardcoded in DriverWizard
**File:** `src/features/admin/DriverWizard.tsx:482,488` — `placeholder="temperature"`, `placeholder="40001"`
These are field examples. Arguably acceptable (examples are often left untranslated), but for consistency with the rest of the wizard (which uses `t()` for placeholders), they should be translated.
**Fix:** Add `driverWizard.tagExample` / `driverWizard.addressExample` keys.

---

## Summary by Severity

| Severity | Count | Key items |
|---|---|---|
| **CRITICAL** | 1 | TagTable unusable on mobile (2.1) |
| **MAJOR** | 9 | No tablet breakpoint (1.1), DriverWizard fixed grid overflow (1.3), dialogs touch edges (2.2), sub-40px touch targets (2.3), 20px font inconsistency (2.4), no toast system (4.1), no aria-live (5.1), TagTable tab stops (5.2), status-error contrast (5.3), hardcoded strings (7.2) |
| **MINOR** | 11 | Inconsistent grids (1.2), text-[8px] (2.5), w-auto selects (2.6), nowrap contradiction (3.1), overflow-hidden cards (3.2), no skeletons (4.2), no optimistic UI (4.3), radius mismatch (6.1), hardcoded color (6.2), shadow split (6.3), i18n minors (7.3–7.5) |

**Top 5 recommendations (highest impact):**
1. **Mobile tag table** → stacked card list `<768px` (critical for the primary monitoring view on mobile).
2. **Toast system** → add `sonner`; emit on all mutation success/failure (ops tool needs action confirmation).
3. **Tablet breakpoint** → 3-tier responsive state; auto-collapse sidebar at 768–1024px.
4. **Touch targets** → bump all `h-7`/`p-1.5` action buttons to `h-9`/`p-2` minimum.
5. **Dialog mobile margin** → `w-[calc(100%-1.5rem)]` on DialogContent/AlertDialogContent for visible gutter.
