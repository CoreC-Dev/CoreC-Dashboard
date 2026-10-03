# Harness 工程化改造计划

## 0. 元信息
- 项目 / 仓库：CoreC-Dashboard（CoreC 项目前端）
- 分支：`harnessing`（从 `main` 切出，改造期间所有提交仅落此分支，§7.1）
- 计划版本 / 日期：v1.0 / 2026-10-02
- 状态：阶段 4 批次 A–J 已完成；阶段 5（测试补全 TD-TEST-002..016）已完成，592 tests 全绿；剩 §14 收官拆解（归档 HARNESS-RULES.md）
- 规则母本：`docs/HARNESS-RULES.md`（§0 契约 C1–C7、§5 五阶段、附录 A/B/C/E/F）
- 本轮范围：**仅阶段 1**（全量扫描 + 计划 + 问题清单）。阶段 2–5 待人工确认本计划后启动（契约 C2 串行、C1 计划先行）。

## 1. 项目概况
- **技术栈**：React 19.3 + Vite 8（rolldown）+ TypeScript 7.0 + Zustand + @tanstack/react-query 5 + @tanstack/react-virtual + Biome 2.5 + Vitest 5 + jsdom；UI 用 Radix UI + Tailwind；图表 recharts + lightweight-charts；编辑器 @monaco-editor/react；终端 xterm；表单 react-hook-form + zod 4；i18next 26。
- **构建方式**：Vite 单页构建（`vite build`），`vite.config.ts` 已做 manualChunks 充分拆分 + 全路由懒加载。
- **运行方式**：开发 `vite dev`；生产由自写 `server.mjs`（Node http）做静态托管 + 反向代理到 CoreC 后端（固定 `http://127.0.0.1:9090`）。
- **部署方式**：GitHub Actions `deploy.yml` 构建后发布到 GitHub Pages 自定义域（`public/CNAME` → dash.liusy.eu.org）。
- **顶层模块与入口点**：feature-sliced `src/{api,components,contexts,features,hooks,i18n,lib,stores,types}`；入口 `src/main.tsx` → `App.tsx`（路由）；路径别名 `@`→`src`。
- **规模**：132 跟踪文件，src 下 ~117 TS/TSX（~25.7k 行）；测试 18 文件 / ~3,339 行。
- **当前测试与 CI 现状**：见 §2 与 `docs/CI.md`。lint/build/test 仅在 `deploy.yml` 的 push-to-main 触发；无 PR 门禁、无覆盖率、无 hook、双 lockfile。

## 2. 框架判定与 CI 现状（见 §3.2）
- **判定结果：其他**（Vite/React SPA，**非 Tauri**）→ §3.4 适用，跳过 §3.3 三问；阶段 3 落地基础 lint/test/build/coverage 门禁，**不生成任何多平台打包发布流水线**。
- **判定证据**：无 `src-tauri/`、无 `tauri.conf.json`、无 `Cargo.toml`；有 `vite.config.ts`、`index.html`、`server.mjs`、`package.json`（react/vite 依赖）。证据已写入 `docs/CI.md`。
- **现有 .github/workflows/ 清单与触发条件**：仅 `deploy.yml`（触发 `push` to `main` + `workflow_dispatch`），单 job 跑 `npm ci` → lint → build → test → 部署 Pages。无 `ci.yml`、无 PR 触发、无分支保护。
- **已有发布链路现状**：GitHub Pages 静态托管 + 自定义域；无版本 tag 发布、无 Release 资产、无多平台打包。
- **门禁现状**：无 pre-commit/pre-push hook；Biome `noExplicitAny: warn`（非 error）；无结构测试；无覆盖率配置；无文档门禁。

## 3. 现状诊断
> 完整 76 条问题见 `docs/exec-plans/tech-debt-tracker.md`（速查表 + 详细条目）。5 域并行审计原始报告见 `docs/exec-plans/.scratch/audit-{architecture,complexity,tests,security,performance}.md`。以下为分域摘要。

**汇总**：P0 ×1 ｜ P1 ×24 ｜ P2 ×51。业务行为影响：变更行为 ×10（均列入 §6 待决策）｜ 无 ×66。

