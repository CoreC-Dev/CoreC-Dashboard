# Architecture & Dependency Audit (subagent: 66444a13)

## Summary
Disciplined feature-sliced layout with **no cross-feature direct coupling** and clean lower layers (no store→component, no lib→component/store/api, no component→feature violations). Dominant risk: **layer inversions at foundational seams** — `types` reaches up into `lib`, and `api` ↔ `contexts` are mutually dependent (layer-level cycle). Two "God Object" modules — `stores/configStore` (29 methods, 14 importers) and `lib/utils` (34 importers, coupling 16 UI primitives to i18n runtime). Import-path style (`@/` vs relative) inconsistent.

## Dependency Direction (intended vs actual)
Intended: `types ← lib ← api ← stores ← hooks/contexts ← components ← features ← App`
- ✅ `lib → types`, `stores → lib/types`, `hooks → lib/stores/types`, `contexts → api/stores`, `components → ui/lib/api/types`, `features → api/hooks/components/lib/stores/types` — all correct.
- ⚠️ `types → lib`: VIOLATION (`types/models.ts` → `@/lib/constants`).
- ⚠️ `api ↔ contexts`: BIDIRECTIONAL layer cycle.
- ⚠️ `lib → i18n`: `lib/utils` and `lib/writeValidation` import `@/i18n`.
- ⚠️ `components/ui → hooks`: `count-up-number.tsx` imports `@/hooks/useCountUp`.

## Findings

- **Title**: `types` layer imports from `lib` — foundational layer inversion
- **Location**: `src/types/models.ts:1`
- **Category**: 架构
- **Severity (suggested)**: P1
- **Evidence**: `import type { DataTypeString } from '@/lib/constants'`. Chain: `types/models.ts` → `lib/constants.ts:1` (`import type { DataType } from '@/types/config'`) → `types/config.ts`. `DataTypeString` defined in `lib/constants` as `= DataType`, re-imported by `types/models` — types↔lib conceptual round-trip.
- **Fix suggestion**: Move `DataTypeString` (and `DataType` if needed) into `types/config.ts` or `types/models.ts`; have `lib/constants.ts` import from `types` (correct direction).
- **Behavior impact**: 无 (type-only, erased at runtime)

- **Title**: `api` and `contexts` layers are mutually dependent (layer-level cycle)
- **Location**: `src/api/hooks/index.ts:2` ↔ `src/contexts/ConnectionContext.tsx:4-5`
- **Category**: 架构
- **Severity (suggested)**: P1
- **Evidence**: `api/hooks/index.ts:2`: `import { useConnection } from '@/contexts/ConnectionContext'` (api→contexts). `contexts/ConnectionContext.tsx:4`: `import { setActiveConnection } from '@/api/activeConnection'` and `:5`: `import { getServerInfo } from '@/api/endpoints'` (contexts→api). No runtime module cycle, but architectural dependency bidirectional.
- **Fix suggestion**: Extract connection state `api/hooks` needs (`isConnected`) into lower layer (e.g. `stores/connectionStore` or context-free hook) so `api/hooks` depends downward. Or have callers pass connection status explicitly.
- **Behavior impact**: 无

- **Title**: God Object — `configStore` accumulates 29 responsibilities across 14 consumers
- **Location**: `src/stores/configStore.ts:84-148` (interface), `:175` (create)
- **Category**: 架构
- **Severity (suggested)**: P1
- **Evidence**: 425 lines; `ConfigStoreState` declares 29 methods across 6 concern groups: loading, entity CRUD for 5 entity types (10 methods), section updates, save/revert, 6 derived getters, 5 uniqueness checks. Imported by 14 files.
- **Fix suggestion**: Split by concern: `configCrudSlice` (entity upsert/remove), `configSectionSlice` (global/node field updates), keep `configStore` as working/saved/dirty state shell. Consumers select narrow slices — low-risk split.
- **Behavior impact**: 无

- **Title**: God Object / over-coupling — `lib/utils.ts` (34 importers) couples 16 UI primitives to i18n
- **Location**: `src/lib/utils.ts:3` (i18n import), `:5` (cn), `:80` (formatRelativeTime uses i18n)
- **Category**: 架构
- **Severity (suggested)**: P1
- **Evidence**: `import i18n from '@/i18n'` at module top level. `cn` (pure className merge) imported by 16 of 17 `components/ui/*` primitives. Module-level i18n import means every primitive transitively pulls i18next singleton. Only `formatRelativeTime` (`:80-89`) uses `i18n.t(...)`. 34 importers total.
- **Fix suggestion**: Extract `cn` into dedicated `lib/cn.ts` with zero src imports; leave i18n-dependent formatters in `lib/utils.ts` or `lib/formatters.ts`. Decouples 16 presentational primitives from i18n runtime.
- **Behavior impact**: 无

- **Title**: UI primitive reaches up into `hooks` layer
- **Location**: `src/components/ui/count-up-number.tsx:1`
- **Category**: 架构
- **Severity (suggested)**: P2
- **Evidence**: `import { useCountUp } from '@/hooks/useCountUp'` — `components/ui` primitive depends on `hooks` layer. No other ui primitive does this.
- **Fix suggestion**: Inline count-up animation into component, or move `count-up-number.tsx` out of `components/ui` into `components/`.
- **Behavior impact**: 无

