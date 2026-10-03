# 架构决策记录（ADR）

> 交互式决策与关键架构取舍的落盘记录。core-beliefs #11：确认过但不写进仓库的决策等于没做。

## ADR-001 框架判定：其他（Vite/React SPA，非 Tauri）
- **背景**：阶段 1 需按 §3.2 判定项目类型以决定 CI 路径。
- **决策**：判定为"其他"。
- **证据**：无 `src-tauri/`/`tauri.conf.json`/`Cargo.toml`；有 `vite.config.ts`/`index.html`/`server.mjs`/`package.json`（react+vite）。
- **影响**：§3.4 适用，跳过 §3.3 三问；阶段 3 落地基础 lint/test/build/coverage 门禁，**不生成多平台打包发布流水线**。
- **日期**：2026-10-02

## ADR-002 锁file 权威：npm（D1）
- **背景**：仓库并存 `package-lock.json`（npm）与 `pnpm-lock.yaml`（pnpm），CI 用 npm。两份可漂移。
- **决策**：npm 为权威。保留 `package-lock.json`，删除 `pnpm-lock.yaml`，CI 与本地命令统一 npm。
- **理由**：CI 已用 `npm ci`，切换零成本；避免双 lockfile 漂移。
- **影响**：阶段 3 执行删除 + 统一命令。
- **日期**：2026-10-02

## ADR-003 实例导出密钥处理：默认脱敏 + opt-in 含密钥（D2，修 P0 TD-SEC-003）
- **背景**：`instanceStore.exportInstances` 当前把 API 密钥明文写进下载 JSON，操作者导出后易泄露。
- **决策**：默认导出脱敏（不含 secret）；显式勾选"含密钥"时弹警告后导出，兼顾备份/迁移连接需求。
- **理由**：消除 P0 泄露同时保留备份能力；含密钥为显式 opt-in 而非默认。
- **影响**：批次 I；行为变更，单独提交。
- **日期**：2026-10-02

## ADR-004 后端连接与 CSP：保留任意后端 + 同源代理 + CSP 收紧（D3）
- **背景**：CSP `connect-src *` 且 Bearer 直发用户输入的任意后端，存在凭证外泄风险。仪表盘是多实例监控工具，用户自加 CoreC 后端。
- **决策**：保留连接任意后端能力；`server.mjs` 按实例代理，浏览器只发同源请求；CSP `connect-src` 改 `'self' ws: wss:`。
- **理由**：修外泄风险且不破坏多实例 UX；同源代理把凭证留在服务端转发，不暴露给浏览器 CSP 放宽。
- **影响**：批次 I；需改 server.mjs 代理逻辑 + index.html CSP；行为变更。
- **日期**：2026-10-02

## ADR-004a 同源代理可选化：静态托管直连回退 + 每实例可配置（ADR-004 addendum）
- **背景**：ADR-004 的同源代理需要 `server.mjs` 运行。部署到 GitHub Pages（纯静态托管）时无代理，`/corec-proxy/*` 返回 404，全部 API/WS 调用失败。此外，不同 CoreC 实例的网络可达性不同（有的只有浏览器可达如 localhost，有的只有 VPS 可达如内网），全局代理/直连开关无法覆盖混合场景。
- **决策**：
  1. 启动时探测 `/corec-proxy/`（HEAD）。404 → 直连模式（`fetch(baseUrl+path)`，CSP 放宽为 `connect-src * ws: wss:`）；非 404 → 代理模式（ADR-004 原行为）。`src/api/proxyMode.ts` 缓存探测结果。
  2. 每实例可配 `useProxy: 'auto' | 'proxy' | 'direct'`（`CoreCInstance` 新增字段，默认 `'auto'`）。`resolveProxyMode(useProxy)` 解析：`proxy`/`direct` 强制覆盖全局探测结果，`auto`/`undefined` 跟随全局。InstanceDialog 提供下拉选择。
- **理由**：恢复 GitHub Pages 功能性 + 支持混合网络拓扑。直连模式下凭证暴露给浏览器（ADR-004 前的行为），接受为静态托管的权衡。`server.mjs` 部署仍走代理模式，安全无降级。
- **影响**：行为变更；改 `client.ts` + `websocket.ts` + `main.tsx` + `index.html` CSP + `ConnectionContext.tsx` + `useHomepageProbe.ts` + `InstanceDialog.tsx` + `InstancePanel.tsx`；新增 `proxyMode.ts`；`CoreCInstance` + `ActiveConnection` 类型扩展。
- **日期**：2026-10-03

