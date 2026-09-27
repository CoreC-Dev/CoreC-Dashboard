# CoreC-Dashboard ↔ CoreC API Integration Audit

**Auditor:** CoreC API integration auditor (subagent)
**Date:** 2026-09-27
**Dashboard:** `/workspace/codespace/CoreC-Dashboard/`
**Live backend:** `http://127.0.0.1:9090` (secret `test12345`), `coder/websocket v1.8.15`
**Contract:** `/workspace/codespace/CoreC/docs/api/COREC_API_CONTRACT.md`
**Routes:** `/workspace/codespace/CoreC/hub/route/server.go`

Every finding below was verified against a **live** `curl`/WebSocket probe of the running
CoreC server — nothing is guessed. Live evidence is quoted inline.

---

## 0. Executive Summary

| Area | Verdict |
|---|---|
| 1. Endpoint correctness | ✅ **Clean** — all 19 REST + 4 WS endpoints match `server.go` routes exactly (method + path). |
| 2. Serialization gotchas | ⚠️ Mostly handled; 4 type/comment inaccuracies (all P3). |
| 3. Type definitions | ⚠️ Field names/types match live responses; 3 imprecisions (all P3, no runtime breakage). |
| 4. WebSocket integration | 🔴 **Broken against live server** — cross-origin WS upgrades get HTTP 403 (P1); silent reconnect hides it (P2). |
| 5. Auth flow | ✅ Bearer/`?token=`/401 handling correct; 1 minor error-surfacing gap (P3). |

**Headline issue:** every realtime page (live logs, traffic, memory, tag stream) silently
fails against the live CoreC server because `coder/websocket` rejects cross-origin upgrades
and the dashboard neither routes around it nor surfaces the failure.

Findings ranked P0→P3 in §7.

---

## 1. Endpoint Correctness — ✅ NO ISSUES

`src/api/endpoints/index.ts` was compared line-by-line against `server.go:286-365`
(`router()`):

| Dashboard call | Server route | Match |
|---|---|---|
| `GET /` | `r.Get("/", hello)` (server.go:305) | ✅ |
| `GET /version` | `r.Get("/version", getVersion)` (:306) | ✅ |
| `GET /healthz/live` | `r.Get("/healthz/live", healthzLive)` (:312) | ✅ |
| `GET /healthz/ready` | `r.Get("/healthz/ready", healthzReady)` (:313) | ✅ |
| `GET /configs` | `r.Get("/configs", getConfigs)` (:320) | ✅ |
| `PUT /configs` | `r.Put("/configs", updateConfigs)` (:321) | ✅ |
| `PATCH /configs` | `r.Patch("/configs", patchConfigs)` (:322) | ✅ |
| `GET /drivers` | `r.Get("/drivers", getDrivers)` (:324) | ✅ |
| `GET /drivers/{name}` | `r.Get("/drivers/{name}", getDriver)` (:325) | ✅ |
| `GET /drivers/{name}/tags` | `r.Get("/drivers/{name}/tags", getDriverTags)` (:326) | ✅ |
| `GET /transports` | `r.Get("/transports", getTransports)` (:328) | ✅ |
| `GET /transports/{name}` | `r.Get("/transports/{name}", getTransport)` (:329) | ✅ |
| `GET /tags` | `r.Get("/tags", getAllTags)` (:331) | ✅ |
| `POST /write` | `r.Post("/write", writeTag)` (:332) | ✅ |
| `GET /write/failed` | `r.Get("/write/failed", getFailedWrites)` (:333) | ✅ |
| `GET /rules` | `r.Get("/rules", getRules)` (:335) | ✅ |
| `PATCH /rules/disable` | `r.Patch("/rules/disable", disableRule)` (:336) | ✅ |
| `GET /stats` | `r.Get("/stats", getStats)` (:338) | ✅ |
| `GET /metrics` | `r.Get("/metrics", promMetrics)` (:349) | ✅ |
| WS `/logs` | `r.Get("/logs", getLogs)` (:341) | ✅ |
| WS `/traffic` | `r.Get("/traffic", getTraffic)` (:342) | ✅ |
| WS `/memory` | `r.Get("/memory", getMemory)` (:339) | ✅ |
| WS `/tags/stream` | `r.Get("/tags/stream", streamTags)` (:343) | ✅ |

