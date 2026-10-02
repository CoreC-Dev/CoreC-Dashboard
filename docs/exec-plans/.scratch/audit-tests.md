# Test-Coverage Audit (subagent: 2049fd38)

## Summary
The repo has **18 test files (~3,339 lines)** covering **96 non-test source files**. Coverage is concentrated and high-quality in the `src/lib` validation layer (`configSchema`, `prometheus`, expr validators, `utils`) and in `stores/configStore` + `api/endpoints` error-normalization. However, large swaths of behaviorally-critical code are **completely untested**: `instanceStore` (secret storage + import/export), `api/client.ts` (timeout/abort/401), `api/websocket.ts` (rate-limit + reconnect), `contexts/ConnectionContext.tsx` (probe lifecycle), `features/home/useHomepageProbe.ts` (parallel multi-instance probe), and all React-query hooks in `api/hooks`. **No vitest config exists** — there is no coverage measurement, no global jsdom setup, and `@testing-library/jest-dom` is installed but never configured, so its DOM matchers are unavailable. `npm test` runs `vitest run` with no `--coverage`, so coverage is never measured. The two `.tsx` "tests" for admin pages are pure smoke (assert only that a container is truthy) and would pass against a broken render.

## Test inventory (files + line counts)
| File | Lines |
|---|---|
| src/lib/configSchema.test.ts | 680 |
| src/stores/configStore.test.ts | 497 |
| src/components/wizard/ConfigApplyConfirmationDialog.test.ts | 239 |
| src/hooks/useConfigValidation.test.ts | 231 |
| src/lib/prometheus.test.ts | 243 |
| src/lib/ruleExprValidator.test.ts | 214 |
| src/lib/transformExprValidator.test.ts | 203 |
| src/api/endpoints/index.test.ts | 176 |
| src/lib/entityValidation.test.ts | 156 |
| src/lib/configTemplates.test.ts | 101 |
| src/lib/utils.test.ts | 97 |
| src/lib/settingsRegistry.test.ts | 79 |
| src/hooks/useConfigHistory.test.ts | 71 |
| src/hooks/useDebouncedValue.test.ts | 67 |
| src/hooks/useStatusMessage.test.ts | 61 |
| src/components/wizard/EntitySearchBar.test.ts | 58 |
| src/lib/constants.test.ts | 53 |
| src/features/admin/pages_render_smoke.test.tsx | 113 |
**Total ≈ 3,339 lines across 18 files.**

## Coverage map (tested vs untested modules)

**TESTED (co-located/associated, generally good quality):**
- `lib/`: configSchema✓ configTemplates✓ constants✓ entityValidation✓ prometheus✓ ruleExprValidator✓ settingsRegistry✓(shallow) transformExprValidator✓ utils✓
- `stores/configStore.ts` ✓ (excellent — CRUD, revert, edge cases)
- `api/endpoints/index.ts` ✓(partial — only 2 of 16 endpoints)
- `hooks/`: useConfigHistory✓ useConfigValidation✓(pure fn only) useDebouncedValue✓ useStatusMessage✓
- `components/wizard/`: ConfigApplyConfirmationDialog✓(pure fns only) EntitySearchBar✓(pure fn only)
- `features/admin/`: RulesPage + TransportsPage (smoke only)

**UNTESTED (non-trivial / critical):**
- `stores/instanceStore.ts` (296) — **secret storage, import/export** ❌
- `stores/themeStore.ts` (103) ❌
- `api/client.ts` (109) — **timeout/abort/401/204** ❌
- `api/hooks/index.ts` (215) — all 15 query/mutation hooks ❌
- `api/websocket.ts` (187) — **rate limiter, backoff, reconnect** ❌
- `api/activeConnection.ts` (29) ❌ (trivial singleton)
- `contexts/ConnectionContext.tsx` (188) — **probe lifecycle** ❌
- `features/home/useHomepageProbe.ts` (240) — **parallel probe** ❌
- `lib/`: configYaml(233) connectionInfo(269) writeValidation(61) ruleMatchEvaluator(113) ruleYaml(68) yamlDiff(64) exprShared(50) storage(40) ❌
- `hooks/`: useCountUp(44) useParsedConfig(17) ❌
- `features/home/InstanceDialog.tsx` (265) — **zodResolver form validation** ❌
- All admin feature pages except 2 smoke ❌
- `features/monitor/` (AlertsPage, DashboardPage, TagExplorerPage 1019) ❌
- `features/settings/GlobalSettingsPage.tsx` ❌
- `components/layout/AppShell.tsx` (595), `components/ErrorBoundary.tsx`, `components/admin/*`, `components/charts/*`, `components/ui/*`, `App.tsx` ❌

