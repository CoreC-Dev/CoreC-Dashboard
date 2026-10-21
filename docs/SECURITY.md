# SECURITY.md

> 安全态势与已确认决策。详细发现见 `exec-plans/tech-debt-tracker.md`（TD-SEC-001..012）；决策理据见 `design-docs/architecture-decisions.md`。

## 已确认安全（无需动作）
- **路径穿越防护**：`server.mjs` `safeStaticPath` 坚实（URI 解码 + null 字节剥离 + 路径分隔符边界检查）。
- **无 SSRF**：CoreC 代理目标固定（`process.argv[4] || 'http://127.0.0.1:9090'`），不转发攻击者可控 host。
- **无 XSS sink**：无 `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`。
- **密钥存储隔离（2026-10-21 审计修正）**：API 密钥与实例元数据**均存 localStorage**（`instanceStore.ts` 的持久化路径；运维在添加实例时显式选择此便利——见 ADR-003 的导出脱敏同源决策）。曾声称 sessionStorage 与"raw 配置脱敏"与代码不符：`lib/storage.ts` 的 sessionStorage 助手为死代码已删除；服务端 `GET /configs/raw` 实际返回**明文**配置（CoreC 端 `executor.go` 注释明示 no redaction），其暴露面仅由 API 认证门禁（Bearer secret）约束——详见 CoreC `docs/api/overview.md` 与本仓 `docs/FRONTEND.md` 的一致标注。

## 已确认决策（2026-10-02）
| 问题 | 决策 | ADR |
|---|---|---|
| 实例导出泄密（P0） | 默认脱敏 + 含密钥 opt-in 警告 | ADR-003 |
| CSP connect-src * + Bearer 任意后端 | 保留任意后端 + 同源代理 + CSP 收紧 | ADR-004 |
| 公网无鉴权 | **维持现状（已豁免，接受风险）** | ADR-005 |
| 模板弱默认密钥 | 加载时生成随机值 | ADR-006 |
| WS token 走 URL 查询串 | 维持 + 确保 CoreC 不记 query | ADR-007 |

## 门禁侧（阶段 3 已落地）
- **TD-SEC-004（P1）✅ 已核实**：js-yaml@5.4.2 integrity 哈希与 registry.npmjs.org 官方一致（内容相同，非 fork）。audit 需 `--registry=https://registry.npmjs.org`（npmmirror 不支持 audit 端点）。
- **TD-SEC-007（P2）✅ 已完成**：server.mjs `serveStatic` 加 `X-Content-Type-Options: nosniff` / `Referrer-Policy: strict-origin-when-cross-origin` / `X-Frame-Options: DENY` / `Permissions-Policy`。HSTS 因 HTTP 部署暂不加（见 deploy.yml）。
- **TD-SEC-008（P2）✅ 已核实**：`npm audit --registry=https://registry.npmjs.org` 跑通，2 low（dompurify via monaco，见下），无 high/critical。
- **TD-SEC-013（P2）✅ 已完成**：dompurify 3.4.13-15 DOM XSS（GHSA-p98j-92pf-mc4p），经 monaco-editor 传递。低危（Monaco markdown 预览，非配置路径）。已随 Monaco 自托管升级。
- **TD-SEC-012（P2）✅ 已完成**：ErrorBoundary 生产脱敏日志——属 `src/` 行为变更，已随安全批次提交。

> 豁免/ratchet 机制与 audit 细节见 `docs/design-docs/gate-exemptions.md`。

## 已豁免
- **TD-SEC-010**：公网无仪表盘鉴权——用户决策接受风险（ADR-005）。**风险残留：任何能访问 URL 者可操作仪表盘。** 改内网部署时需重新评估。