### 3.1 架构现状（含模块依赖图）— 13 条（TD-ARCH-001..013）
- **依赖方向（预期）**：`types ← lib ← api ← stores ← hooks/contexts ← components ← features ← App`
- **健康项**（无需动作，记入 ARCHITECTURE.md 作为不变量）：**零跨 feature 直连**（`features/admin` 仅自引 7 处，无跨域边）；**下层干净**（stores/lib 不引 components/features；components 不引 features）；components/ui 16/17 原语纯展示。
- **层反转**（P1）：`types/models.ts:1` → `@/lib/constants`（TD-ARCH-001，types↔lib 概念环）；`api/hooks` ↔ `contexts/ConnectionContext` 双向依赖（TD-ARCH-002，层级环）。
- **God Object**（P1）：`stores/configStore.ts` 425 行 / 29 方法 / 14 消费者（TD-ARCH-003）；`lib/utils.ts` 34 导入者，模块级 i18n 耦合 16 个 UI 原语（TD-ARCH-004）。
- **三真相源**（P1）：字段元数据同时存于 `settingsRegistry.ts` + 详情页 `*_FIELDS` 数组 + `configSchema.ts` zod 校验（TD-ARCH-011），头注释已承认手工镜像。
- **P2 整洁度**：UI 原语引 hooks（005）、CoreCInstance 类型定义在 store（006）、无 WS hook 抽象 5 消费者裸用（007）、feature 越层引 api/client（008）、lib 依赖 i18n 单例（009）、@/ 与相对导入混用（010）、EntityEditConfigCard 17 props 透传（012）、settingsRegistry 878 行数据 God Object（013）。

### 3.2 复杂度热点 — 10 条（TD-CPLX-001..010）
- **God 组件**（P1）：ConfigCenterPage ~886 行 / 9 useState / 7+ 关注点（001）；TagExplorerPage ~800 行 / 14 useState / 流式+虚拟化+图表+写入（002）；RulesPage ~818 行 / 15 useState + 内联测试模拟器（003）。
- **P2**：configSchema.validateConfig 165 行圈复杂度 ≥20 + 嵌套 DFS（004）；AppShell ~537 行 7 关注点（005）；GlobalConfigEditor ~430 行手写非数据驱动（006）；WriteControlPage ~506 行 4 关注点（007）；getActionBadge 5 分支 switch（008）；TagExplorerPage WS effect 隐式 ref 状态（009）；ConfigCenterPage auto-load ref guard + getState 命令式读（010）。

### 3.3 重复代码 — 6 条（TD-DUP-001..006）
- **P1**：DriverDetailPage ≈ TransportDetailPage 字段数组并行（001）；Driver/TransportEditConfigSection 逻辑复制仅抽 JSX（002）；apply-confirmation+mutation 模式 4×（003）。
- **P2**：reset-on-open wizard 3×（004）；handleCreate/Edit/Delete 3×（005）；内联 connection-summary 渲染 4×（006）。

### 3.4 文档缺口 — 3 条（TD-DOC-001..003）
- 无 README.md（001，P1）；无 AGENTS.md / ARCHITECTURE.md / docs 结构 / core-beliefs.md（002，P1，违反 §2.1 必需项）；无 QUALITY_SCORE.md / exec-plans 标准结构（003，P2）。→ 阶段 2 全部补齐。

### 3.5 测试缺口 — 16 条（TD-TEST-001..016）
- **配比**：18 测试文件 / ~3,339 行 vs 96 源文件。强区：`lib/` 纯函数 + `configStore`。**无 vitest 配置 / 无覆盖率 / 无全局 jsdom setup / jest-dom 未配置**（001，P1）。
- **关键无测**（P1）：instanceStore 密钥存储隔离+导入导出（002）、api/client.ts 超时/abort/401（003）、api/websocket.ts 限流/退避/重连上限（004）、ConnectionContext 探测生命周期（005）、useHomepageProbe 并行探测+abort（006）、InstanceDialog 表单校验（007）、api/endpoints 16 端点仅测 2（008）、writeValidation PLC 写值强转（010）。
- **P2**：api/hooks 缓存失效（009）、configYaml 往返（011）、connectionInfo 摘要（012）、ruleMatchEvaluator（013）、admin 冒烟测试仅断言容器真值=假测试风险（014）、wizard 测试只覆盖纯函数（015）、settingsRegistry 仅结构级（016）。