## Test quality issues
1. **`pages_render_smoke.test.tsx:98-112`** — asserts only `expect(container?.container).toBeTruthy()`. Pure smoke; no DOM/text assertions. Would pass if the page rendered an empty `<div>`. It guards the #185 infinite-loop regression but not any actual behavior.
2. **`ConfigApplyConfirmationDialog.test.ts:2-5`** and **`EntitySearchBar.test.ts:2`** — import only the exported pure helpers. The React components themselves are never rendered or asserted.
3. **`useConfigValidation.test.ts:3-12,47`** — tests `validateFullConfig` directly; the hook's memoization/recompute behavior is not exercised.
4. **`settingsRegistry.test.ts` (79 lines vs 878-line source)** — structural only; does not test field-level validation, enum constraints, type coercion, required-vs-optional flags, or invalid registry inputs.
5. **`endpoints/index.test.ts:4`** — imports only `getConfigsRaw` + `validateConfigs`. The remaining 14 endpoints have zero direct tests.

## Findings

- **Title**: No vitest config — coverage is never measured, no global jsdom setup
- **Location**: `vite.config.ts` (no `test` block); no `vitest.config.ts`/`vitest.workspace.*`; no setup file
- **Category**: 测试
- **Severity (suggested)**: P1
- **Evidence**: `npm test` → `vitest run` with no `--coverage`. No `test:{}` in `vite.config.ts`, no separate vitest config, no setup file. jsdom enabled only via per-file `// @vitest-environment jsdom` pragmas (4 files). `@testing-library/jest-dom` in devDeps but never imported/configured, so matchers like `toBeInTheDocument` are unavailable. Coverage gaps cannot be quantified.
- **Fix suggestion**: Add `vitest.config.ts` with `test:{ environment:'jsdom', setupFiles:['./src/test/setup.ts'], coverage:{ provider:'v8', reporter:['text','html'], include:['src/**/*.{ts,tsx}'], exclude:['**/*.test.*'] } }`; create `src/test/setup.ts` importing `@testing-library/jest-dom`; add `test:coverage` script.
- **Behavior impact**: 无

- **Title**: instanceStore completely untested — secret storage isolation + import/export dedup
- **Location**: `src/stores/instanceStore.ts` (entire 296 lines); no co-located test
- **Category**: 测试
- **Severity (suggested)**: P1
- **Evidence**: `stripSecret`/`persistInstances` split secrets into sessionStorage while metadata goes to localStorage (security-sensitive, lines 117-169). `importInstances` (251-290) handles merge/replace, duplicate-by-id/name detection, required-field skipping, and malformed-JSON → `{added:0,skipped:0}`. `loadInstances` (123-141) merges secrets back and tolerates corrupt storage. None exercised.
- **Fix suggestion**: Add `instanceStore.test.ts` (jsdom) covering: secret persisted to sessionStorage only / absent from localStorage; add/update/delete/reorder; import merge vs replace; import dedup by id and name; import skipping malformed entries; import non-array JSON; `clearAll`; `setProbeResult` ok/fail.
- **Behavior impact**: 无

- **Title**: api/client.ts apiRequest — timeout/abort/401/204/content-type routing untested
- **Location**: `src/api/client.ts:41-108`; only indirectly hit via `endpoints/index.test.ts`
- **Category**: 测试
- **Severity (suggested)**: P1
- **Evidence**: The wrapper translates `AbortError`+`timeoutId` into `ApiError(408)` (102-104), returns `undefined` for 204 (90-92), routes `application/json` vs text (94-99), throws `ApiError(0)` when no active connection (46-48), and respects a caller-supplied signal without auto-aborting (66-72). Never asserted.
- **Fix suggestion**: Add `client.test.ts` mocking `fetch` + `setActiveConnection`: no-connection throw; 401 → ApiError(401); 204 → undefined; json content-type → parsed; text → string; timeout → ApiError(408); caller signal respected and not auto-aborted.
- **Behavior impact**: 无

