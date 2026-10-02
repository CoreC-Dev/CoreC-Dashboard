# engineering.md

> 工程化说明：开发/构建/测试/调试/部署/排障。

## 环境要求
- Node.js（见 `package.json` engines；建议 ≥ 20）
- npm（权威包管理器，ADR-002）

## 开发
```bash
npm install
npm run dev      # Vite dev server（HMR）
```
路径别名 `@` → `src/`（`vite.config.ts` + `tsconfig.json`）。i18n 资源在 `src/i18n/`。

## 构建
```bash
npm run build    # Vite 生产构建 → dist/
```
`vite.config.ts` 已配 manualChunks（recharts/d3、react、query、radix、lightweight-charts、xterm、js-yaml、zod、i18n、rhf、monaco 分包）+ 全路由懒加载。

## 测试
```bash
npm test                  # vitest run
npm run test:coverage     # 覆盖率（阶段 3 接入门禁）
```
- 配置：阶段 3 建 `vitest.config.ts`（jsdom + setup + v8 coverage）（TD-TEST-001）。
- 现状：18 测试文件，强区 `lib/` + `configStore`；关键路径缺口见 `exec-plans/tech-debt-tracker.md` TD-TEST-*。

## Lint / 格式化
```bash
npm run lint      # Biome
```
`biome.json`：`noExplicitAny` 当前 warn（阶段 3 提 error，TD-GATE-004）。

## 生产运行
```bash
npm run build
node server.mjs <port> <dist-dir> <corec-url>
# 默认：node server.mjs 8080 dist http://127.0.0.1:9090
```
`server.mjs`：静态托管 `dist/` + 反向代理 `/corec-api` → CoreC 后端。阶段 4 改为按实例同源代理（ADR-004）+ 安全响应头（TD-SEC-007）。

## 部署
GitHub Actions `deploy.yml`：push `main` → lint/build/test → 发布 GitHub Pages 自定义域。阶段 3 新增 `ci.yml`（PR + 全分支门禁），deploy 改 needs:ci（TD-GATE-001）。

## 调试
- 连接问题：看 `ConnectionContext` 探测日志（浏览器 console）+ CoreC 后端可达性。
- WS 不连：`api/websocket.ts` 退避/重连上限 10；检查 token + CoreC WS 端点 + 防火墙。
- 配置不生效：`configStore` working/saved/dirty 状态 + `configSchema.validateConfig` 错误路径。
- 生产空白页：检查 Monaco 资源加载（CDN/自托管，ADR-008）+ CSP 控制台违规。

## 排障清单
| 症状 | 先查 |
|---|---|
| 实例连不上 | ConnectionContext 探测 + CoreC `/` 可达 + Bearer 密钥 |
| Config Center 空白 | Monaco 加载（网络/CSP）+ `useHomepageProbe` |
| WS 数据不更新 | `CoreCWebSocket` 状态 + 限流是否丢消息 + 重连是否到上限 |
| 配置 apply 失败 | `validateFullConfig` 错误 + `updateConfig.mutate` onError |
| 导出文件无密钥 | 预期行为（ADR-003 默认脱敏）；需含密钥则勾选 opt-in |