### 3.6 安全风险 — 12 条（TD-SEC-001..012）
- **已确认安全**（不计入台账）：路径穿越防护 `safeStaticPath` 坚实、无 SSRF（CoreC 目标固定）、无 XSS sink（无 dangerouslySetInnerHTML/eval）、密钥存 sessionStorage、服务端密钥脱敏（`***`）。
- **P0**：实例导出明文泄露 API 密钥——`instanceStore.ts:247` `exportInstances` 未脱敏 secret，下载 JSON 含全部密钥明文（TD-SEC-003）。
- **P1**：CSP `connect-src *`（001）；Bearer 密钥发往任意用户选定后端=浏览器 SSRF/凭证重定向（002）；js-yaml 5.4.2 来自 npmmirror 镜像供应链风险（004，待核实）。
- **P2**：WS token 走 URL 查询串（005）、模板弱默认密钥 change-me-please（006）、server.mjs 无安全响应头（007）、bleeding-edge 依赖（008）、js-yaml load() 无安全 schema 原型污染风险（009）、公网部署无仪表盘鉴权（010）、importInstances 未校验 JSON 即 spread（011）、ErrorBoundary 日志输出完整 ApiError.body（012）。

### 3.7 性能与可靠性 — 12 条（TD-PERF-001..012）
- **已加固**（无需动作，记入 ARCHITECTURE.md）：WebSocket 退避+抖动+重连上限+环形缓冲限流、图表窗口封顶、rAF 批处理、apiRequest 15s 超时、路由懒加载、manualChunks 充分拆分、无泄漏 socket、无 N+1。
- **P1**："View Tags" 弹窗未虚拟化标签列表（001）；pprof 下载裸 fetch 无超时可永久挂起（002）。
- **P2**：表单模式 zod 逐键全量校验无防抖（003）、AlertsPage/WriteControlPage 死信列表未虚拟化/未 memo（004,005）、DiagnosticsPage/TopologyPage/DriversPage 多处 .filter/.find 每渲染重算 O(n²)（006,007,008）、AppShell 订阅整个 instances 数组（009）、Monaco 运行时从 CDN 拉取致气隙不可用+CSP 依赖（010）、首页探测 5N 请求/15s 无并发上限（011）、clearedDlqKeys Set 无界增长（012）。

## 4. 改造批次划分

> 阶段 2（文档）/ 阶段 3（门禁）/ 阶段 5（测试）按阶段推进，不在此表。本表为**阶段 4 重构与修复批次**，按"基础层→上层→去重→拆分→安全→性能"依赖序排列。每批独立回滚（git revert 单批提交序列），行为守恒由对拍/测试证明；标"变更行为"的批次须先获 §6 对应决策确认。