- **Title**: api/websocket.ts — rate limiter, exponential backoff, reconnect cap untested
- **Location**: `src/api/websocket.ts` (entire 187 lines); no test
- **Category**: 测试
- **Severity (suggested)**: P1
- **Evidence**: Sliding-window ring-buffer rate limiter (99-112, drops >500 msg/s), exponential backoff with ±20% jitter (164-171), `maxRetries=10` cap → `'rejected'` (159-162), upgrade-rejection detection on close codes 1006/1008/1011 (133-138), `scheduleReconnect` stopping when secret gone (151-155), and `destroy` nulling handlers (174-186) all untested.
- **Fix suggestion**: Add `websocket.test.ts` with a `WebSocket` mock + fake timers: assert >maxMsgPerSec messages dropped; backoff delay grows ~1.5×; after maxRetries status becomes `'rejected'`; close code 1008 before open → `'rejected'`; `destroy` prevents queued events.
- **Behavior impact**: 无

- **Title**: ConnectionContext probe lifecycle untested
- **Location**: `src/contexts/ConnectionContext.tsx:116-167`; no test
- **Category**: 测试
- **Severity (suggested)**: P1
- **Evidence**: Probe effect handles instance-not-found (117-122), success path (133-140), AbortError→"Connection timed out" (143-148), cleanup resetting probing on unmount (159-166), `probeNonce` reconnect trigger (169), `useConfigStore.reset()` on instance change (89-91). Smoke test mocks this context entirely.
- **Fix suggestion**: Add `ConnectionContext.test.tsx` rendering `ConnectionProvider` with mocked `getServerInfo`: success → isConnected true; reject → error message; not-found → "Instance not found"; unmount → probing cleared; reconnect() re-probes.
- **Behavior impact**: 无

- **Title**: useHomepageProbe — parallel multi-instance probe + abort untested
- **Location**: `src/features/home/useHomepageProbe.ts:75-239`; no test
- **Category**: 测试
- **Severity (suggested)**: P1
- **Evidence**: `probeInstance` uses `Promise.allSettled` over 5 endpoints (83-89), requires GET / to succeed else throws "Unreachable" (92-94), tolerates partial failures, propagates parent abort signal (64-67), `useHomepageProbe` aborts + clears interval on unmount (234-238). No test exercises partial-failure, abort, or the 15s interval.
- **Fix suggestion**: Add `useHomepageProbe.test.ts` with fake timers + fetch mock: all-up → lastKnownInfo populated; GET / fails → "Connection failed"; stats 500 but / ok → info without stats; unmount aborts in-flight requests.
- **Behavior impact**: 无

- **Title**: InstanceDialog form validation (zodResolver) untested — connection input
- **Location**: `src/features/home/InstanceDialog.tsx:79-80`; no test
- **Category**: 测试
- **Severity (suggested)**: P1
- **Evidence**: Connection-creation dialog validates baseUrl/secret/name via zod schema through react-hook-form. Neither schema nor form error rendering/submit gating tested. Malformed baseUrl or empty secret could create an unusable instance silently.
- **Fix suggestion**: Extract/test `instanceSchema` directly (empty name, invalid URL, short secret) and add a render test asserting error messages appear and submit disabled on invalid input.
- **Behavior impact**: 无

- **Title**: api/endpoints — 14 of 16 endpoints have no direct tests
- **Location**: `src/api/endpoints/index.ts:17-112`; `index.test.ts:4` imports only 2
- **Category**: 测试
- **Severity (suggested)**: P1
- **Evidence**: Only `getConfigsRaw` and `validateConfigs` tested. `updateConfigs`/`patchConfigs`/`toggleRule`/`writeTag` (write paths), `getStats`/`getMetricsText`/`getDeadLetters` (monitoring), and list endpoints have no shape/error contract tests. `writeTag` drives PLC writes — wrong body shape could write bad values.
- **Fix suggestion**: Extend `index.test.ts` to cover each endpoint's request shape (method/URL/headers/body) and at least one error status per write endpoint.
- **Behavior impact**: 无

- **Title**: api/hooks — all react-query hooks and cache invalidation untested
- **Location**: `src/api/hooks/index.ts` (entire 215 lines); no test
- **Category**: 测试
- **Severity (suggested)**: P2
- **Evidence**: `useConnectedQuery` gates on `isConnected && enabled` (21); mutations invalidate specific query keys on success (138-185). Invalidation key correctness unverified — wrong key leaves stale UI.
- **Fix suggestion**: Add `api/hooks/index.test.tsx` with QueryClient + mocked endpoints: assert queries skip when disconnected; assert each mutation invalidates expected keys (spy on `invalidateQueries`).
- **Behavior impact**: 无