- No missing endpoints, no extra endpoints, no wrong HTTP methods.
- Path params use `encodeURIComponent(name)` (`endpoints/index.ts:40,42,47`); chi decodes
  `{name}` — correct for special chars.
- `204` mutations (`PUT/PATCH /configs`, `PATCH /rules/disable`): `client.ts:78-80` returns
  `undefined` on 204 — verified live (`PATCH /configs {"log-level":"debug"}` → `204`).

---

## 2. Serialization Gotchas

### G1 — `DriverTagsResponse.tags` type forbids the `null` the API actually returns — P3
- **File:** `src/types/api.ts:48-50`
- **Live evidence:**
  ```
  $ curl -s .../drivers/plc-modbus/tags
  {"tags":null}            [status=200]
  $ curl -s .../drivers/nonexistent/tags
  {"tags":null}            [status=200]
  ```
  `null` occurs not only for unknown drivers but for **any** known driver with no cached
  values (here `plc-modbus` exists but is in `connecting` state, never read).
- **Impact:** The type `tags: Record<string, DataPoint>` lies — at runtime it is
  `Record<string, DataPoint> | null`. No crash today because `DriverDetailPage.tsx:112`
  guards with a truthiness check (`tagsData?.tags ? Object.values(tagsData.tags) : []`),
  but the type gives no compile-time protection and any future consumer doing
  `Object.keys(res.tags)` would throw.
- **Fix:** `tags: Record<string, DataPoint> | null`.

### G2 — `RuleStat.targets` type forbids the `null` the contract/API specify — P3
- **File:** `src/types/models.ts:55`
- **Contract §3.16:** `Targets` has **no `omitempty`** → serializes as JSON `null` (not `[]`)
  when a rule has no targets and no single `target`.
- **Impact:** Type is `string[]`; reality is `string[] | null`. Runtime is safe:
  `RulesPage.tsx:28-33` `getTargetDisplay` guards with `rule.targets && rule.targets.length`.
  (The live config happens to set a single `target` on every rule, so `targets` is `["..."]`
  here — but a `drop`/mirror-only rule would emit `null`.)
- **Fix:** `targets: string[] | null`.

### G3 — "Never-hit" rule timestamps are Unix epoch, not Go zero time — P3
- **File:** `src/lib/utils.ts:43-44` (`isZeroTime`); consumed at `RulesPage.tsx:367`, `DriverDetailPage.tsx:13`, `TransportDetailPage.tsx:23`, `DriversPage.tsx:109`, `TransportsPage.tsx:108`.
- **Live evidence:**
  ```
  $ curl -s .../rules
  "hit_at": "1970-01-01T08:00:00+08:00",   # Unix epoch in +08:00, NOT 0001-01-01
  "miss_at": "1970-01-01T08:00:00+08:00"
  ```
  vs. drivers:
  ```
  "last_read": "0001-01-01T00:00:00Z"      # true Go zero time
  ```
- **Root cause:** `rule/wrapper.go:80` returns `time.Unix(0, t.i.Load())` with initial `0` →
  `time.Unix(0,0)` = epoch, **not** `time.Time{}`. (This also contradicts contract §3.16,
  which claims hit_at uses Go zero time.)
- **Impact:** `isZeroTime` checks `0001-01-01` only, so for never-hit rules it returns
  `false` → `RulesPage.tsx:367` renders `new Date("1970-01-01T08:00:00+08:00").toLocaleTimeString()`
  = **"8:00:00 AM"** instead of "Never". Cosmetic but misleading.
- **Fix:** Extend `isZeroTime` to treat epoch as absent, e.g.
  `!ts || ts.startsWith('0001-01-01') || ts.startsWith('1970-01-01') || new Date(ts).getTime() <= 0`.
  Driver/transport `last_read`/`last_publish` (true `0001-01-01`) are unaffected.