| 批次 | 覆盖问题 | 主要目标 | 依赖前置 | 回滚方案 |
|---|---|---|---|---|
| A · 基础层治理 | TD-ARCH-001,004,005,009 | 消除 types→lib 反向；cn 抽离 lib/cn.ts 解耦 16 UI 原语与 i18n；lib 纯模块化；UI 原语不引 hooks | 无 | revert；type-only 改动运行时零影响 |
| B · api/contexts 解耦 | TD-ARCH-002,007,008 | 消除 api↔contexts 环（连接状态下沉）；引入 useCoreCWebSocket hook；ApiError 从 api/hooks re-export | A | revert + 现有 endpoints 测试守恒 |
| C · stores 治理 | TD-ARCH-003,006 | configStore 按关注点切 slice；CoreCInstance 移到 types/ | A | revert + configStore 现有测试全过 |
| D · 详情页去重+单一真相源 | TD-DUP-001,002, TD-ARCH-011,012,013 | 字段元数据以 settingsRegistry 为单源派生详情编辑字段；抽 useEntityEditConfig hook；settingsRegistry 拆文件+parity 测试 | C | revert + 详情页 YAML 导入导出对拍 |
| E · 列表页去重 | TD-DUP-003,005,006, TD-CPLX-008 | 抽 useApplyConfig / useEntityListPage / ConnectionFields 组件；getActionBadge 查表 | D | revert + 列表页行为对拍 |
| F · 大组件拆分 | TD-CPLX-001,002,003,005,006,007 | 6 个 God 组件拆为 薄组合 + 状态 hook（ConfigCenter/TagExplorer/Rules/AppShell/GlobalConfigEditor/WriteControl） | D, E | revert + 各页关键交互对拍 |
| G · 复杂函数/effect 拆分 | TD-CPLX-004,009,010 | validateConfig 拆命名纯校验器；WS effect 封装进 useTagStream；auto-load 改响应式 | F | revert + configSchema 测试守恒 |
| H · wizard 去重 | TD-DUP-004 | 抽 useResetOnOpen | E | revert |
| I · 安全修复（变更行为） | TD-SEC-001,002,003,005,006,009,010,011 | 按 §6 D2–D6 决策结果修：导出脱敏、后端白名单/CSP、WS token、模板密钥、YAML 安全 schema、仪表盘鉴权、导入校验 | §6 D2–D6 确认 + F | revert + 安全回归测试；每条单独提交（C4） |
| J · 性能/可靠性 | TD-PERF-001..012 | 虚拟化/封顶、pprof 超时、memo/防抖、Monaco 自托管（§6 D7）、Set 封顶 | F（大组件拆分后） | revert + 性能回归 |

## 5. 五阶段任务拆解

### 阶段 1 · 全量扫描与问题清单  ← **本轮已完成，待确认**
- **子任务**：仓库地图（§1）→ 框架判定（§2 + docs/CI.md）→ 架构/复杂度/重复/文档/测试/安全/性能/门禁 8 维审计（5 并行 subagent + 一手核验）→ 风险分级 P0/P1/P2 → 分域批次（§4）。
- **产出物**：`docs/exec-plans/active/harness-migration.md`（本文件）、`docs/exec-plans/tech-debt-tracker.md`（76 条）、`docs/CI.md`、`docs/HARNESS-RULES.md`、`docs/exec-plans/.scratch/audit-*.md`（5 份审计原始报告）。
- **验收标准**：
  - [x] 五阶段全部拆解（见下各阶段），每子任务有产出物路径 + 可机械检查验收。
  - [x] 框架判定完成，命中证据写入 `docs/CI.md`。
  - [x] 问题清单每条含 ID/位置/类别/严重度/证据/修复建议/业务行为影响/关联批次/验收方式/状态。
  - [x] "变更行为"（×10）与纯重构严格分离，变更行为项全部列入 §6 待决策。
  - [x] 每批有独立回滚方案（§4）。
  - [x] 无只有标题无分析的条目。
  - [x] **未修改任何业务代码**（`git diff --stat` 自证，见 §7 日志）。

### 阶段 2 · 文档对齐  （前置：本计划获确认）
- **子任务**：重写 AGENTS.md（≤100 行地图，附录 E）→ 编 ARCHITECTURE.md（领域图 + 分层 + 依赖方向规则，含 §3.1 健康不变量）→ 建 docs/ 结构 + index.md → 沉淀 core-beliefs.md（附录 F）→ 建 QUALITY_SCORE.md（按域/层打分）→ 建 exec-plans 标准结构（active/completed/tracker）→ 补工程化说明（开发/构建/测试/调试/发布/排障）→ 文档防腐 linter。
- **产出物**：AGENTS.md、ARCHITECTURE.md、docs/ 树 + index.md、core-beliefs.md、QUALITY_SCORE.md、文档校验脚本。
- **验收**：AGENTS.md ≤200 行能引到下一站；ARCHITECTURE.md 依赖方向抽样 ≥3 处与代码一致；index.md 链接全可解析；QUALITY_SCORE 每域有分+差距+可复算依据；文档门禁缺必填节/死链时失败。覆盖 TD-DOC-001..003。

