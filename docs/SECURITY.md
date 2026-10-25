# SECURITY.md

> 安全态势与已确认决策。决策理据见 `design-docs/architecture-decisions.md`。

## 已确认安全（无需动作）
- **路径穿越防护**：`server.mjs` `safeStaticPath` 坚实（URI 解码 + null 字节剥离 + 路径分隔符边界检查，`server.mjs:55-65`）。
- **代理转发面**：`/corec-api/*` 反代到启动参数固定的 CoreC 目标（`process.argv[4] || 'http://127.0.0.1:9090'`），不接受客户端指定 host；`/corec-proxy/*`（`X-CoreC-Target` 头）与 `/corec-ws`（`target` 查询参数）**按设计**转发到客户端指定的 http/https 目标（多实例能力，ADR-004a）——`parseTarget` 仅校验协议（http/https）与 hostname（`server.mjs:234-244`）。浏览器因此不必直连后端；该动态代理是一个受限开放转发面，属 ADR-004a 既定权衡。
- **无 XSS sink**：无 `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`。
- **密钥存储（明示披露）**：API 密钥与实例元数据**均存 localStorage**（`instanceStore.ts`：`corec_instances` + `corec_instance_secrets` 两键，跨标签页与会话保留；保存前 UI 明示"密钥将以明文保存在此浏览器"）。导出默认脱敏、含密钥需显式 opt-in（ADR-003）。服务端 `GET /configs/raw` 返回**明文**配置（CoreC 端 `executor.go` 注释明示 no redaction），其暴露面仅由 API 认证门禁（Bearer secret）约束——见 CoreC `docs/api/overview.md` 与本仓 `docs/FRONTEND.md` 的一致标注。

## 已确认决策（2026-10-02）
| 问题 | 决策 | ADR |
|---|---|---|
| 实例导出泄密（P0） | 默认脱敏 + 含密钥 opt-in 警告 | ADR-003 |
| CSP connect-src * + Bearer 任意后端 | 保留任意后端 + 同源代理；CSP 经 ADR-004a 修订为 `connect-src * ws: wss:`（静态托管直连回退） | ADR-004/004a |
| 公网无鉴权 | **维持现状（已豁免，接受风险）** | ADR-005 |
| 模板默认密钥 | 模板携带显式占位符 `REPLACE_ME_WITH_A_STRONG_SECRET`，加载模板时自动替换为随机密钥（见 ADR-006） | ADR-006 |
| WS token 走 URL 查询串 | 维持 + 确保 CoreC 不记 query | ADR-007 |

## 安全门禁现状
- **依赖完整性**：`package-lock.json` 锁定官方 registry 完整性哈希；`npm audit` 需 `--registry=https://registry.npmjs.org`（npmmirror 不支持 audit 端点）。
- **安全响应头**：`server.mjs` `serveStatic` 加 `X-Content-Type-Options: nosniff` / `Referrer-Policy: strict-origin-when-cross-origin` / `X-Frame-Options: DENY` / `Permissions-Policy`（`server.mjs:399-403`）。HSTS 不加——部署经 HTTP 自定义域（`deploy.yml`），HSTS 会强制 HTTPS 触发 Mixed Content；改 HTTPS 部署时再加（`server.mjs:404-405` 注释）。
- **dompurify 低危通报缓解**：`package.json` `overrides.dompurify ^3.4.16` 强制把经 `monaco-editor` 传递的 dompurify 解析到已修复版本（Monaco markdown 预览路径，非配置路径）；Monaco 资源自托管（ADR-008）消除 CDN 依赖。
- **ErrorBoundary 生产脱敏**：仅 DEV 输出完整 error 对象与 componentStack，生产日志脱敏（`src/components/ErrorBoundary.tsx`）。
- **CSP**：`index.html` 下发 `connect-src * ws: wss:`——放宽是为静态托管直连回退（ADR-004a）留的口子；server.mjs 形态下浏览器实际只发同源请求。

## 已豁免
- **TD-SEC-010**：公网无仪表盘鉴权——用户决策接受风险（ADR-005）。**风险残留：任何能访问 URL 者可操作仪表盘。** 改内网部署时需重新评估。