### G4 — `LogEvent.level` comment is wrong (says `-4=debug`, should be `-8`) — P3
- **File:** `src/types/models.ts:87`; threshold at `DiagnosticsPage.tsx:119`.
- **Contract §4.1 / Go `slog`**: `slog.Level` is `int8`: `-8=debug, 0=info, 4=warn, 8=error`.
- **Impact:** Comment misleads. `DiagnosticsPage.tsx:119` uses `evt.level <= -4` which still
  catches `-8` (the only debug level) so it is **functionally correct** for standard levels,
  but the threshold is imprecise. `AlertsPage.tsx:35,211,220` use `>= 4` / `>= 8` — correct.
- **Fix:** Comment → `-8=debug`; threshold → `< 0` (info is 0) or `=== -8`.

### Gotchas handled CORRECTLY (verified live)
- **`state`/`quality`/`level` as raw integers** ✅ — `constants.ts` `ConnState`/`Quality` are
  integers; pages index `ConnStateLabel[driver.state]`, `QualityLabel[t.quality]` by int.
  Live: `state:1`, `quality:0`.
- **`type`/`status` as strings** ✅ — `DataPoint.type: DataTypeString`, `EngineStats.status:string`.
  Live: `type:"float32"`, `status:"running"`.
- **`/stats.uptime` = nanoseconds** ✅ — `formatUptime` (`utils.ts:8-11`) does
  `Math.floor(uptime / 1e9)`. Live: `uptime:1104768708766` → renders `18m24s`.
- **`GET /.uptime` = duration string** ✅ — `formatUptime` returns the string unchanged
  (line 9). (`serverInfo.uptime` is not actually displayed — TopologyPage uses name/version
  only — but the helper is correct.)
- **Go zero-time truthy for `last_read`/`last_publish`** ✅ — `isZeroTime` checks
  `0001-01-01`; all driver/transport pages use it. Live: `"0001-01-01T00:00:00Z"`.
- **`POST /write` `type` accepts string OR legacy int** ✅ —
  `WriteCommand.type: DataTypeString | number` (`models.ts:21`); `DataTypeMap`
  (`constants.ts:1-15`) maps int→string.
- **`/tags` always `{}` (never `null`)** ✅ — Live: `{"tags":{}}`; type `Record<string,DataPoint>` correct.
- **`/metrics` content-type `text/plain`** ✅ — `client.ts:82-87` returns text for non-JSON;
  `parsePrometheusMetrics` parses all 93 live lines, 0 unparsed.

---

## 3. Type Definitions (field-by-field vs live responses)

All field names and JSON tags in `DataPoint`, `DriverStatus`, `TransportStatus`, `RuleStat`,
`DeadLetterEntry`, `WriteCommand`, `EngineStats`, `ServerInfoResponse`, `VersionResponse`,
`HealthCheckResponse`, `ConfigSummaryResponse` match the live responses exactly (verified
against `/configs`, `/drivers`, `/transports`, `/tags`, `/rules`, `/stats`, `/write/failed`,
`/version`, `/`).

### T1 — `EngineStats.driver_stats`/`transport_stats` lose their element type — P3
- **File:** `src/types/models.ts:82-83`
- **Live evidence:** `/stats` `driver_stats` is `map[string]DriverStatus`,
  `transport_stats` is `map[string]TransportStatus` (confirmed: nested objects carry the
  full DriverStatus/TransportStatus field set). Dashboard types them
  `Record<string, any>` and marks them optional (`?`).
- **Impact:** No runtime breakage — **no page currently reads `stats.driver_stats`/
  `transport_stats`** (grep confirms only the type definition references them). Optional `?`
  is also imprecise: live API always returns both (non-pointer map fields). Pure type-safety gap.
- **Fix:** `driver_stats: Record<string, DriverStatus>`; `transport_stats: Record<string, TransportStatus>`; drop `?`.