> **✅ 阶段 2 已完成（2026-10-02）**。产出：`AGENTS.md`（67 行）+ `ARCHITECTURE.md` + `docs/` 树（`index.md`、`design-docs/{index,core-beliefs,architecture-decisions,doc-gardening}.md`、`FRONTEND.md`、`SECURITY.md`、`RELIABILITY.md`、`DESIGN.md`、`engineering.md`、`QUALITY_SCORE.md`、`exec-plans/completed/`）+ `scripts/docs-lint.mjs`。验收：`node scripts/docs-lint.mjs` 通过（链接可解析、必填节齐全、索引完备、AGENTS.md 67 行 ≤200）。`ARCHITECTURE.md` 含 5 处与代码一致的健康不变量 + 4 处已知反转（标 TD ID）。ADR-002..009 落盘。TD-DOC-001..003 结清。

### 阶段 3 · 门禁审计与自动化质量校验  （前置：阶段 2 通过）
- **子任务**：**非 Tauri，跳过 §3.3 三问**（docs/CI.md 记"不适用"，不生成打包发布流水线）。盘点现有门禁 → 新增 `ci.yml`（PR + 全分支触发，lint+type-check+build+test+coverage）→ deploy.yml 改 needs:ci → pre-commit hook（biome check on staged + commit-msg Conventional Commits）→ 架构结构测试（校验分层依赖方向，§4.1）→ 自定义 linter（文件大小上限/命名/品味不变量 T1–T10，§4.2）→ 文档门禁 → 覆盖率门禁（整体+关键模块下限）→ 豁免机制（显式+原因+到期）→ 锁file 治理（§6 D1 决策后定 npm/pnpm 权威）→ `npm audit`/`pnpm audit`（核实 TD-SEC-004 js-yaml 来源）→ server.mjs 安全响应头（TD-SEC-007）→ ErrorBoundary 生产脱敏日志（TD-SEC-012）→ biome noExplicitAny 提 error（TD-GATE-004，存量 any 清理后）→ vitest.config.ts + setup + coverage（TD-TEST-001）。
- **产出物**：ci.yml、hook 配置、结构测试、自定义 linter、覆盖率配置、更新后的 docs/CI.md + 门禁清单文档。
- **验收**：干净环境"安装→构建→测试"一次成功；故意越层依赖门禁失败（实测）；故意超长文件/非结构日志门禁失败（实测）；死链/缺 index 条目文档门禁失败（实测）；每门禁失败信息含可执行修复指引；本地一条命令复现；豁免项有原因+到期。覆盖 TD-GATE-001..004, TD-SEC-004,007,008,012, TD-TEST-001, TD-ARCH-010。

> **✅ 阶段 3 已完成（2026-10-02）**。产出：删除 `pnpm-lock.yaml`（D1=npm）；`vitest.config.ts`+`src/test/setup.ts`（jsdom+v8 coverage，阈值 floor lines26/stmt25/branch19/func18）；`scripts/structure-lint.mjs`（分层依赖方向，5 豁免 TD-ARCH-001/002/004/005/009）；`scripts/custom-lint.mjs`（文件大小≤500+console.log，15 豁免）；`scripts/any-ratchet.mjs`（noExplicitAny 基线 2）；`.github/workflows/ci.yml`（PR+全分支，lint+typecheck+docs+结构+custom+any+build+test+coverage）；`deploy.yml` 改 `needs:ci`（复用 ci.yml）；`.husky/` pre-commit+commit-msg（Conventional Commits）；`server.mjs` 安全响应头（TD-SEC-007）；`docs/design-docs/gate-exemptions.md`（豁免/ratchet 机制+audit）。验收：lint:all+typecheck+build+test(325)+coverage 全绿；注入越层/超长/死链三缺陷门禁均失败且修复指引可执行；`npm audit --registry=npmjs.org` 无 high/critical（2 low dompurify via monaco→TD-SEC-013）；js-yaml integrity 匹配官方（TD-SEC-004 已核实）；`src/` 仅新增 test infra，零业务逻辑变更。TD-SEC-012 延至阶段 4 批次 I（属 src/ 行为变更）。

