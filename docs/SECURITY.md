# SECURITY.md

> 安全态势与已确认决策。详细发现见 `exec-plans/tech-debt-tracker.md`（TD-SEC-001..012）；决策理据见 `design-docs/architecture-decisions.md`。

## 已确认安全（无需动作）
- **路径穿越防护**：`server.mjs` `safeStaticPath` 坚实（URI 解码 + null 字节剥离 + 路径分隔符边界检查）。
- **无 SSRF**：CoreC 代理目标固定（`process.argv[4] || 'http://127.0.0.1:9090'`），不转发攻击者可控 host。
- **无 XSS sink**：无 `dangerouslySetInnerHTML`/`innerHTML`/`eval`/`new Function`。
- **密钥存储隔离**：API 密钥存 sessionStorage（非 localStorage）；元数据存 localStorage。服务端 `GET /configs/raw` 返回密钥脱敏为 `***`。

## 已确认决策（2026-10-02）
| 问题 | 决策 | ADR |
|---|---|---|
| 实例导出泄密（P0） | 默认脱敏 + 含密钥 opt-in 警告 | ADR-003 |
| CSP connect-src * + Bearer 任意后端 | 保留任意后端 + 同源代理 + CSP 收紧 | ADR-004 |
| 公网无鉴权 | **维持现状（已豁免，接受风险）** | ADR-005 |
| 模板弱默认密钥 | 加载时生成随机值 | ADR-006 |
| WS token 走 URL 查询串 | 维持 + 确保 CoreC 不记 query | ADR-007 |

## 待修复（阶段 4 批次 I，行为变更，每条单独提交）
- **TD-SEC-003（P0）**：`instanceStore.ts:247` 导出脱敏 + opt-in。→ ADR-003
- **TD-SEC-001/002（P1）**：CSP 收紧 + server.mjs 同源代理。→ ADR-004
- **TD-SEC-006（P2）**：模板随机密钥。→ ADR-006
- **TD-SEC-009（P2）**：`configYaml.ts` `load(yaml, { schema: JSON_SCHEMA })` + 拒绝 `__proto__`/`constructor` key。
- **TD-SEC-011（P2）**：`importInstances` 用 zod 校验导入 JSON，拒绝未知 key。
- **TD-SEC-005（P2）**：WS token 维持查询串（ADR-007）；登记 CoreC 侧日志脱敏依赖。

## 待核实/门禁侧（阶段 3）
- **TD-SEC-004（P1）**：js-yaml 5.4.2 来自 npmmirror 镜像——从官方 registry 重解析 + 哈希确认 + `npm audit`。
- **TD-SEC-007（P2）**：server.mjs 加安全响应头（nosniff / Referrer-Policy / Permissions-Policy / HSTS）。
- **TD-SEC-008（P2）**：bleeding-edge 依赖——`npm audit` + 锁精确版本。
- **TD-SEC-012（P2）**：ErrorBoundary 生产脱敏日志（仅 status+message，body 置 `import.meta.env.DEV` 后）。

## 已豁免
- **TD-SEC-010**：公网无仪表盘鉴权——用户决策接受风险（ADR-005）。**风险残留：任何能访问 URL 者可操作仪表盘。** 改内网部署时需重新评估。