### T2 — `ConfigSummaryResponse.rules[].type` quirk — ✅ handled correctly
- Contract §3.5 quirk: `entrySummary.Type` is reused for the rule **match expression**
  (not an action). `ConfigCenterPage.tsx:392` labels this column `typeLabel="match"` — correct.

(See G1/G2/G4 in §2 for the other type inaccuracies: `tags|null`, `targets|null`, `level` comment.)

---

## 4. WebSocket Integration

### W1 — Cross-origin WS upgrades are rejected with HTTP 403 by the live server — P1
- **Files:** `src/api/websocket.ts` (client); root cause `hub/route/{logs,traffic,memory,stream}.go` (`websocket.Accept(w, r, nil)`); config gap `server.go:286-365` (`AllowedOrigins` feeds only `corsMiddleware`, not `AcceptOptions`).
- **Live evidence (raw RFC6455 handshake probes):**
  ```
  Origin: http://127.0.0.1:3080  → 403 "request Origin \"127.0.0.1:3080\" is not authorized for Host \"127.0.0.1:9090\""
  Origin: http://127.0.0.1:9090  → 101 upgrade OK, first frame {"dropped":0,"publish":0,"read":0}
  (no Origin header)            → 101 upgrade OK
  Origin: http://localhost:9090 → 403 (host mismatch localhost vs 127.0.0.1)
  ```
- **Root cause:** All four WS handlers call `websocket.Accept(w, r, nil)` with **nil
  options** (`logs.go:13`, `traffic.go:15`, `memory.go:15`, `stream.go:14`). With nil
  `OriginPatterns`, `coder/websocket` v1.8.15 applies its **strict default Origin check**:
  the request `Origin` host must equal the request `Host`. The chi `corsMiddleware`
  (server.go:372-399) sets `Access-Control-Allow-Origin: *` when `allowed-origins` is empty,
  but that header does **not** satisfy `coder/websocket`'s independent Origin check — the
  CORS `*` and `allowed-origins` config never reach `AcceptOptions.OriginPatterns`.
- **Dashboard impact:** `DEFAULT_COREC_URL = 'http://127.0.0.1:9090'` (`constants.ts:99`)
  and the GUI serves the SPA from a different origin (`:3080`), so the browser always emits
  a cross-origin `Origin` on the WS upgrade → **403 on every realtime socket**. Affected
  pages: `AlertsPage` (`/logs`), `DiagnosticsPage` (`/logs`), `TrafficChart` (`/traffic`),
  `MemoryChart` (`/memory`), `TagExplorerPage` (`/tags/stream`). The browser cannot omit or
  spoof the `Origin` header, so this cannot be fixed purely client-side.
- **Fix (dashboard-side, partial):** route WS through a same-origin reverse proxy that
  rewrites/strips the `Origin` header before forwarding to CoreC (vite's `/corec-api` proxy
  with `changeOrigin:true` is **insufficient** — it rewrites `Host` but leaves `Origin`
  unchanged, so the mismatch persists). Plus surface the failure (see W2).
- **Fix (root cause, server-side — recommended):** pass the configured origins into the WS
  accept options in all four handlers, e.g.
  `websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: allowedOrigins})`
  (or `InsecureSkipVerify: true` for dev). This is the only complete fix.

### W2 — `CoreCWebSocket` silently reconnects forever on persistent upgrade failure — P2
- **File:** `src/api/websocket.ts:91-101, 104-115`
- **Impact:** On a 403/401/404 upgrade, the browser fires `onclose` without `onopen`. The
  class sets status `'closed'`/`'error'` and immediately `scheduleReconnect()` with backoff
  — forever, with no upper bound and **no callback telling the page why the socket never
  opens**. Combined with W1, every realtime page silently shows an empty/"connecting" state
  indefinitely instead of a diagnosable error.
- **Fix:** Add an `onError(reason)`/`onReconnectFailed` callback; cap consecutive failures
  (e.g. stop after N and emit a terminal error); detect upgrade-rejection signatures (rapid
  `onclose` with no `onopen`) and surface "WebSocket upgrade rejected (likely CORS/Origin)"
  so the user is directed to the server config.