### 阶段 4 · 问题修复与重构落地  （前置：阶段 3 通过，护栏就位）
- **子任务**：按 §4 批次 A→J 顺序推进，每批一域、小粒度提交。拆臃肿模块→落实单一职责→降复杂度→抽公共逻辑→修清单缺陷（P0 优先=TD-SEC-003）→同步更新文档/QUALITY_SCORE/计划进度日志→更新 tracker（结清移除/新发现登记）。**变更行为项（批次 I）每条单独提交，不得与重构混提（C4）。**
- **产出物**：每批一组小提交 + 同步文档 + 更新 tracker + 计划进度日志。
- **验收**：每批后门禁全绿+测试全过；重构行为守恒（对拍/测试证明改动前后同输入同输出）；行为变更/bug 修复在清单显式标注且单独提交；重复度量下降（前后数值）；复杂度指标下降（前后数值）；热点文件数下降；进度日志与 commit 可逐条对应。覆盖 TD-ARCH/CPLX/DUP/SEC/PERF 全部条目。

> **🟡 阶段 4 进行中（截至 2026-10-03）**。已完成批次：A（TD-ARCH-001/004/005/009）、B（TD-ARCH-002/007/008，structure-lint 豁免清零）、C（TD-ARCH-003/006）、D（TD-ARCH-011/013、TD-DUP-001/002，详情页字段经 registryToEditFields 单源派生，commit 17c722c）、E（TD-CPLX-008、TD-DUP-003/005/006）、F（TD-CPLX-001/002/003/005/006/007）、G（TD-CPLX-004/009/010）、H（TD-DUP-004）、I（TD-SEC-001/002/003/005/006/009/011）、J（TD-PERF-001..010/012、TD-SEC-013）。God 组件收缩：ConfigCenterPage 886→197、TagExplorerPage 800→232、AppShell 537→160、GlobalConfigEditor 430→109、RulesPage 818→524。**剩余**：阶段 4 收尾项已全部落定（TD-SEC-012 commit ef3d920、TD-GATE-004 commit b2772e9、TD-ARCH-010 commit 23fc082）。每批后门禁全绿、测试全过（339 passed）、覆盖率过 floor。

### 阶段 5 · 测试补全与门禁接入  （前置：阶段 4 通过）
- **子任务**：补关键路径端到端测试 → 补边界/异常（空值/超限/并发/超时/部分失败/幂等）→ 逐一补齐 tracker 中"无测试"模块（TD-TEST-002..016）→ 建测试分层（单元/集成/e2e + 时长上限）→ 接入覆盖率门禁（整体+关键模块下限）→ 接入结构测试 → 消除 flaky（修根因/登记）→ 测试可维护性规则（用例名描述行为/无魔法数字/不依赖执行序）→ 测试纳入同一套门禁。
- **产出物**：测试代码 + fixture + 覆盖率报告 + 结构测试 + 测试策略文档。
- **验收**：覆盖率达标且关键模块单独达标（报告）；新增测试故意破坏实现时失败（抽样 ≥3）；所有 P0 修复有回归测试（TD-SEC-003）；全量测试约定时长内跑完 + 连续 3 次无失败；覆盖率/结构测试接入门禁（注入缺陷可拦截，实测）；测试入版本管理。**阶段 5 通过即达成 DoD（§11.1），随后执行 §14 收官拆解。**

## 6. 待人工决策清单

> 以下均为"无法从仓库内推断的产品语义/部署意图"（契约 C7）。**已于 2026-10-02 逐条确认，答案如下。** 阶段 3/4 按此执行。