- **Title**: Domain type `CoreCInstance` is defined in a store, not in `types/`
- **Location**: `src/stores/instanceStore.ts:8`; importers: `contexts/ConnectionContext.tsx:7`, `features/home/InstanceCard.tsx:35`, `InstanceDialog.tsx:27`, `InstancePanel.tsx:23`, `useHomepageProbe.ts:3`
- **Category**: 架构
- **Severity (suggested)**: P2
- **Evidence**: `export interface CoreCInstance` lives in store module. 5 files import type via `@/stores/instanceStore`, coupling type consumers to store module (+ its `lib/storage` dependency) for a pure type.
- **Fix suggestion**: Move `CoreCInstance` to `types/models.ts` (or `types/instance.ts`); have `instanceStore.ts` import from `types`, optionally re-export.
- **Behavior impact**: 无 (type-only for consumers)

- **Title**: No hook/context abstraction for WebSocket — 5 consumers use raw `api/websocket` directly
- **Location**: `src/api/websocket.ts`; consumers: `components/admin/EventLogTerminal.tsx:8`, `components/charts/MemoryChart.tsx:12`, `components/charts/TrafficChart.tsx:12`, `features/monitor/AlertsPage.tsx:20`, `features/monitor/TagExplorerPage.tsx:25`
- **Category**: 架构
- **Severity (suggested)**: P2
- **Evidence**: All 5 import `CoreCWebSocket` directly; manage connection lifecycle inline. REST uses `api/hooks` uniformly (12 consumers); WS has no equivalent wrapper. Duplicates lifecycle boilerplate.
- **Fix suggestion**: Introduce `useCoreCWebSocket` hook (in `api/hooks` or `hooks/`) encapsulating connect/onMessage/close-on-unmount.
- **Behavior impact**: 无

- **Title**: Feature imports raw `api/client` (ApiError), bypassing the hooks layer
- **Location**: `src/features/admin/WriteControlPage.tsx:17` (also `features/admin/DiagnosticsPage.tsx:5` imports `getActiveConnection` from `@/api/activeConnection`)
- **Category**: 架构
- **Severity (suggested)**: P2
- **Evidence**: `import { ApiError } from '@/api/client'` — feature reaches past `api/hooks` into raw HTTP client.
- **Fix suggestion**: Re-export `ApiError` from `api/hooks` (or `api/endpoints`); keep `api/client` internal transport detail.
- **Behavior impact**: 无

- **Title**: `lib` depends on `i18n` runtime singleton
- **Location**: `src/lib/utils.ts:3`, `src/lib/writeValidation.ts:1`
- **Category**: 架构
- **Severity (suggested)**: P2
- **Evidence**: `import i18n from '@/i18n'` in both. Makes `lib` functions non-pure (depend on i18n singleton state/locale), complicates unit testing.
- **Fix suggestion**: Accept i18n as explicit dependency (pass `t` into formatters) or isolate i18n-dependent helpers into `lib/i18nFormatters.ts`. Document `i18n` as peer layer to `lib`.
- **Behavior impact**: 无

- **Title**: `@/` alias and relative imports mixed within the same files
- **Location**: `src/api/endpoints/index.ts:14` (`from '../client'` + `from '@/types/api'` :12), `src/api/hooks/index.ts:4` (`from '../endpoints'` + `from '@/contexts/ConnectionContext'` :2), `src/features/home/InstancePanel.tsx:26-28`
- **Category**: 架构
- **Severity (suggested)**: P2
- **Evidence**: 3 files mix alias and relative. `features/admin` uses alias for siblings (7 lines); `features/home` uses relative (3 lines). No Biome rule enforces one style.
- **Fix suggestion**: Add Biome lint rule enforcing `@/` alias for all cross-file imports (or relative for intra-directory), apply repo-wide.
- **Behavior impact**: 无

- **Title**: No cross-feature direct coupling (healthy — no action needed)
- **Location**: `src/features/admin/*` (7 intra-feature imports), `features/monitor/*`, `features/home/*`, `features/settings/*`
- **Category**: 架构
- **Severity (suggested)**: P2
- **Evidence**: `grep "from '@/features/" src/features` returns only 7 lines, all `@/features/admin/...` by other `features/admin/*`. No cross-feature edge. Features share state/data only through `api/hooks`, `stores`, `components`, `lib`.
- **Fix suggestion**: Preserve boundary; add `no-restricted-imports` rule forbidding `@/features/<other-feature>` to prevent regression.
- **Behavior impact**: 无

- **Title**: Lower layers are clean — no store/lib/types→upward violations (healthy)
- **Location**: `src/stores/*`, `src/lib/*`, `src/types/*`
- **Category**: 架构
- **Severity (suggested)**: P2
- **Evidence**: stores importing `@/components|@/features` → 0. lib importing `@/components|@/features|@/stores|@/api|@/hooks|@/contexts` → 0. types importing non-types → 1 (the `types/models→lib/constants` finding). components importing `@/features` → 0.
- **Fix suggestion**: No action; maintain via lint guardrails.
- **Behavior impact**: 无

## DONE