### WS items handled CORRECTLY (verified live)
- **Token auth via `?token=`** ✅ — `websocket.ts:52` `url.searchParams.set('token', secret)`.
  Live: WS without token → `401 {"error":"unauthorized"}`; with token (matching/empty Origin)
  → upgrade + frames.
- **Message format** ✅ — `JSON.parse(event.data)` (`websocket.ts:82`). CoreC uses
  `wsjson.Write` (JSON text frames with a trailing `\n`); `JSON.parse` tolerates trailing
  whitespace. Live `/traffic` frame `{"dropped":0,"publish":0,"read":0}\n` parses fine.
- **http→ws scheme rewrite** ✅ — `websocket.ts:48`.
- **Reconnection/backoff** ✅ — exponential `1.5**retry` ±20% jitter, max 30s, backpressure
  drop-oldest (256 pending). (No max-retry cap — see W2.)

---

## 5. Auth Flow

### A1 — Bearer auth is correct; HMAC/SHA256 is server-side only — ✅
- **File:** `src/api/client.ts:38-40`
- The contract's "HMAC/SHA256 constant-time" comparison (`server.go:517-540`: SHA-256 both
  sides then `hmac.Equal`) is a **server-side** anti-timing-leak measure. The client
  correctly just sends the raw secret as `Authorization: Bearer <secret>`; there is nothing
  for the client to replicate. Live: `401` without token, `200` with.

### A2 — 401 handling — ✅
- **File:** `src/api/client.ts:67-69`
- On `401`, calls `setError('Authentication failed — please reconnect')` which flips
  `isConnected=false` → RequireConnection redirects to `/login`. Live: `GET /stats` with no
  auth → `401 {"error":"unauthorized"}`.

### A3 — WS uses `?token=` (the browser-cannot-set-headers workaround) — ✅
- Matches `server.go:521-522` (falls back to `token` query param when no `Authorization`).

### A4 — Write/mutation errors surface only the generic status, not CoreC's body — P3
- **File:** `src/features/admin/WriteControlPage.tsx:172-173` (and `:183-184`)
- `apiRequest` throws `ApiError(status, message, body)` where `body` holds CoreC's
  `{"error":"..."}`. `WriteControlPage` shows `err.message` =
  `"API request failed: 500 Internal Server Error"`, discarding `err.body`.
- **Live evidence:** `POST /write` to a disconnected driver → `500 {"error":"internal server error"}`
  (masked, so little lost); but `PATCH /configs {"foo":"bar"}` →
  `400 {"error":"unsupported patch key(s): [foo] (supported: log-level)"}` — the informative
  body is discarded. Same pattern in `AlertsPage.tsx:51` (dead-letter retry).
- **Fix:** when `err instanceof ApiError && err.body`, parse/show `err.body` (e.g.
  `JSON.parse(err.body).error`).

---

## 6. Additional Findings

### X1 — `useHealthReady` throws on the legitimate 503 "not ready" response — P3 (latent)
- **Files:** `src/api/endpoints/index.ts:22`, `src/api/hooks/index.ts:16-24`, `src/api/client.ts:64`
- **Live evidence:** `GET /healthz/ready` returns **503** (not 200) with a usable body:
  `{"status":"not_ready","reason":"no drivers connected","components":{...}}`.
- `apiRequest` throws `ApiError(503)` for any non-2xx, so `getHealthReady()` throws instead
  of returning the parsed `HealthCheckResponse` — the `reason`/`components` are unreachable.
- **Impact:** Latent — `useHealthReady` currently has **no consumers** (grep confirms), so no
  UI breaks. If wired up, a not-ready engine yields an error state, not the not-ready detail.
- **Fix:** special-case 503 in `getHealthReady` to return the parsed body, or give
  `apiRequest` an `okStatuses: number[]` option.

### X2 — `GET /configs` fallback (`200 {"error":"..."}`) silently renders empty — P3 (latent)
- **Contract §3.5:** when no active config, `GET /configs` returns `200 {"error":"no active configuration"}`.
- `getConfigs` parses it as `ConfigSummaryResponse`; the `error` key is not in the type, so
  all fields are `undefined` → `ConfigCenterPage` shows an empty config with no error surfaced.