| 编号 | 问题 | 为什么需要人判断 | 影响范围 | 关联问题 | **已确认答案** |
|---|---|---|---|---|---|
| D1 | 锁file 权威选择：npm（package-lock.json）还是 pnpm（pnpm-lock.yaml）？ | 两份并存，CI 用 npm；产品/团队工具链偏好不可从代码推断 | 阶段 3 CI + 本地命令统一 | TD-GATE-002 | **npm**：保留 package-lock.json，删除 pnpm-lock.yaml，CI/本地统一 npm |
| D2 | 实例导出是否应含 API 密钥？（P0 修复方向） | 导出含密钥可能是"备份/迁移连接"的有意设计；脱敏会改变导出内容 | 批次 I · 备份/迁移 UX | TD-SEC-003 | **默认脱敏 + 含密钥 opt-in 并警告**：默认导出不含 secret；显式勾选"含密钥"时弹警告后导出 |
| D3 | 是否保留"连接任意用户输入后端"的多实例能力？还是加后端白名单 + 收紧 CSP？ | 仪表盘是多实例监控工具，用户自加 CoreC 后端；收紧会限制该 UX | 批次 I · 多实例连接 + CSP | TD-SEC-001,002 | **保留任意后端，经同源代理 + CSP 收紧**：server.mjs 按实例代理，浏览器只发同源请求；CSP connect-src 改 `'self' ws: wss:` |
| D4 | 公网部署（GitHub Pages 自定义域）是否需要仪表盘级鉴权？还是仅限内网/气隙？ | 当前公网无登录；是否公网托管为部署决策 | 批次 I · 部署模式 | TD-SEC-010 | **维持现状（公网无鉴权）**：接受风险，TD-SEC-010 标记已豁免；仅靠逐实例 Bearer 密钥保护 |
| D5 | 模板弱默认密钥 "change-me-please" 如何处理？自动生成随机密钥 vs apply 前强制替换？ | 影响模板易用性 vs 安全默认 | 批次 I · 模板 UX | TD-SEC-006 | **加载模板时生成随机密钥**：每次加载模板生成随机 secret，消除已知弱值 |
| D6 | WebSocket 鉴权 token 传输方式：维持 URL 查询串 vs 改用短时 ticket 交换/子协议头？ | ticket 方案更安全但需 CoreC 后端配合，复杂度上升 | 批次 I · WS 鉴权 | TD-SEC-005 | **维持 URL 查询串 + 确保 CoreC 不记 query**：前端单边落地；需确认 CoreC 访问日志不记录 query string |
| D7 | Monaco 编辑器：自托管 min/vs 资产（气隙可用）vs 维持 CDN 拉取？ | 自托管增包体积但解气隙/CSP 依赖；部署环境决策 | 批次 J · Config Center 可用性 | TD-PERF-010 | **自托管 min/vs 资产**：monaco-editor min/vs 进本地静态，loader.config 指本地路径；气隙/内网可用 |

## 7. 进度与决策日志

