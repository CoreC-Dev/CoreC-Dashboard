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
- **状态**：CSP 部分已由 ADR-004a 修订——`index.html` 实际下发 `connect-src * ws: wss:`（静态托管直连回退需要）；同源代理与按实例路由维持。
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
- **状态**：已恢复生效——模板携带显式占位符 `REPLACE_ME_WITH_A_STRONG_SECRET`（`lib/configTemplates.ts` 全部 6 处模板），`hooks/useConfigCenterLoads.ts` 加载模板时按带引号的占位符锚点替换为 `crypto.getRandomValues` 生成的 32 位十六进制随机值（回归测试断言占位符不出现在加载结果中）。占位符改名曾使替换静默失效，属缺陷而非方案变更。
- **背景**：配置模板曾内置弱默认密钥 `change-me-please`（满足 8 字符校验故不被拦）。
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

## ADR-009 改造分支策略（已废止）
- **决策**：所有 harness 改造提交仅落 `harnessing` 分支，不提交 `main`（§7.1）。
- **理由**：隔离改造风险；main 保持可发布。
- **日期**：2026-10-02
- **现状**：已废止。`harnessing` 分支在 `adaa0e8`（harnessing/arch-perf-slim → main）合并后不再存在；改造提交（文档/重构/测试）此后直接落 `main`，质量由 `ci.yml` 全门禁（lint / typecheck / docs-lint / 结构测试 / build / test / coverage）约束。

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

## ADR-011 派生标签归属：engine 组件而非 virtual driver
- **背景**：派生/虚拟标签需读引擎 `LatestCache` 求值。可做成 `driver/virtual`（实现 `core.Driver`）或 engine 内部组件。
- **决策**：做成 **engine 内部组件**（`engine/derived.go`），与 scheduler/batcher/discovery 同级。
- **理由**：driver 只能依赖 `core`/`common`（ARCHITECTURE 依赖方向），无法访问 engine 的 `LatestCache`；做成 driver 需注入 `core.LatestValuesProvider` 反向依赖，破坏分层。engine 组件天然持有 cache + dataBus，零契约改动。`LatestCache.GetAll()` 已提供跨驱动按 tag 名索引的快照，正合需求。
- **影响**：`engine/derived.go` 新增；`core.Config` 加 `DerivedTags` 字段；Start/Stop/Reload 接线。行为变更（新增可观测数据点），单独提交（R2）。
- **日期**：2026-10-16

## ADR-012 通知传输路由：forward 目标而非增强 alert 动作
- **背景**：告警需外发 Slack/Teams/email。可增强 `alert` 动作转发到 target transport，或直接用 `action: forward, target: notify-xxx`。
- **决策**：MVP 用 **forward 目标**——notify 是普通 transport，规则 `action: forward, target: notify-slack` 即可，零引擎改动。
- **理由**：forward 路径已存在且经规则引擎/批量/离线缓冲全链路；notify 作为 transport 自动享有 retry/offline-buffer/fallback。增强 alert 动作需改 engine 且与进程内 alertHandlers 语义重叠，复杂度上升。后续可选增强 alert 也转发（登记后续项，R4 不在本计划范围）。
- **影响**：新增 `transport/notify` 插件；规则名经 `DataPoint.Metadata["rule"]` 注入（forward payload 新增可选字段，omitempty 不破坏现有消费者）。业务行为影响=无（纯新增插件）。
- **日期**：2026-10-16

## ADR-013 schema 驱动表单：推迟至后端产出机器可读 schema（2026-10-17 处置登记）
- **背景**：审计曾建议由后端配置结构生成前端表单与校验，消除前后端字段漂移（前端 `lib/configSchema.ts` 811 行手写 zod 需与 CoreC `config/validate.go` 人工保持一致）。
- **决策**：**推迟**。触发条件：CoreC 输出 OpenAPI/JSON Schema（或等价机器可读契约）后，评估从 schema 生成 `configSchema.ts` 与表单注册表。
- **理由**：(1) 在无机器可读源时"生成"只能换一套手写，收益为零；(2) 漂移已有部分防线——`config.example.yaml` 对齐测试（commit dcdfd1c"dashboard-yaml alignment fixes"）+ `POST /configs/validate` 服务端终审，前端校验仅是 UX 优化非安全边界；(3) 规则/驱动/传输三向契约最近两批端点（drivers/test、rules/preview、configs/backups）均已按"以后端源码为准逐字段核对"交付。
- **影响**：无代码变更；本 ADR 即处置记录。到期重新评估时替换本条。

## ADR-014 移动端适配/暗色图表主题等体验项：登记为产品 backlog，不排期（2026-10-17 处置登记）
- **背景**：审计曾列为"低价值/锦上添花"建议（移动端布局、图表暗色主题、xterm 诊断命令扩展）。
- **决策**：登记为 **backlog**，当前不排期。目标用户为运维/控制工程师的桌面工位场景，上述项不影响核心工作流。
- **理由**：资源优先级原则——数据正确性/可观测性/控制安全类工作（本批：写审计、备份时间线、死信重放、批量写、实时面板）完成后才轮到体验增强。
- **影响**：无代码变更；后续有用户反馈时从 backlog 提起。