## ADR-005 仪表盘鉴权：维持公网无鉴权现状（D4）
- **背景**：仪表盘公网部署（GitHub Pages 自定义域）且无登录。
- **决策**：维持现状，不加仪表盘级鉴权。TD-SEC-010 标记已豁免。
- **理由**：用户决策接受风险，仅靠逐实例 Bearer 密钥保护。
- **影响**：TD-SEC-010 已豁免；批次 I 不含此项。**风险残留：任何能访问 URL 者可操作仪表盘。** 若后续改内网部署需重新评估。
- **日期**：2026-10-02

## ADR-006 模板默认密钥：加载时生成随机值（D5）
- **背景**：配置模板内置弱默认密钥 `change-me-please`（满足 8 字符校验故不被拦）。
- **决策**：每次加载模板时生成随机 secret，消除已知弱值。
- **影响**：批次 I；行为变更（模板默认值变随机）。
- **日期**：2026-10-02

## ADR-007 WS token 传输：维持 URL 查询串 + 确保 CoreC 不记 query（D6）
- **背景**：WebSocket 鉴权 token 走 URL 查询串，可能出现在访问日志。
- **决策**：维持查询串方式（前端单边落地）；需确认 CoreC 访问日志不记录 query string。
- **理由**：ticket/子协议方案需 CoreC 后端配合，复杂度上升；前端项目单边可控。
- **影响**：批次 I；需在 CoreC 侧确认日志脱敏（跨仓库依赖，登记）。
- **日期**：2026-10-02

## ADR-008 Monaco 托管：自托管 min/vs 资产（D7）
- **背景**：Monaco 核心运行时从 jsDelivr CDN 拉取，气隙/内网 IIoT 环境致 Config Center 空白。
- **决策**：`monaco-editor` 的 `min/vs` 进本地静态，`loader.config` 指本地路径。
- **理由**：IIoT 部署常气隙/内网；自托管消除 CDN 依赖与 CSP 放宽。
- **影响**：批次 J；行为变更（编辑器资源来源改本地）；增包体积。
- **日期**：2026-10-02

## ADR-009 改造分支策略
- **决策**：所有 harness 改造提交仅落 `harnessing` 分支，不提交 `main`（§7.1）。
- **理由**：隔离改造风险；main 保持可发布。
- **日期**：2026-10-02

## ADR-010 字段元数据单一真相源：采纳 settingsRegistry（TD-ARCH-011 / TD-DUP-001）
- **决策**：以 `settingsRegistry` 为字段元数据唯一源；DriverDetailPage / TransportDetailPage 经 `registryToEditFields` 适配器派生编辑字段，删除本地 `*_FIELDS` 数组。两源在 5 类分歧上以 registry 为准落地。
- **分歧与处置（行为变更，已登记）**：
  1. registry 的 reconnect 组对全部驱动存在，4/5 详情数组缺失 → 全类型显示 reconnect 字段。
  2. `retry`：registry 仅 modbus-tcp/rtu 有，udp 变体无 → udp 变体详情表单移除 retry。
  3. OPCUA security-policy：registry 4 选项 vs 详情 6 选项 → 采用 4（移除 Basic128Rsa15/Basic256）。
  4. ~10 处占位符差异 → 采用 registry（含 modbus-tls 端口 502→802 bug 修复）。
  5. 2 处 zh-CN 标签措辞（retry、caFile）→ 采用 registry 措辞。
  6. **bug 修复**：driver `tags-file`/`tags-interval` 改写为顶层（原误入 `settings`，与 configSchema + wizard 冲突）。
  7. transport 标签改用 registry `settings.*` 措辞（如 broker「Broker」→「Broker URL」）。
- **transport 范围**：详情快编表单保留精选字段集（呈现选择；高级/动态字段如 TLS 证书、command 转发、fallback 动态选择留 wizard）；元数据单源。`headers`（map 字段，registry 尚无 map 类型）保留为显式补充，登记为 TD-ARCH-011 后续。
- **理由**：消除三真相源（registry + 详情数组 + schema）的手工镜像风险；registry 已为 wizard 单源，详情页对齐之。
- **日期**：2026-10-03
- **提交**：`17c722c`
