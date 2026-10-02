# Security Audit (subagent: 540693ad)

## Summary
Audited CoreC-Dashboard (React 19 + Vite 8 + TS SPA + custom Node production server `server.mjs`). 133 source files reviewed. No files modified.

**Confirmed-safe areas:**
- Path traversal guard `safeStaticPath` (server.mjs:53-63) is solid: `decodeURIComponent` in try/catch, null-byte stripping, path-separator boundary check.
- No SSRF in server.mjs: CoreC target fixed at startup (`process.argv[4] || 'http://127.0.0.1:9090'`, :19); proxy only forwards attacker-controlled paths to fixed host.
- No XSS sinks: no `dangerouslySetInnerHTML`, no `innerHTML`, no live `eval`/`new Function`.
- Secrets stored in sessionStorage, not localStorage (instanceStore.ts:115-168).
- Server-side secret redaction: `GET /configs/raw` returns secrets masked as `"***"` (endpoints/index.ts:32-47, configSchema.ts SECRET_SENTINEL :316).

**12 findings (8 confirmed, 4 needs-verification).**

## Findings

- **Title**: CSP `connect-src *` allows connections to any origin, defeating exfiltration防护
- **Location**: `index.html:7-10`
- **Category**: 安全
- **Severity (suggested)**: P1
- **Evidence**: `connect-src * ws: wss:` in CSP meta tag.
- **Fix suggestion**: Replace with explicit allow-list of known CoreC backend hosts (or `'self' ws: wss:` in server.mjs same-origin proxy deployment). Tighten `style-src 'unsafe-inline'` (Monaco injects inline styles — may need nonce).
- **Behavior impact**: 变更行为

- **Title**: API Bearer secret sent to arbitrary user-chosen backend (browser-side SSRF / credential redirection)
- **Location**: `src/api/client.ts:50-56`, `src/features/home/InstanceDialog.tsx:32-35`
- **Category**: 安全
- **Severity (suggested)**: P1
- **Evidence**: `client.ts` — baseUrl is user-entered, no allow-list; `headers.set('Authorization', \`Bearer ${conn.secret}\`)`. `InstanceDialog.tsx` — only validates `^https?://`, any host allowed. `useHomepageProbe.ts:80` also sends `Bearer ${instance.secret}` directly to `instance.baseUrl`.
- **Fix suggestion**: Add allow-list of permitted backend hosts (or require same-origin `/corec-api` in server.mjs deployment). Combined with CSP `connect-src *`, any script that can influence `baseUrl` can exfiltrate credentials.
- **Behavior impact**: 变更行为

- **Title**: Instance export writes API secrets to a plaintext JSON file (credential leak)
- **Location**: `src/stores/instanceStore.ts:247-249`, consumed at `src/features/settings/GlobalSettingsPage.tsx:41` and `src/features/home/InstancePanel.tsx:75`
- **Category**: 安全
- **Severity (suggested)**: P1
- **Evidence**: `exportInstances: () => JSON.stringify(get().instances, null, 2)` — includes `secret` field, NOT stripped. Downloaded `corec-instances-YYYY-MM-DD.json` contains every instance's `secret` in cleartext.
- **Fix suggestion**: Apply `stripSecret` (or omit `secret`) in `exportInstances`, or warn operator before exporting and offer "secrets excluded" option.
- **Behavior impact**: 变更行为

- **Title**: Supply-chain risk — `js-yaml` resolved from third-party mirror with unusual version 5.4.2
- **Location**: `package.json:37` (`"js-yaml": "^5.4.2"`), `package-lock.json` resolves `js-yaml@5.4.2` from `https://registry.npmmirror.com/...`; `@types/js-yaml` is `4.0.9` (mismatch)
- **Category**: 安全
- **Severity (suggested)**: P1 (needs verification)
- **Evidence**: Well-known official `js-yaml` stable line is 4.x; verify 5.4.2 is legitimate, not a mirror fork/typosquat. `@types/js-yaml@4.0.9` vs runtime `5.4.2` mismatch means types unreliable.
- **Fix suggestion**: Re-resolve from official `registry.npmjs.org`, confirm integrity hash. Run `npm audit` in Phase 3.
- **Behavior impact**: 无 (verification only)

- **Title**: WebSocket auth token transmitted in URL query string (logging leak)
- **Location**: `src/api/websocket.ts:68-73`
- **Category**: 安全
- **Severity (suggested)**: P2
- **Evidence**: `url.searchParams.set('token', secret)` — secret in WS URL; appears in proxy/server access logs and potentially browser history.
- **Fix suggestion**: Prefer short-lived ticket exchanged via authenticated REST call, or use `Sec-WebSocket-Protocol` subprotocol header. At minimum ensure CoreC does not log query strings.
- **Behavior impact**: 变更行为