| 日期 | 阶段 | 动作 | 关联 commit | 决策与理由 |
|---|---|---|---|---|
| 2026-10-02 | 1 | 切 `harnessing` 分支；置 docs/HARNESS-RULES.md 规则母本 | （待提交） | C5 一切进仓库；§7.1 改造仅落 harnessing |
| 2026-10-02 | 1 | 框架判定=其他（Vite/React SPA，非 Tauri），写 docs/CI.md | （待提交） | §3.2/§3.4；跳过三问，不生成打包流水线 |
| 2026-10-02 | 1 | 5 域并行审计（架构/复杂度/测试/安全/性能），原始报告落 .scratch/ | （待提交） | 全量扫描 §5.1 子任务 3–10 |
| 2026-10-02 | 1 | 汇总 76 条入 tech-debt-tracker.md，分级 P0×1/P1×24/P2×51，定批次 A–J | （待提交） | 子任务 11–12；附录 B 字段 |
| 2026-10-02 | 1 | 写本计划；`git diff --stat` 自证零业务代码改动 | （待提交） | C1 计划先行；阶段 1 验收末项 |
| 2026-10-02 | 1 | **提交计划等待人工确认** | faf10f6/c6881f5/53ce307 | C2 串行；确认前不启动阶段 2 |
| 2026-10-02 | 1 | 人工确认 7 项决策 D1–D7，答案落盘 §6 | 0c11db2 | C7；D4=维持现状→TD-SEC-010 已豁免；其余 6 项驱动批次 I/J 修复方向 |
| 2026-10-02 | 2 | 重写 AGENTS.md（67 行）+ ARCHITECTURE.md + docs/ 树 + core-beliefs.md + QUALITY_SCORE.md + 规范文档 + 工程化说明 | （待提交） | 附录 E/F；§2.1 必需项；ADR-002..009 落盘 |
| 2026-10-02 | 2 | 建 scripts/docs-lint.mjs 文档防腐 linter；`node scripts/docs-lint.mjs` 通过 | （待提交） | TD-DOC-001..003 结清；阶段 2 验收全过 |
| 2026-10-02 | 3 | 阶段 3 门禁全量落地（ci.yml/husky/vitest.config/4 linters/server headers） | 00e66a2 | 阶段 3 验收全过；TD-GATE-001/002/003、TD-TEST-001、TD-SEC-007/013 结清 |
| 2026-10-03 | 4 | 批次 A 基础层治理（types→lib 反向、cn 抽离、lib 纯化、UI 原语不引 hooks） | ae367b2..92a287d | TD-ARCH-001/004/005/009 结清；structure-lint 去 4 豁免 |
| 2026-10-03 | 4 | 批次 B api/contexts 解耦（connectionStore 断环、useCoreCWebSocket、ApiError re-export） | 75663d1..9c03a3b | TD-ARCH-002/007/008 结清；structure-lint 豁免清零 |
| 2026-10-03 | 4 | 批次 C stores 治理（configStore 切 slice、CoreCInstance 移 types） | 852544b..56aa6cd | TD-ARCH-003/006 结清 |
| 2026-10-03 | 4 | 批次 D 基礎（settingsRegistry 拆文件、useEntityEditConfig、EntityEditConfigCard 降 props、adapter+parity） | 9d34b24..6fd162a | TD-ARCH-013/012/DUP-002 结清；ARCH-011/DUP-001 基礎完成，全量迁移待收尾 |
| 2026-10-03 | 4 | 批次 E 列表页去重（getActionBadge 查表、useApplyConfig/useEntityListPage/ConnectionSummary） | a294740..4b61689 | TD-CPLX-008、TD-DUP-003/005/006 结清 |
| 2026-10-03 | 4 | 批次 F 大组件拆分（WriteControl/Rule/AppShell/GlobalConfig/ConfigCenter/TagExplorer） | c6ca423..1c360ce | TD-CPLX-001/002/003/005/006/007 结清 |
| 2026-10-03 | 4 | 批次 G 复杂函数/effect 拆分（validateConfig 6 纯校验器、trendTag 入 hook、auto-load 响应式） | 751f9a5..e18a5b9 | TD-CPLX-004/009/010 结清 |
| 2026-10-03 | 4 | 批次 H wizard 去重（useResetOnOpen） | 815457b | TD-DUP-004 结清 |
| 2026-10-03 | 4 | 批次 I 安全修复（导出脱敏、同源代理+CSP、随机密钥、YAML 安全 schema、导入 zod 校验、WS token 文档） | a270536..6fdeff4 | TD-SEC-001/002/003/005/006/009/011 结清；每条单独提交（C4） |
| 2026-10-03 | 4 | 批次 J 性能/可靠性（虚拟化/封顶、pprof 超时、memo、Monaco 自托管、Set 封顶） | 2bb156a..723dc9d | TD-PERF-001..010/012、TD-SEC-013 结清 |
| 2026-10-03 | 4 | 文档同步：修正台账速查表 5 行过时状态 + 补完成度汇总 + 更新本计划 §0/§7 | （本次提交） | 防腐；台账与代码现状对齐 |
| 2026-10-03 | 4 | 批次 D 全量迁移：Driver/TransportDetailPage 经 registryToEditFields 单源派生，删本地 *_FIELDS；structure-lint 增单源规则；adapter parity 测试；ADR-010 落盘 | 17c722c | TD-ARCH-011/TD-DUP-001 结清；5 类分歧按 registry 落地 + tags-file 顶层 bug 修复（行为变更，ADR-010）；339 tests |
| 2026-10-03 | 5 | 阶段 5 测试补全：15 个 TD-TEST 条目全覆盖（13 新文件 + 3 扩展），592 tests 全绿 | （本次提交） | TD-TEST-002..016 全部结清；typecheck/lint:all/docs:lint/build 全通过 |

> **下一步**：执行 §14 收官拆解——归档 HARNESS-RULES.md 至 `docs/exec-plans/completed/`，长效契约迁移至常驻文档，自检后单独提交。
>
> **决策已确认（2026-10-02）**：D1–D7 答案见 §6，已落 ADR-002..008。
