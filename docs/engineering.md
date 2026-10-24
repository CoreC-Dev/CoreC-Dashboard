# engineering.md

> 工程化说明：开发/构建/测试/调试/部署/排障。

## 环境要求
- Node.js ≥ 24（`package.json` engines；`.nvmrc` 钉 24，CI 经 `node-version-file` 使用）
- npm（权威包管理器，ADR-002）

## 开发
```bash
npm install
npm run dev      # Vite dev server（HMR）
```
路径别名 `@` → `src/`（`vite.config.ts` resolve.alias + `tsconfig.app.json` paths）。i18n 资源在 `src/i18n/`。

## 构建
```bash
npm run build    # tsc -b && vite build → dist/
```
`vite.config.ts` 已配 manualChunks（recharts/d3、react、query、radix、lightweight-charts、xterm、js-yaml、zod、i18n、rhf、monaco 分包）+ 全路由懒加载。

## 测试
```bash
npm test                  # vitest run + server 冒烟（node --test scripts/server-smoke.test.mjs）
npm run test:coverage     # 覆盖率门禁（v8 provider，ratchet 只升不降）
```
- 配置：`vitest.config.ts`（jsdom + `src/test/setup.ts` + v8 coverage；全局阈值 lines 41 / statements 40 / branches 30 / functions 31）。
- 现状：112 个测试文件（`src/**` 111 + `scripts/server-smoke.test.mjs`）。

## Lint / 格式化
```bash
npm run lint      # biome check src scripts server.mjs vite.config.ts
npm run lint:all  # biome + docs/structure/custom/any 四项自定义检查
```
`biome.json`：`noExplicitAny` 为 error；存量 any 基线由 `npm run any:ratchet` 维护（只降不升）。

## 生产运行
```bash
npm run build
node server.mjs <port> <dist-dir> <corec-url>
# 默认：node server.mjs 8080 dist http://127.0.0.1:9090
```
`server.mjs`：静态托管 `dist/`（含 SPA fallback 与路径穿越防护）+ 双路反代——`/corec-api/*` → 固定 CoreC 目标、`/corec-proxy/*`（`X-CoreC-Target` 头）与 `/corec-ws` → 按实例动态代理（ADR-004/004a）；转发 WebSocket upgrade；安全响应头。

## 部署
两种形态（`deploy.yml` 头注即此架构）：
- **GitHub Pages 静态 SPA**（`deploy.yml`：push `main` → 复用 `ci.yml` 全门禁 → build → deploy-pages；自定义域走 HTTP + `public/CNAME`）：无 server.mjs，启动探测 `/corec-proxy/` 404 → **直连模式**，浏览器直接 fetch 远程 CoreC（CSP `connect-src *`）。
- **server.mjs 自托管**：同源代理形态，浏览器只访问单端口（见上节"生产运行"）。

## 调试
- 连接问题：看 `ConnectionContext` 探测日志（浏览器 console）+ CoreC 后端可达性。
- WS 不连：`api/websocket.ts` 退避/重连上限 10；检查 token + CoreC WS 端点 + 防火墙。
- 配置不生效：`configStore` working/saved/dirty 状态 + `configSchema.validateConfig` 错误路径。
- 生产空白页：检查 Monaco 自托管资源（`dist/monaco/min/vs` 是否随构建产出，ADR-008）+ CSP 控制台违规。

## 排障清单
| 症状 | 先查 |
|---|---|
| 实例连不上 | ConnectionContext 探测 + CoreC `/` 可达 + Bearer 密钥 |
| Config Center 空白 | Monaco 加载（网络/CSP）+ `useHomepageProbe` |
| WS 数据不更新 | `CoreCWebSocket` 状态 + 限流是否丢消息 + 重连是否到上限 |
| 配置 apply 失败 | `validateFullConfig` 错误 + `updateConfig.mutate` onError |
| 导出文件无密钥 | 预期行为（ADR-003 默认脱敏）；需含密钥则勾选 opt-in |