- Not hit live (server returns a full overview) but latent. **Fix:** detect an `error` key and
  surface it.

### X3 — Prometheus parser is correct; minor label-escape edge — ✅
- `parsePrometheusMetrics` (`prometheus.ts`) parses all 93 live `/metrics` lines, 0 unparsed,
  labels (`driver="plc-modbus",type="modbus-tcp"`) parsed correctly. Edge: label-value regex
  `[^"']*` doesn't handle Prometheus-escaped quotes (`\"`) — none present in live output.

### X4 — pprof fetch uses Bearer auth correctly — ✅
- `DiagnosticsPage.tsx:186-188` sends `Authorization: Bearer ${secret}` for `/debug/pprof/*`
  (which live inside the authed group, server.go:355-361). Comment correctly notes direct
  `<a href>` would 401.

---

## 7. Findings Index (severity order)

| ID | Sev | Area | File:line | One-line |
|---|---|---|---|---|
| **W1** | **P1** | WS | `hub/route/{logs,traffic,memory,stream}.go` (`Accept(w,r,nil)`) + `websocket.ts` | Cross-origin WS upgrades → HTTP 403; all 5 realtime pages dead against live server. Root cause server-side (no `OriginPatterns`); dashboard can't omit browser `Origin`. |
| **W2** | **P2** | WS | `src/api/websocket.ts:91-115` | Silent infinite reconnect on persistent upgrade failure; no error surfaced to pages. |
| G1 | P3 | Types | `src/types/api.ts:48-50` | `DriverTagsResponse.tags` missing `\| null` (live returns `{"tags":null}`). Runtime-guarded. |
| G2 | P3 | Types | `src/types/models.ts:55` | `RuleStat.targets` missing `\| null` (contract: `null` not `[]`). Runtime-guarded. |
| G3 | P3 | Gotcha | `src/lib/utils.ts:43-44` (+ `RulesPage.tsx:367`) | `isZeroTime` misses Unix-epoch `hit_at`/`miss_at` (`1970-01-01…`); shows "8:00:00 AM" not "Never". |
| G4 | P3 | Types | `src/types/models.ts:87` (+ `DiagnosticsPage.tsx:119`) | `LogEvent.level` comment `-4=debug` wrong (slog debug = `-8`); threshold imprecise but functional. |
| T1 | P3 | Types | `src/types/models.ts:82-83` | `driver_stats`/`transport_stats` typed `Record<string,any>` + optional `?`; should be typed maps, always present. Unused by pages. |
| A4 | P3 | Auth | `src/features/admin/WriteControlPage.tsx:172-173` | Shows generic `err.message`, discards `ApiError.body` (CoreC's `{"error":...}`), esp. for 400s. |
| X1 | P3 | Misc | `src/api/endpoints/index.ts:22` (+ `client.ts:64`) | `getHealthReady` throws on legitimate 503 "not ready"; `reason`/`components` unreachable. Latent (hook unused). |
| X2 | P3 | Misc | `src/api/endpoints/index.ts:25` (+ `ConfigCenterPage`) | `/configs` fallback `200 {"error":...}` silently renders empty config. Latent. |

**No P0 findings.** REST integration is correct and complete; the only functionality
actually broken against the live server is the WebSocket layer (W1/W2).

---

## 8. Recommended Fix Order
1. **W1 (server):** pass `allowed-origins` into `websocket.AcceptOptions.OriginPatterns` in
   the four WS handlers — unblocks all realtime features. *(Server-side change; the dashboard
   itself cannot fix the browser `Origin`.)*
2. **W2 (dashboard):** surface persistent WS upgrade failures and cap reconnects.
3. **G3:** extend `isZeroTime` to treat epoch as "never" (one-line).
4. **G1/G2/T1/G4:** type-comment fixes (`| null`, typed stats maps, level comment).
5. **A4/X1/X2:** surface CoreC error bodies; tolerate 503 on readiness; detect `/configs` fallback.