- **Title**: writeValidation.validateValue untested — tag-write value coercion by data type
- **Location**: `src/lib/writeValidation.ts:37`; no test
- **Category**: 测试
- **Severity (suggested)**: P1
- **Evidence**: `validateValue(raw, dt)` validates a write-command value against a data type (bool/int/float/string). Guards what gets written to physical PLCs. No test covers type mismatches, overflow, or bool coercion.
- **Fix suggestion**: Add `writeValidation.test.ts` covering each DataTypeString: valid/invalid values, boundaries (int max, float precision), bool variants ("true"/1/"1").
- **Behavior impact**: 无

- **Title**: configYaml parse/dump round-trip + CRUD helpers untested
- **Location**: `src/lib/configYaml.ts:24-132`; no test
- **Category**: 测试
- **Severity (suggested)**: P2
- **Evidence**: `parseConfigYaml`/`dumpConfigYaml` and `findDriver`/`upsertDriver`/`removeDriver`/`upsertTransport` used by homepage probe and editors. Non-idempotent round-trip or broken `upsertDriver` would corrupt configs silently.
- **Fix suggestion**: Add `configYaml.test.ts`: round-trip equality on representative configs; upsert adds/updates; remove by name; parse of malformed YAML throws.
- **Behavior impact**: 无

- **Title**: connectionInfo summaries untested — feeds homepage topology rows
- **Location**: `src/lib/connectionInfo.ts:187-260`; no test
- **Category**: 测试
- **Severity (suggested)**: P2
- **Evidence**: `getDriverConnectionSummary`/`getTransportConnectionSummary` derive compact strings from config for topology display; `extractDriverYaml`/`extractTransportYaml` slice YAML. Wrong summaries mislead operators.
- **Fix suggestion**: Add `connectionInfo.test.ts` per driver/transport type: known summary, missing settings → empty, extractYaml round-trip.
- **Behavior impact**: 无

- **Title**: ruleMatchEvaluator — rule simulation logic untested
- **Location**: `src/lib/ruleMatchEvaluator.ts:30-113`; no test
- **Category**: 测试
- **Severity (suggested)**: P2
- **Evidence**: `getFieldValue`/`evaluateClause`/`evaluateMatch` power rule-test/simulation UI. Clause parsing, operator evaluation, `ALL`/compound matches untested.
- **Fix suggestion**: Add `ruleMatchEvaluator.test.ts`: `ALL` matches; `tag == 'x' && value > 95`; field access on missing field; clause with no match.
- **Behavior impact**: 无

- **Title**: Admin page smoke tests assert no behavior (fake-test risk)
- **Location**: `src/features/admin/pages_render_smoke.test.tsx:98-112`
- **Category**: 测试
- **Severity (suggested)**: P2
- **Evidence**: Both tests end with `expect(container?.container).toBeTruthy()` — only confirm `render()` returned a container. No query or content assertion. A refactor that made `RulesPage` render nothing would still pass. Real value is only the #185 infinite-loop guard.
- **Fix suggestion**: Add at least one content assertion per page and a loading→data transition using `findBy*` with mocked endpoints.
- **Behavior impact**: 无

- **Title**: Wizard component tests cover only pure helpers, not component behavior
- **Location**: `ConfigApplyConfirmationDialog.test.ts:2-5`; `EntitySearchBar.test.ts:2`
- **Category**: 测试
- **Severity (suggested)**: P2
- **Evidence**: Both import only exported functions. Dialog open/close, apply-button enablement when `totalChanges===0`, and search bar input→filtered-list rendering never rendered. 403-line `ConfigApplyConfirmationDialog.tsx` component itself untested.
- **Fix suggestion**: Add render tests (jsdom): dialog shows diff summary; apply button disabled when no changes; EntitySearchBar filters DOM list as user types.
- **Behavior impact**: 无

- **Title**: settingsRegistry test is structural only — 79 lines vs 878-line source
- **Location**: `src/lib/settingsRegistry.test.ts` (all 79 lines) vs `src/lib/settingsRegistry.ts` (878)
- **Category**: 测试
- **Severity (suggested)**: P2
- **Evidence**: Tests assert every type has a registry entry and `buildDefaultSettings` returns hardcoded defaults for 3 types. Field `required`/`enum`/`min`/`max`/coercion metadata, `getDriverFieldRegistry`/`getTransportFieldRegistry` for untested types, and `TRANSPORT_TOPLEVEL_FIELDS` beyond 5 named keys not exercised. Invalid inputs to `buildDefaultSettings` (only `undefined` tested at line 76) not covered.
- **Fix suggestion**: Add tests for field metadata (required flags, enum values, numeric bounds) across all driver/transport types and for `buildDefaultSettings` with partial/empty registries.
- **Behavior impact**: 无

## DONE