- **Title**: Weak default secret `"change-me-please"` in config templates
- **Location**: `src/lib/configTemplates.ts:44,104,160,226,284,356`, `:133` (`Authorization: "Bearer your-token-here"`)
- **Category**: 安全
- **Severity (suggested)**: P2
- **Evidence**: Templates ship `secret: "change-me-please"`; schema requires min 8 chars which this satisfies, so validation won't catch it.
- **Fix suggestion**: Generate random secret at template-load time, or block apply until operator replaces placeholder.
- **Behavior impact**: 变更行为

- **Title**: server.mjs sets no security response headers (nosniff, Referrer-Policy, HSTS, Permissions-Policy)
- **Location**: `server.mjs:223-258` (`serveStatic`), `server.mjs:79-114` (`proxyToCoreC`)
- **Category**: 安全
- **Severity (suggested)**: P2
- **Evidence**: No `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Strict-Transport-Security`, or `Permissions-Policy`. CSP via index.html meta covers document, but static assets get no `nosniff`.
- **Fix suggestion**: Add `res.setHeader` calls in `serveStatic` and `proxyToCoreC`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(), microphone=(), camera=()`. HSTS when TLS.
- **Behavior impact**: 无

- **Title**: Bleeding-edge dependency majors (React 19.3, Vite 8, TS 7.0, Biome 2.5, Zod 4, i18next 26, @types/node 26)
- **Location**: `package.json:15-64`
- **Category**: 安全
- **Severity (suggested)**: P2
- **Evidence**: Very recent major versions with shorter battle-testing windows; transitive CVEs more likely.
- **Fix suggestion**: Run `npm audit` (and `pnpm audit`) in Phase 3 against live registry; pin exact versions in CI; review Vite 8 rolldown toolchain transitive deps.
- **Behavior impact**: 无

- **Title**: js-yaml `load()` called without explicit safe schema (prototype pollution risk)
- **Location**: `src/lib/configYaml.ts:24-32`, fed by server config (`useHomepageProbe.ts:160`, `ConfigCenterPage`) and user-pasted YAML (`configStore.ts:190-204`)
- **Category**: 安全
- **Severity (suggested)**: P2 (needs verification against resolved js-yaml version)
- **Evidence**: `const parsed = load(yaml)` — no `{ schema: ... }` option. A YAML mapping with keys `constructor.prototype.<x>` could pollute `Object.prototype` before zod validation runs.
- **Fix suggestion**: Call `load(yaml, { schema: JSON_SCHEMA })` (or `DEFAULT_SAFE_SCHEMA`) explicitly. Sanitize/reject `__proto__`, `constructor`, `prototype` keys after parse. Verify resolved `js-yaml@5.4.2` behavior.
- **Behavior impact**: 无

- **Title**: No dashboard-level authentication — public deployment relies solely on per-instance Bearer secrets
- **Location**: `src/App.tsx` / `src/main.tsx`, `.github/workflows/deploy.yml:1-16`, `public/CNAME` (`dash.liusy.eu.org`)
- **Category**: 安全
- **Severity (suggested)**: P2
- **Evidence**: No login/session/role check; dashboard usable by anyone who can reach URL. `deploy.yml` publishes to public GitHub Pages custom domain.
- **Fix suggestion**: If public/hosted use intended, add auth layer (server.mjs proxy session cookie / basic auth, or auth provider). For on-prem/air-gapped, document network-access-control requirement, avoid public GitHub Pages deployment.
- **Behavior impact**: 变更行为

- **Title**: `importInstances` parses untrusted JSON with no schema validation and accepts arbitrary fields (incl. attacker-chosen `baseUrl`/`secret`)
- **Location**: `src/stores/instanceStore.ts:251-290`
- **Category**: 安全
- **Severity (suggested)**: P2
- **Evidence**: `imported = JSON.parse(json)` (no schema, no `__proto__` guard); presence-only check `if (!inst.id || !inst.name || !inst.baseUrl)`; `next.push({ ...inst, ... })` spreads all fields incl. secret.
- **Fix suggestion**: Validate imported instances with same zod schema as `InstanceDialog` (require `^https?://` baseUrl, min-8 secret, reject unknown keys).
- **Behavior impact**: 变更行为

- **Title**: ErrorBoundary logs full error objects (incl. `ApiError.body`) to the console
- **Location**: `src/components/ErrorBoundary.tsx:39`
- **Category**: 安全
- **Severity (suggested)**: P2 (needs verification of what lands in error bodies)
- **Evidence**: `console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)`. `ApiError.body` populated from `await res.text()` (client.ts:82) — raw server response text.
- **Fix suggestion**: Log only redacted summary (status + message, not `body`) in production. Gate full log behind `import.meta.env.DEV`.
- **Behavior impact**: 无

## DONE
