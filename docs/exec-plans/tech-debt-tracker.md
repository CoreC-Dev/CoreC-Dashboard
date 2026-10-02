# 技术债台账（tech-debt-tracker）

> CoreC-Dashboard · Harness 工程化改造 · Phase 1 全量扫描产出
> 依据《存量项目 Harness 工程化规则》§5 阶段 1 + 附录 B。
> 每条问题含可机械检查的证据（文件:行 / 度量）。本台账随改造进度持续更新（结清的移除或标"已完成"，新发现的登记）。

## 字段定义（附录 B）

| 字段 | 说明 |
|---|---|
| ID | `TD-<域>-<序号>`，域 = ARCH/CPLX/DUP/TEST/SEC/GATE/DOC/PERF |
| 位置 | 文件:行 |
| 类别 | 架构 / 复杂度 / 重复 / 文档 / 测试 / 安全 / 性能 / 可靠性 / 依赖 / 门禁 |
| 严重度 | P0 / P1 / P2（定义见下） |
| 证据 | 度量数据 / 代码片段 / 文件:行 |
| 修复建议 | 可执行动作 |
| 业务行为影响 | 无 / 修复bug / 变更行为 |
| 关联批次 | 改造批次号或阶段（阶段2文档 / 阶段3门禁 / 阶段4重构 / 阶段5测试） |
| 验收方式 | 如何证明已修复 |
| 状态 | 待处理 / 处理中 / 已完成 / 已豁免（含理由） |

### 优先级定义（附录 B）

| 级别 | 判定标准 | 处理时限 |
|---|---|---|
| **P0** | 影响正确性/安全性/可用性；或阻塞后续所有改造 | 当前批次内必须解决 |
| **P1** | 显著抬升维护成本或缺陷概率；不立即阻断 | 计划内排期 |
| **P2** | 体验与整洁度问题，可延后 | 有空再做，登记不丢 |

## 汇总

- 已登记：**76 条**（5 域并行审计全部完成；其中 **1 已豁免**：TD-SEC-010，用户决策维持公网无鉴权现状）
- 严重度分布：**P0 ×1** ｜ **P1 ×24** ｜ **P2 ×51**
- 类别分布：架构 13 ｜ 复杂度 10 ｜ 重复 6 ｜ 测试 16 ｜ 安全 12 ｜ 门禁 4 ｜ 文档 3 ｜ 性能 10 ｜ 可靠性 2
- 业务行为影响：**变更行为 ×10**（均需人工决策后单独提交，见 `harness-migration.md` §6）｜ 修复bug ×0 ｜ 无 ×66
- **P0**：TD-SEC-003（实例导出明文泄露 API 密钥）

> 说明：多条安全发现标记"变更行为"——修复会改变产品行为（如限制可连接的后端、导出不再含密钥），属产品决策，不可自行猜测后改造（契约 C7）。已集中列入计划 §6「待人工决策清单」，Phase 3/4 落地前逐条确认。

## 速查表

| ID | 严重度 | 类别 | 标题（简） | 批次 | 状态 |
|---|---|---|---|---|---|
| TD-ARCH-001 | P1 | 架构 | types 层反向依赖 lib | 批次A | 待处理 |
| TD-ARCH-002 | P1 | 架构 | api ↔ contexts 层级环 | 批次B | 待处理 |
| TD-ARCH-003 | P1 | 架构 | configStore God Object（29 方法） | 批次C | 待处理 |
| TD-ARCH-004 | P1 | 架构 | lib/utils 耦合 16 个 UI 原语到 i18n | 批次A | 待处理 |
| TD-ARCH-005 | P2 | 架构 | UI 原语反向依赖 hooks | 批次A | 待处理 |
| TD-ARCH-006 | P2 | 架构 | CoreCInstance 类型定义在 store | 批次C | 待处理 |
| TD-ARCH-007 | P2 | 架构 | 无 WebSocket hook 抽象 | 批次B | 待处理 |
| TD-ARCH-008 | P2 | 架构 | feature 越过 hooks 直引 api/client | 批次B | 待处理 |
| TD-ARCH-009 | P2 | 架构 | lib 依赖 i18n 单例 | 批次A | 待处理 |
| TD-ARCH-010 | P2 | 架构 | @/ 别名与相对导入混用 | 阶段3 | 待处理 |
| TD-ARCH-011 | P1 | 架构 | 字段元数据三处真相源 | 批次D | 待处理 |
| TD-ARCH-012 | P2 | 架构 | EntityEditConfigCard 17 props 透传 | 批次D | 待处理 |
| TD-ARCH-013 | P2 | 架构 | settingsRegistry 878 行数据 God Object | 批次D | 待处理 |
| TD-CPLX-001 | P1 | 复杂度 | ConfigCenterPage God 组件（~886 行） | 批次F | 待处理 |
| TD-CPLX-002 | P1 | 复杂度 | TagExplorerPage God 组件（~800 行） | 批次F | 待处理 |
| TD-CPLX-003 | P1 | 复杂度 | RulesPage God 组件（~818 行） | 批次F | 待处理 |
| TD-CPLX-004 | P2 | 复杂度 | configSchema.validateConfig 165 行高圈复杂度 | 批次G | 待处理 |
| TD-CPLX-005 | P2 | 复杂度 | AppShell 混杂 7 类关注点 | 批次F | 待处理 |
| TD-CPLX-006 | P2 | 复杂度 | GlobalConfigEditor 手写渲染非数据驱动 | 批次F | 待处理 |
| TD-CPLX-007 | P2 | 复杂度 | WriteControlPage 混杂 4 类关注点 | 批次F | 待处理 |
| TD-CPLX-008 | P2 | 复杂度 | getActionBadge 5 分支 switch | 批次E | 待处理 |
| TD-CPLX-009 | P2 | 复杂度 | TagExplorerPage WS effect 隐式 ref 状态 | 批次G | 待处理 |
| TD-CPLX-010 | P2 | 复杂度 | ConfigCenterPage auto-load ref guard + getState | 批次G | 待处理 |
| TD-DUP-001 | P1 | 重复 | Driver/TransportDetailPage 字段数组并行重复 | 批次D | 待处理 |
| TD-DUP-002 | P1 | 重复 | Driver/TransportEditConfigSection 逻辑重复 | 批次D | 待处理 |
| TD-DUP-003 | P1 | 重复 | apply-confirmation+mutation 模式重复 4× | 批次E | 待处理 |
| TD-DUP-004 | P2 | 重复 | reset-on-open wizard 模式重复 3× | 批次H | 待处理 |
| TD-DUP-005 | P2 | 重复 | handleCreate/Edit/Delete 重复 3× | 批次E | 待处理 |
| TD-DUP-006 | P2 | 重复 | 内联 connection-summary 渲染重复 4× | 批次E | 待处理 |
| TD-TEST-001 | P1 | 测试 | 无 vitest 配置，覆盖率从不测量 | 阶段3 | 待处理 |
| TD-TEST-002 | P1 | 测试 | instanceStore 完全无测试 | 阶段5 | 待处理 |
| TD-TEST-003 | P1 | 测试 | api/client.ts 无测试 | 阶段5 | 待处理 |
| TD-TEST-004 | P1 | 测试 | api/websocket.ts 无测试 | 阶段5 | 待处理 |
| TD-TEST-005 | P1 | 测试 | ConnectionContext 无测试 | 阶段5 | 待处理 |
| TD-TEST-006 | P1 | 测试 | useHomepageProbe 无测试 | 阶段5 | 待处理 |
| TD-TEST-007 | P1 | 测试 | InstanceDialog 表单校验无测试 | 阶段5 | 待处理 |
| TD-TEST-008 | P1 | 测试 | api/endpoints 16 个端点仅测 2 个 | 阶段5 | 待处理 |
| TD-TEST-009 | P2 | 测试 | api/hooks 全部无测试 | 阶段5 | 待处理 |
| TD-TEST-010 | P1 | 测试 | writeValidation 无测试 | 阶段5 | 待处理 |
| TD-TEST-011 | P2 | 测试 | configYaml 无测试 | 阶段5 | 待处理 |
| TD-TEST-012 | P2 | 测试 | connectionInfo 无测试 | 阶段5 | 待处理 |
| TD-TEST-013 | P2 | 测试 | ruleMatchEvaluator 无测试 | 阶段5 | 待处理 |
| TD-TEST-014 | P2 | 测试 | admin 冒烟测试不断言行为 | 阶段5 | 待处理 |
| TD-TEST-015 | P2 | 测试 | wizard 测试只覆盖纯函数 | 阶段5 | 待处理 |
| TD-TEST-016 | P2 | 测试 | settingsRegistry 测试仅结构级 | 阶段5 | 待处理 |
| TD-SEC-001 | P1 | 安全 | CSP connect-src * | 批次I | 待处理 |
| TD-SEC-002 | P1 | 安全 | Bearer 密钥发往任意后端（浏览器 SSRF） | 批次I | 待处理 |
| TD-SEC-003 | P0 | 安全 | 实例导出明文泄露 API 密钥 | 批次I | 待处理 |
| TD-SEC-004 | P1 | 安全 | js-yaml 5.4.2 来自第三方镜像（供应链） | 阶段3 | 待处理 |
| TD-SEC-005 | P2 | 安全 | WS token 走 URL 查询串 | 批次I | 待处理 |
| TD-SEC-006 | P2 | 安全 | 模板弱默认密钥 change-me-please | 批次I | 待处理 |
| TD-SEC-007 | P2 | 安全 | server.mjs 无安全响应头 | 阶段3 | 待处理 |
| TD-SEC-008 | P2 | 安全 | 依赖均为 bleeding-edge 大版本 | 阶段3 | 待处理 |
| TD-SEC-009 | P2 | 安全 | js-yaml load() 未指定安全 schema | 批次I | 待处理 |
| TD-SEC-010 | P2 | 安全 | 公网部署无仪表盘级鉴权 | 批次I | 已豁免 |
| TD-SEC-011 | P2 | 安全 | importInstances 未校验 JSON 即 spread | 批次I | 待处理 |
| TD-SEC-012 | P2 | 安全 | ErrorBoundary 日志输出完整 ApiError.body | 阶段3 | 待处理 |
| TD-GATE-001 | P1 | 门禁 | 质量门禁仅在 push main 部署时跑 | 阶段3 | 待处理 |
| TD-GATE-002 | P1 | 门禁 | 双 lockfile（npm + pnpm），CI 用 npm | 阶段3 | 待处理 |
| TD-GATE-003 | P2 | 门禁 | 无 pre-commit / pre-push hook | 阶段3 | 待处理 |
| TD-GATE-004 | P2 | 门禁 | biome noExplicitAny 为 warn 非 error | 阶段3 | 待处理 |
| TD-DOC-001 | P1 | 文档 | 无 README.md | 阶段2 | 待处理 |
| TD-DOC-002 | P1 | 文档 | 无 AGENTS.md / ARCHITECTURE.md / docs 结构 | 阶段2 | 待处理 |
| TD-DOC-003 | P2 | 文档 | 无 QUALITY_SCORE.md / exec-plans 结构 | 阶段2 | 待处理 |
| TD-PERF-001 | P1 | 性能 | "View Tags" 弹窗未虚拟化标签列表 | 批次J | 待处理 |
| TD-PERF-002 | P1 | 可靠性 | pprof 下载裸 fetch 无超时 | 批次J | 待处理 |
| TD-PERF-003 | P2 | 性能 | 表单模式 zod 校验逐键全量运行 | 批次J | 待处理 |
| TD-PERF-004 | P2 | 性能 | AlertsPage 死信列表未虚拟化/未封顶 | 批次J | 待处理 |
| TD-PERF-005 | P2 | 性能 | WriteControlPage 死信未 memo + 未虚拟化 | 批次J | 待处理 |
| TD-PERF-006 | P2 | 性能 | DiagnosticsPage .filter 每渲染重算 | 批次J | 待处理 |
| TD-PERF-007 | P2 | 性能 | TopologyPage 未 memo + O(n²) 连接摘要 | 批次J | 待处理 |
| TD-PERF-008 | P2 | 性能 | DriversPage getDriverConnectionSummary O(n²) | 批次J | 待处理 |
| TD-PERF-009 | P2 | 性能 | AppShell 订阅整个 instances 数组 | 批次J | 待处理 |
| TD-PERF-010 | P2 | 可靠性 | Monaco 运行时从 CDN 拉取（离线/CSP） | 批次J | 待处理 |
| TD-PERF-011 | P2 | 性能 | 首页探测 5N 请求/15s 无并发上限 | 批次J | 待处理 |
| TD-PERF-012 | P2 | 性能 | clearedDlqKeys Set 在 sessionStorage 无界增长 | 批次J | 待处理 |

---

## 详细条目

### 架构（ARCH）

**TD-ARCH-001** ｜ types 层反向依赖 lib ｜ P1
- 位置：`src/types/models.ts:1`
- 证据：`import type { DataTypeString } from '@/lib/constants'`。链路 types/models → lib/constants:1（`import type { DataType } from '@/types/config'`）→ types/config，形成 types↔lib 概念环。
- 修复建议：将 `DataTypeString`（必要时含 `DataType`）移入 `types/config.ts` 或 `types/models.ts`，使 types 自洽；`lib/constants.ts` 改为从 types 导入（正向）。
- 业务行为影响：无（type-only，运行时擦除） ｜ 批次A ｜ 验收：结构测试断言 `types/**` 不导入 `@/lib/**` ｜ 状态：待处理

**TD-ARCH-002** ｜ api 与 contexts 层互相依赖（层级环） ｜ P1
- 位置：`src/api/hooks/index.ts:2` ↔ `src/contexts/ConnectionContext.tsx:4-5`
- 证据：`api/hooks` 导入 `@/contexts/ConnectionContext`（api→contexts）；`ConnectionContext` 导入 `@/api/activeConnection` 与 `@/api/endpoints`（contexts→api）。无运行时模块环，但架构依赖双向。
- 修复建议：将 `api/hooks` 所需的连接状态（`isConnected`）下沉到更低层（如 `stores/connectionStore` 或无 context 的纯 hook），使 `api/hooks` 只向下依赖；或由调用方显式传入连接状态。
- 业务行为影响：无 ｜ 批次B ｜ 验收：结构测试断言 api 与 contexts 无双向依赖 ｜ 状态：待处理

**TD-ARCH-003** ｜ configStore God Object（29 方法 / 14 消费者） ｜ P1
- 位置：`src/stores/configStore.ts:84-148`（接口）、`:175`（create）
- 证据：425 行；`ConfigStoreState` 声明 29 方法，跨 6 类关注点（加载、5 类实体 CRUD 共 10 方法、区段更新、保存/回退、6 个派生 getter、5 个唯一性检查）。被 14 个文件导入。
- 修复建议：按关注点切分为 `configCrudSlice`（实体 upsert/remove）、`configSectionSlice`（global/node 字段更新），`configStore` 仅保留 working/saved/dirty 状态壳。消费者已选窄切片，拆分低风险。
- 业务行为影响：无 ｜ 批次C ｜ 验收：拆分后行为守恒（configStore 现有测试全过）+ 单文件行数下降 ｜ 状态：待处理

**TD-ARCH-004** ｜ lib/utils（34 导入者）将 16 个 UI 原语耦合到 i18n ｜ P1
- 位置：`src/lib/utils.ts:3`（i18n 导入）、`:5`（cn）、`:80`（formatRelativeTime 用 i18n）
- 证据：`import i18n from '@/i18n'` 在模块顶层。`cn`（纯 className 合并）被 16/17 个 `components/ui/*` 原语导入；模块级 i18n 导入使每个原语传递拉入 i18next 单例。仅 `formatRelativeTime`（:80-89）用到 `i18n.t`。共 34 个导入者。
- 修复建议：将 `cn` 抽到独立 `lib/cn.ts`（零 src 导入）；i18n 相关格式化器留在 `lib/utils.ts` 或 `lib/formatters.ts`。解耦 16 个展示原语与 i18n 运行时。
- 业务行为影响：无 ｜ 批次A ｜ 验收：结构测试断言 `components/ui/**` 不传递依赖 `@/i18n` ｜ 状态：待处理

**TD-ARCH-005** ｜ UI 原语反向依赖 hooks 层 ｜ P2
- 位置：`src/components/ui/count-up-number.tsx:1`
- 证据：`import { useCountUp } from '@/hooks/useCountUp'`——`components/ui` 原语依赖 hooks 层。其余 16 个 ui 原语无此问题。
- 修复建议：将 count-up 动画逻辑内联进组件，或将 `count-up-number.tsx` 移出 `components/ui` 到 `components/`。
- 业务行为影响：无 ｜ 批次A ｜ 验收：结构测试断言 `components/ui/**` 不导入 `@/hooks/**` ｜ 状态：待处理

**TD-ARCH-006** ｜ 领域类型 CoreCInstance 定义在 store 而非 types/ ｜ P2
- 位置：`src/stores/instanceStore.ts:8`；导入者 5 个（ConnectionContext:7、InstanceCard:35、InstanceDialog:27、InstancePanel:23、useHomepageProbe:3）
- 证据：`export interface CoreCInstance` 位于 store 模块；5 文件经 `@/stores/instanceStore` 导入该类型，把类型消费者耦合到 store 模块（及其 `lib/storage` 依赖）。
- 修复建议：将 `CoreCInstance` 移至 `types/models.ts`（或 `types/instance.ts`）；`instanceStore.ts` 从 types 导入并可选 re-export。
- 业务行为影响：无（消费者为 type-only） ｜ 批次C ｜ 验收：grep 确认类型定义在 types/ ｜ 状态：待处理

**TD-ARCH-007** ｜ 无 WebSocket hook 抽象，5 个消费者直用 api/websocket ｜ P2
- 位置：`src/api/websocket.ts`；消费者：`components/admin/EventLogTerminal.tsx:8`、`components/charts/MemoryChart.tsx:12`、`components/charts/TrafficChart.tsx:12`、`features/monitor/AlertsPage.tsx:20`、`features/monitor/TagExplorerPage.tsx:25`
- 证据：5 处直 `import { CoreCWebSocket } from '@/api/websocket'`，内联管理连接生命周期。REST 经 `api/hooks` 统一（12 消费者），WS 无对应封装，重复生命周期样板。
- 修复建议：引入 `useCoreCWebSocket` hook（放 `api/hooks` 或 `hooks/`）封装 connect/onMessage/close-on-unmount，5 消费者改用。
- 业务行为影响：无 ｜ 批次B ｜ 验收：5 消费者不再直引 CoreCWebSocket ｜ 状态：待处理

**TD-ARCH-008** ｜ feature 越过 hooks 层直引 api/client ｜ P2
- 位置：`src/features/admin/WriteControlPage.tsx:17`（另有 `features/admin/DiagnosticsPage.tsx:5` 直引 `@/api/activeConnection`）
- 证据：`import { ApiError } from '@/api/client'`——feature 越过 `api/hooks` 直达原始 HTTP client 取错误类。
- 修复建议：从 `api/hooks`（或 `api/endpoints`）re-export `ApiError`，`api/client` 作为内部传输细节。
- 业务行为影响：无 ｜ 批次B ｜ 验收：结构测试断言 `features/**` 不导入 `@/api/client` ｜ 状态：待处理

**TD-ARCH-009** ｜ lib 依赖 i18n 运行时单例 ｜ P2
- 位置：`src/lib/utils.ts:3`、`src/lib/writeValidation.ts:1`
- 证据：两处 `import i18n from '@/i18n'`。使 lib 函数非纯（依赖 i18n 单例状态/locale），增加单测难度。
- 修复建议：i18n 作为显式依赖传入（向格式化器传 `t`），或隔离到 `lib/i18nFormatters.ts`；至少在架构文档将 `i18n` 标为 lib 的 peer 层。
- 业务行为影响：无 ｜ 批次A ｜ 验收：lib 纯模块无 `@/i18n` 导入 ｜ 状态：待处理

**TD-ARCH-010** ｜ @/ 别名与相对导入在同一文件混用 ｜ P2
- 位置：`src/api/endpoints/index.ts:14`（`from '../client'` + `from '@/types/api'` :12）、`src/api/hooks/index.ts:4`、`src/features/home/InstancePanel.tsx:26-28`
- 证据：3 文件混用别名与相对。`features/admin` 用别名引用兄弟（7 行），`features/home` 用相对（3 行）。无 Biome 规则约束。
- 修复建议：加 Biome 规则统一跨文件导入用 `@/` 别名（或同目录用相对），全仓应用。
- 业务行为影响：无 ｜ 阶段3 ｜ 验收：lint 规则上线且全仓通过 ｜ 状态：待处理

**TD-ARCH-011** ｜ 字段元数据三处真相源（registry + 详情数组 + schema） ｜ P1
- 位置：`src/lib/settingsRegistry.ts:141-852`、`src/features/admin/DriverDetailPage.tsx:49-288`、`src/lib/configSchema.ts:90-300`
- 证据：同一 per-driver/per-transport 字段集在三处描述：(1) `DRIVER_SETTINGS_REGISTRY` 供 wizard 表单；(2) `MODBUS_TCP_FIELDS` 供详情编辑表单；(3) zod `superRefine` 必填校验。`settingsRegistry.ts:11-13` 头注释明确承认手工镜像。
- 修复建议：以 `settingsRegistry.ts` 为唯一源：详情编辑字段经适配器派生，zod 必填校验由 `required:true` 标志生成。configSchema 仅保留跨实体规则。
- 业务行为影响：无 ｜ 批次D ｜ 验收：结构测试断言字段集单源 + parity 测试 ｜ 状态：待处理

**TD-ARCH-012** ｜ EntityEditConfigCard 17 props 透传，逻辑未同置 ｜ P2
- 位置：`src/components/admin/DetailPageParts.tsx:120-139`
- 证据：`EntityEditConfigCardProps` 17 字段；两调用方各从重复的有状态区段接线全部 17 个。抽象止于展示，有状态行为被复制（见 TD-DUP-002）。
- 修复建议：同置状态+展示：单一 `<EntityEditConfigCard entityName entityKind buildEntry upsert />` 经 `useEntityEditConfig` hook 持有状态。props 降至 ~5。
- 业务行为影响：无 ｜ 批次D ｜ 验收：props 数下降 + 行为守恒 ｜ 状态：待处理

**TD-ARCH-013** ｜ settingsRegistry 878 行数据 God Object，手工三同步风险 ｜ P2
- 位置：`src/lib/settingsRegistry.ts:1-878`
- 证据：单文件内联 `DRIVER_SETTINGS_REGISTRY`（7 驱动类型）+ `TRANSPORT_SETTINGS_REGISTRY`（5+ 传输类型），878 行声明式字段元数据。正确性依赖手工与 `configSchema.ts` 及 Go 服务 `Init()` 同步（头注释 11-13）。无测试断言与 configSchema 一致。
- 修复建议：(a) 加测试：每个 registry 类型的 `required:true` 字段在 configSchema zod 校验中亦必填；(b) 拆分为 driver/transport 两文件；(c) 长期：若服务有 OpenAPI/schema 则生成 registry。
- 业务行为影响：无 ｜ 批次D ｜ 验收：parity 测试存在 + 单文件行数下降 ｜ 状态：待处理

### 复杂度（CPLX）

**TD-CPLX-001** ｜ ConfigCenterPage God 组件（混杂 7+ 关注点） ｜ P1
- 位置：`src/features/admin/ConfigCenterPage.tsx:163-1049`
- 证据：单组件 ~886 行；9 useState（193-213）、3 useEffect。混杂 Monaco 编辑器 IO、loadFromYaml/getWorkingYaml store 桥接（235-260）、FileReader 文件上传、YAML↔表单同步、校验、useConfigHistory 快照、LCS diff、模板选择、apply 确认弹窗。
- 修复建议：拆为 `<ConfigToolbar>`、`<YamlEditorPane>`、`<ConfigFormPane>`、`<ConfigDiffPreview>`、`<ConfigHistoryPanel>` + `useConfigCenterState()` hook。页面退为薄组合根。
- 业务行为影响：无 ｜ 批次F ｜ 验收：单组件 <300 行 + 行为守恒（对拍 YAML 导入导出） ｜ 状态：待处理

**TD-CPLX-002** ｜ TagExplorerPage God 组件（流式+虚拟化+图表+写入） ｜ P1
- 位置：`src/features/monitor/TagExplorerPage.tsx:219-1019`
- 证据：~800 行；14 useState（226-255）、7 useEffect、4 useMemo。管理 WS 订阅 + rAF 批处理（302-359）、REST 种子（276-291）、react-virtual、lightweight-charts 创建/销毁、写入弹窗、趋势抽屉。WS effect（365+）60+ 行、4 refs。
- 修复建议：抽 `useTagStream(selectedDriver)`、`useTrendChart(containerRef, samples, theme)`、`<TagWriteDialog>`、`<TrendDrawer>`。页面 = 组合 + filteredTags memo。
- 业务行为影响：无 ｜ 批次F ｜ 验收：单组件 <300 行 + 流式行为守恒 ｜ 状态：待处理

**TD-CPLX-003** ｜ RulesPage God 组件（15 useState + 内联测试模拟器） ｜ P1
- 位置：`src/features/admin/RulesPage.tsx:129-947`
- 证据：~818 行；15 useState。混杂规则列表渲染、逐行 toggle 变更跟踪（Set）、编辑弹窗（从原始 YAML 预填 transform）、live evaluateMatch 测试模拟器、apply 确认。getActionBadge（306-348）5 分支 switch 返回近似 Badge JSX。
- 修复建议：抽 `<RuleTestSimulator>`、`<RuleEditDialog>`、`useRuleToggle()`；getActionBadge 换 ACTION_BADGE_META 查表。
- 业务行为影响：无 ｜ 批次F ｜ 验收：单组件 <300 行 + 行为守恒 ｜ 状态：待处理

**TD-CPLX-004** ｜ configSchema.validateConfig 165 行高圈复杂度 + 嵌套 DFS ｜ P2
- 位置：`src/lib/configSchema.ts:476-641`
- 证据：~165 行，~12 个顺序 if/for 检查 + 嵌套递归 detectCycle DFS（593-631，visited/inStack 集合）。圈复杂度 ≥ 20。
- 修复建议：拆为命名纯校验器：checkDataSourcePresence、checkNameUniqueness、checkTransportFallbacks、checkRuleTargetRefs、checkSubRuleCycles（detectCycle 独立函数返回环）。validateConfig = 顺序展开各结果 errors。
- 业务行为影响：无 ｜ 批次G ｜ 验收：configSchema 现有测试全过 + 主函数 <60 行 ｜ 状态：待处理

**TD-CPLX-005** ｜ AppShell 混杂 7 类关注点 ｜ P2
- 位置：`src/components/layout/AppShell.tsx:58-595`
- 证据：~537 行。内联 handleThemeChange（87-106）View Transitions API + flushSync。4 useEffect。sidebarContent（211-~440）~230 行内联 JSX。
- 修复建议：抽 `<SidebarNav>`、`<ThemeSelector>`、`<InstanceSelector>`、`<TopProgressBar>`、`useSidebarState()`；nav item 数组移到 navItems.ts。
- 业务行为影响：无 ｜ 批次F ｜ 验收：单组件 <250 行 ｜ 状态：待处理

**TD-CPLX-006** ｜ GlobalConfigEditor 手写渲染非数据驱动 ｜ P2
- 位置：`src/features/admin/GlobalConfigEditor.tsx:122-590`
- 证据：46 处 FieldRow、~20 个字段块（log/api/engine/buffer），各内联 Input/Select/Switch/Checkbox + updateGlobalField('dotted.path')。重复 settingsRegistry.ts 已有的声明式模式（经 RegistryFieldGrid 驱动 driver/transport wizard）。
- 修复建议：定义 GLOBAL_SETTINGS_REGISTRY（同 SettingsField[] 形状），经现有 RegistryFieldGrid/SettingsFieldRenderer 渲染。编辑器 = registry + updateGlobalField 绑定。
- 业务行为影响：无 ｜ 批次F ｜ 验收：行数大幅下降 + 字段渲染数据驱动 ｜ 状态：待处理

**TD-CPLX-007** ｜ WriteControlPage 混杂 4 类关注点 ｜ P2
- 位置：`src/features/admin/WriteControlPage.tsx:84-590`
- 证据：~506 行；14 useState。写入表单、success/error/replayError 消息、pending 确认、两个确认弹窗、clearedDlqKeys Set 持久化到 sessionStorage。extractApiError（63-72）局部 helper 应在 api/client。
- 修复建议：抽 `<WriteForm>`、`<DeadLetterTable>`（含 useClearedDlqKeys() sessionStorage hook），extractApiError 移至 @/api/client。
- 业务行为影响：无 ｜ 批次F ｜ 验收：单组件 <250 行 ｜ 状态：待处理

**TD-CPLX-008** ｜ getActionBadge 5 分支 switch 近似 Badge JSX ｜ P2
- 位置：`src/features/admin/RulesPage.tsx:306-348`
- 证据：5 分支 switch，各返回 `<Badge variant="outline" className="border-X/30 bg-X/10 text-X">{t(label)}</Badge>`，仅颜色 + i18n key 不同。43 行。
- 修复建议：换 `ACTION_BADGE: Record<string, {cls; key}>` 查表 + 单一 Badge。镜像 RuleWizard.tsx:64 已有 ACTION_META。
- 业务行为影响：无 ｜ 批次E ｜ 验收：行数下降 + 行为守恒 ｜ 状态：待处理

**TD-CPLX-009** ｜ TagExplorerPage WS effect 大型多关注 effect + 隐式 ref 状态 ｜ P2
- 位置：`src/features/monitor/TagExplorerPage.tsx:365-440`（effect）+ 302-359（rAF flush）
- 证据：WS useEffect 创建 CoreCWebSocket，message 回调读 trendTagRef.current（隐式 ref 状态 377），暂存 3 refs，调 scheduleFlush。scheduleFlush（319-359）40 行 rAF 处理器，3 条件 flush 分支 + 嵌套 setState。4 refs + 1 deferred + driver 过滤条件。
- 修复建议：将流+批处理封装进 useTagStream(selectedDriver) 返回 { tagMap, flashTick, trendSamples, subscribeTrend, closeTrend }。页面不再触 refs/rAF。
- 业务行为影响：无 ｜ 批次G ｜ 验收：页面无裸 ref/rAF + 行为守恒 ｜ 状态：待处理

**TD-CPLX-010** ｜ ConfigCenterPage auto-load 用 ref guard + store getState()（隐式状态） ｜ P2
- 位置：`src/features/admin/ConfigCenterPage.tsx:213-229` 与 235-246
- 证据：autoLoadedRef（213）effect 内一次性 guard（222-229）。handleImportYamlToForm（235-246）在 loadFromYaml() 后立即读 useConfigStore.getState().error，因"渲染闭包内 configError 已过期"（注释 238-239）——store 变更被命令式读取而非响应式。
- 修复建议：auto-load 改用 useEffect + 正常"已加载"state 标志，或 react-query onSuccess/select。loadFromYaml 同步返回 error 而非 mutate + getState。
- 业务行为影响：无 ｜ 批次G ｜ 验收：无裸 getState 读取 + 行为守恒 ｜ 状态：待处理

### 重复（DUP）

**TD-DUP-001** ｜ DriverDetailPage 与 TransportDetailPage 字段数组并行重复 ｜ P1
- 位置：`src/features/admin/DriverDetailPage.tsx:49-288`、`src/features/admin/TransportDetailPage.tsx:54-260`
- 证据：DriverDetailPage 定义 MODBUS_TCP_FIELDS、MODBUS_TLS_FIELDS、MODBUS_RTU_FIELDS、S7_FIELDS、OPCUA_FIELDS（49-273）+ getDriverFields（275-288）；TransportDetailPage 定义 MQTT_FIELDS、HTTP_FIELDS 等 + getTransportFields（261）。与 settingsRegistry.ts:141+ 的 DRIVER/TRANSPORT_SETTINGS_REGISTRY 平行——同 key 不同 shape。加字段需改两处。
- 修复建议：详情编辑字段从 getDriverFieldRegistry(type)/getTransportFieldRegistry(type) 经 registryToEditFields() 适配器派生。删除本地 *_FIELDS 数组。
- 业务行为影响：无 ｜ 批次D ｜ 验收：本地字段数组删除 + 行为守恒 ｜ 状态：待处理

**TD-DUP-002** ｜ DriverEditConfigSection ≈ TransportEditConfigSection（逻辑未抽，仅 JSX） ｜ P1
- 位置：`src/features/admin/DriverDetailPage.tsx:329-460`、`src/features/admin/TransportDetailPage.tsx:337-460`
- 证据：两者共享 useState(open/values/statusMsg)、useEffect 从 parseConfigYaml(rawYaml) 预填（348-365/356-371）、previewYaml useMemo（368/374）、applyYaml useMemo 经 upsertDriver/upsertTransport 合并（377-390/382-395）、handleGenerateAndReload async。EntityEditConfigCard 仅抽展示 JSX（17 props），有状态逻辑复制。
- 修复建议：抽 useEntityEditConfig({ entityName, entityKind, buildEntry, upsert }) hook 返回 { values, setField, previewYaml, applyYaml, statusMsg, handleReload, isReloading }。两区段退为薄封装。
- 业务行为影响：无 ｜ 批次D ｜ 验收：逻辑单点 + 行为守恒 ｜ 状态：待处理

**TD-DUP-003** ｜ apply-confirmation + updateConfig.mutate 模式重复 4× ｜ P1
- 位置：`DriversPage.tsx:442-469`、`TransportsPage.tsx:425-452`、`RulesPage.tsx:917-944`、`ConfigCenterPage.tsx:867-895`
- 证据：4 处近似相同 ConfigApplyConfirmationDialog。onConfirm 同 ~12 行：`if (validationErrors) return; const yaml = getWorkingYaml(); setApplyError(null); updateConfig.mutate({payload: yaml}, { onSuccess: () => { markSaved(); setApplyDialogOpen(false); [可选 invalidateQueries] }, onError: … })`。仅 RulesPage 加 invalidateQueries(['rules'])。
- 修复建议：抽 useApplyConfig({ getWorkingYaml, getSavedYaml, markSaved, invalidateOnSuccess? }) hook 返回 { open, openDialog, closeDialog, applyError, dialogProps }。页面渲染 `<ConfigApplyConfirmationDialog {...dialogProps} />`。
- 业务行为影响：无 ｜ 批次E ｜ 验收：4 处统一 + 行为守恒 ｜ 状态：待处理

**TD-DUP-004** ｜ reset-on-open wizard 模式重复 3× ｜ P2
- 位置：`DriverWizard.tsx:149-159`、`RuleWizard.tsx:153-165`、`TransportWizard.tsx:110-126`
- 证据：三者同实现 `const [lastOpen, setLastOpen] = useState(open)` + `if (open && !lastOpen) { /* reset draft */ }` + `if (!open && lastOpen) setLastOpen(false)`。6 处匹配。
- 修复建议：抽 useResetOnOpen(open, resetFn) 至 @/hooks。
- 业务行为影响：无 ｜ 批次H ｜ 验收：3 处统一 ｜ 状态：待处理

**TD-DUP-005** ｜ handleCreate/Edit/Delete/confirmDelete 重复 3× ｜ P2
- 位置：`DriversPage.tsx:87-112`、`TransportsPage.tsx:78-103`、`RulesPage.tsx:163-181`
- 证据：同形 CRUD handler；仅实体名与 store selector 不同。
- 修复建议：抽 useEntityListPage({ find, remove, resetToEmpty }) 返回 { handleCreate, handleEdit, handleDelete, confirmDelete, wizardOpen, editing, deleteTarget, … }。
- 业务行为影响：无 ｜ 批次E ｜ 验收：3 处统一 ｜ 状态：待处理

**TD-DUP-006** ｜ 内联 connection-summary 渲染重复 4× ｜ P2
- 位置：`DriversPage.tsx:205 & 327`、`TransportsPage.tsx:190 & 320`
- 证据：两列表页在 .map() 卡片渲染内联调 getDriverConnectionSummary/getTransportConnectionSummary，渲染同 summary.map(f => <Param>) 块各两次（working-config + runtime 卡片）。4× 重复。
- 修复建议：抽 `<ConnectionFields config name kind />` 组件。
- 业务行为影响：无 ｜ 批次E ｜ 验收：4 处统一 ｜ 状态：待处理

### 测试（TEST）

> 详见 `docs/exec-plans/.scratch/audit-tests.md`。以下为台账条目。

**TD-TEST-001** ｜ 无 vitest 配置，覆盖率从不测量，无全局 jsdom setup ｜ P1
- 位置：`vite.config.ts`（无 test 块）；无 `vitest.config.ts`/`vitest.workspace.*`；无 setup 文件
- 证据：`npm test` → `vitest run` 无 `--coverage`。jsdom 仅靠逐文件 `// @vitest-environment jsdom` 注释（4 文件）。`@testing-library/jest-dom` 在 devDeps 但从未 import/配置，`toBeInTheDocument` 等匹配器不可用。覆盖率缺口无法量化。
- 修复建议：加 `vitest.config.ts`（`test:{ environment:'jsdom', setupFiles:['./src/test/setup.ts'], coverage:{ provider:'v8', reporter:['text','html'], include:['src/**/*.{ts,tsx}'], exclude:['**/*.test.*'] } }`）；建 `src/test/setup.ts` import `@testing-library/jest-dom`；加 `test:coverage` 脚本。
- 业务行为影响：无 ｜ 阶段3 ｜ 验收：`npm run test:coverage` 产出报告 ｜ 状态：待处理

**TD-TEST-002** ｜ instanceStore 完全无测试（密钥存储隔离 + 导入导出去重） ｜ P1
- 位置：`src/stores/instanceStore.ts`（全 296 行）
- 证据：stripSecret/persistInstances 将密钥分到 sessionStorage、元数据到 localStorage（117-169，安全敏感）。importInstances（251-290）处理 merge/replace、按 id/name 去重、必填跳过、malformed-JSON→{added:0,skipped:0}。loadInstances（123-141）合并回密钥并容忍损坏存储。均无测试。
- 修复建议：加 instanceStore.test.ts（jsdom）：密钥仅 sessionStorage / 不在 localStorage；add/update/delete/reorder；import merge vs replace；按 id/name 去重；跳过 malformed；非数组 JSON；clearAll；setProbeResult。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：分支覆盖 + 注入缺陷测试失败 ｜ 状态：待处理

**TD-TEST-003** ｜ api/client.ts apiRequest（timeout/abort/401/204/content-type 路由）无测试 ｜ P1
- 位置：`src/api/client.ts:41-108`
- 证据：AbortError+timeoutId→ApiError(408)（102-104）、204→undefined（90-92）、application/json vs text 路由（94-99）、无连接→ApiError(0)（46-48）、尊重调用方 signal 不自动 abort（66-72）。endpoints 测试在更高层 mock fetch，从未断言这些。
- 修复建议：加 client.test.ts mock fetch + setActiveConnection：无连接抛；401→ApiError(401)；204→undefined；json→解析；text→字符串；timeout→ApiError(408)；调用方 signal 被尊重。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：各分支断言 ｜ 状态：待处理

**TD-TEST-004** ｜ api/websocket.ts（限流/退避/重连上限）无测试 ｜ P1
- 位置：`src/api/websocket.ts`（全 187 行）
- 证据：滑动窗口环形缓冲限流（99-112，>500 msg/s 丢弃）、指数退避 ±20% 抖动（164-171）、maxRetries=10 上限→'rejected'（159-162）、升级拒绝检测 1006/1008/1011（133-138）、secret 消失停止重连（151-155）、destroy 置空 handler（174-186）均无测试。
- 修复建议：加 websocket.test.ts（WebSocket mock + fake timers）：>maxMsgPerSec 丢弃；退避 ~1.5× 增长；maxRetries 后 'rejected'；1008 未开→'rejected'；destroy 阻止排队事件。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：fake timers 下各路径断言 ｜ 状态：待处理

**TD-TEST-005** ｜ ConnectionContext 探测生命周期无测试 ｜ P1
- 位置：`src/contexts/ConnectionContext.tsx:116-167`
- 证据：探测 effect 处理 instance-not-found（117-122）、成功（133-140）、AbortError→"Connection timed out"（143-148）、unmount 清理（159-166）、probeNonce 重连触发（169）、实例切换 useConfigStore.reset()（89-91）。冒烟测试整体 mock 掉此 context。
- 修复建议：加 ConnectionContext.test.tsx 渲染 ConnectionProvider + mock getServerInfo：成功→isConnected true；拒绝→错误信息；not-found→"Instance not found"；unmount→probing 清空；reconnect() 再探测。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：各路径断言 ｜ 状态：待处理

**TD-TEST-006** ｜ useHomepageProbe（并行多实例探测 + abort）无测试 ｜ P1
- 位置：`src/features/home/useHomepageProbe.ts:75-239`
- 证据：probeInstance 用 Promise.allSettled 跑 5 端点（83-89）、要求 GET / 成功否则抛"Unreachable"（92-94）、容忍部分失败、传播父 abort signal（64-67）、unmount abort+清 interval（234-238）。无测试覆盖部分失败/abort/15s interval。
- 修复建议：加 useHomepageProbe.test.ts（fake timers + fetch mock）：全通→lastKnownInfo 填充；GET / 失败→"Connection failed"；stats 500 但 / ok→无 stats；unmount abort 在途请求。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：各路径断言 ｜ 状态：待处理

**TD-TEST-007** ｜ InstanceDialog 表单校验（zodResolver）无测试 ｜ P1
- 位置：`src/features/home/InstanceDialog.tsx:79-80`
- 证据：连接创建弹窗经 zod schema + react-hook-form 校验 baseUrl/secret/name。schema 与表单错误渲染/提交门控均无测试。畸形 baseUrl 或空 secret 可能静默创建不可用实例。
- 修复建议：提取并直测 instanceSchema（空 name、非法 URL、短 secret）+ 渲染测试断言错误信息出现且非法时提交禁用。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：各校验分支断言 ｜ 状态：待处理

**TD-TEST-008** ｜ api/endpoints 16 个端点仅测 2 个 ｜ P1
- 位置：`src/api/endpoints/index.ts:17-112`；`index.test.ts:4` 仅导入 2
- 证据：仅 getConfigsRaw 与 validateConfigs 有测试。updateConfigs/patchConfigs/toggleRule/writeTag（写路径）、getStats/getMetricsText/getDeadLetters（监控）及列表端点无 shape/错误契约测试。writeTag 驱动 PLC 写入——错误 body 可能写坏值。
- 修复建议：扩展 index.test.ts 覆盖各端点请求 shape（method/URL/headers/body）+ 每个写端点至少一个错误状态。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：16 端点均有 shape 测试 ｜ 状态：待处理

**TD-TEST-009** ｜ api/hooks（全部 react-query hook + 缓存失效）无测试 ｜ P2
- 位置：`src/api/hooks/index.ts`（全 215 行）
- 证据：useConnectedQuery 按 isConnected && enabled 门控（21）；mutation 成功时失效特定 query key（138-185）。失效 key 正确性未验——错误 key 留陈旧 UI。
- 修复建议：加 api/hooks/index.test.tsx（QueryClient + mock endpoints）：断言断连时 query 跳过；断言各 mutation 失效预期 key（spy invalidateQueries）。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：各 mutation 失效 key 断言 ｜ 状态：待处理

**TD-TEST-010** ｜ writeValidation.validateValue（按数据类型强转写值）无测试 ｜ P1
- 位置：`src/lib/writeValidation.ts:37`
- 证据：validateValue(raw, dt) 按数据类型（bool/int/float/string）校验写命令值。守护写入物理 PLC 的内容。无测试覆盖类型不匹配/溢出/bool 强转。
- 修复建议：加 writeValidation.test.ts 覆盖各 DataTypeString：合法/非法值、边界（int max、float 精度）、bool 变体（"true"/1/"1"）。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：各类型分支断言 ｜ 状态：待处理

**TD-TEST-011** ｜ configYaml parse/dump 往返 + CRUD helper 无测试 ｜ P2
- 位置：`src/lib/configYaml.ts:24-132`
- 证据：parseConfigYaml/dumpConfigYaml 与 findDriver/upsertDriver/removeDriver/upsertTransport 被首页探测与编辑器使用。非幂等往返或坏 upsertDriver 会静默损坏配置。
- 修复建议：加 configYaml.test.ts：代表性配置往返相等；upsert 增/改；按名 remove；畸形 YAML 抛错。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：往返 + CRUD 断言 ｜ 状态：待处理

**TD-TEST-012** ｜ connectionInfo 摘要无测试（喂首页拓扑行） ｜ P2
- 位置：`src/lib/connectionInfo.ts:187-260`
- 证据：getDriverConnectionSummary/getTransportConnectionSummary 从配置派生紧凑 host:port/broker/url 串供拓扑显示；extractDriverYaml/extractTransportYaml 切 YAML。错误摘要误导运维。
- 修复建议：加 connectionInfo.test.ts 每 driver/transport 类型：已知摘要、缺设置→空、extractYaml 往返。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：各类型断言 ｜ 状态：待处理

**TD-TEST-013** ｜ ruleMatchEvaluator（规则模拟逻辑）无测试 ｜ P2
- 位置：`src/lib/ruleMatchEvaluator.ts:30-113`
- 证据：getFieldValue/evaluateClause/evaluateMatch 驱动规则测试/模拟 UI。子句解析、操作符求值、ALL/复合匹配无测试。
- 修复建议：加 ruleMatchEvaluator.test.ts：ALL 匹配；`tag == 'x' && value > 95`；缺字段访问；无匹配子句。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：各分支断言 ｜ 状态：待处理

**TD-TEST-014** ｜ admin 页面冒烟测试不断言行为（假测试风险） ｜ P2
- 位置：`src/features/admin/pages_render_smoke.test.tsx:98-112`
- 证据：两测试均以 `expect(container?.container).toBeTruthy()` 结尾——仅确认 render() 返回容器。无 query/内容断言。使 RulesPage 渲染空 div 仍通过。真实价值仅 #185 无限循环守卫。
- 修复建议：每页加至少一条内容断言（如 `expect(screen.getByText(/transports/i)).toBeInTheDocument()`）+ 用 findBy* 的 loading→data 转换。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：注入渲染缺陷测试失败 ｜ 状态：待处理

**TD-TEST-015** ｜ wizard 测试只覆盖纯 helper，未覆盖组件行为 ｜ P2
- 位置：`ConfigApplyConfirmationDialog.test.ts:2-5`、`EntitySearchBar.test.ts:2`
- 证据：两者仅导入导出函数（computeConfigDiff/computeLineDiff、filterEntities）。弹窗开/关、apply 按钮 totalChanges===0 时禁用、搜索栏输入→过滤列表渲染均未渲染。403 行 ConfigApplyConfirmationDialog 组件本身无测试。
- 修复建议：加渲染测试（jsdom）：弹窗显示 diff 摘要；无变更时 apply 禁用；EntitySearchBar 随输入过滤 DOM 列表。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：组件行为断言 ｜ 状态：待处理

**TD-TEST-016** ｜ settingsRegistry 测试仅结构级（79 行 vs 878 行源） ｜ P2
- 位置：`src/lib/settingsRegistry.test.ts`（全 79 行）vs `settingsRegistry.ts`（878）
- 证据：测试断言每类型有 registry 条目 + buildDefaultSettings 返回 3 类型硬编码默认。字段 required/enum/min/max/强转元数据、未测类型的 getDriverFieldRegistry/getTransportFieldRegistry、TRANSPORT_TOPLEVEL_FIELDS 超 5 命名 key 均未测。buildDefaultSettings 非法输入（仅 :76 测 undefined）未覆盖。
- 修复建议：加字段元数据测试（required 标志、enum 值、数值边界）跨所有 driver/transport 类型 + buildDefaultSettings 部分/空 registry。
- 业务行为影响：无 ｜ 阶段5 ｜ 验收：字段元数据覆盖 ｜ 状态：待处理

### 安全（SEC）

> 详见 `docs/exec-plans/.scratch/audit-security.md`。已确认安全项（路径穿越防护、无 SSRF、无 XSS sink、密钥存 sessionStorage、服务端密钥脱敏）不计入台账。

**TD-SEC-001** ｜ CSP connect-src * 允许连任意源，削弱外泄防护 ｜ P1
- 位置：`index.html:7-10`
- 证据：CSP meta 中 `connect-src * ws: wss:`。
- 修复建议：换为已知 CoreC 后端主机显式白名单（或 server.mjs 同源代理部署下 `'self' ws: wss:`）。收紧 `style-src 'unsafe-inline'`（Monaco 注入内联样式——可能需 nonce）。
- 业务行为影响：变更行为（限制可连后端——需产品决策，见计划 §6 D3） ｜ 批次I ｜ 验收：CSP 头更新 + 页面功能回归 ｜ 状态：待处理

**TD-SEC-002** ｜ API Bearer 密钥发往任意用户选定后端（浏览器 SSRF / 凭证重定向） ｜ P1
- 位置：`src/api/client.ts:50-56`、`src/features/home/InstanceDialog.tsx:32-35`
- 证据：client.ts——baseUrl 为用户输入，无白名单；`headers.set('Authorization', \`Bearer ${conn.secret}\`)`。InstanceDialog——仅校验 `^https?://`，任意 host。useHomepageProbe.ts:80 亦从浏览器直发 `Bearer ${instance.secret}` 到 instance.baseUrl。结合 TD-SEC-001（connect-src *），能影响 baseUrl 的脚本可将凭证外泄到攻击者 host。
- 修复建议：加后端主机白名单（或 server.mjs 部署要求同源 /corec-api）。
- 业务行为影响：变更行为（见 §6 D3） ｜ 批次I ｜ 验收：白名单生效 + 多实例 UX 回归 ｜ 状态：待处理

**TD-SEC-003** ｜ 实例导出将 API 密钥写入明文 JSON 文件（凭证泄露） ｜ **P0**
- 位置：`src/stores/instanceStore.ts:247-249`，消费于 `features/settings/GlobalSettingsPage.tsx:41`、`features/home/InstancePanel.tsx:75`
- 证据：`exportInstances: () => JSON.stringify(get().instances, null, 2)`——含 `secret` 字段，未脱敏。下载的 `corec-instances-YYYY-MM-DD.json` 含每个实例 secret 明文。操作者导出后易提交 git 或分享。
- 修复建议：exportInstances 应用 stripSecret（或省略 secret），或导出前警告并提供"不含密钥"选项。
- 业务行为影响：变更行为（见 §6 D2——导出是否含密钥为产品决策；若含密钥为备份意图，则至少加警告） ｜ 批次I ｜ 验收：导出文件不含明文 secret（或显式警告）+ 导入往返回归 ｜ 状态：待处理

**TD-SEC-004** ｜ 供应链风险——js-yaml 5.4.2 来自第三方镜像 ｜ P1（待核实）
- 位置：`package.json:37`（`"js-yaml": "^5.4.2"`），package-lock.json 解析 `js-yaml@5.4.2` 自 `https://registry.npmmirror.com/...`；`@types/js-yaml` 为 4.0.9（不匹配）
- 证据：官方 js-yaml 稳定线为 4.x；需核实 5.4.2 是否合法发布而非镜像 fork/typosquat。@types 4.0.9 vs 运行时 5.4.2 不匹配致类型不可靠。
- 修复建议：从官方 registry.npmjs.org 重新解析，确认完整性哈希。Phase 3 跑 `npm audit`。
- 业务行为影响：无（仅核实） ｜ 阶段3 ｜ 验收：官方源解析 + 哈希确认 ｜ 状态：待处理

**TD-SEC-005** ｜ WebSocket 鉴权 token 走 URL 查询串（日志泄露） ｜ P2
- 位置：`src/api/websocket.ts:68-73`
- 证据：`url.searchParams.set('token', secret)`——密钥在 WS URL；出现在代理/服务访问日志及可能浏览器历史。
- 修复建议：优先经鉴权 REST 交换短时 ticket，或用 Sec-WebSocket-Protocol 子协议头携带 token。至少确保 CoreC 不记查询串。
- 业务行为影响：变更行为（见 §6 D6） ｜ 批次I ｜ 验收：token 不在 URL + 流式回归 ｜ 状态：待处理

**TD-SEC-006** ｜ 模板弱默认密钥 "change-me-please" ｜ P2
- 位置：`src/lib/configTemplates.ts:44,104,160,226,284,356`、`:133`（`Authorization: "Bearer your-token-here"`）
- 证据：模板含 `secret: "change-me-please"`；schema 要求 min 8 字符，该值满足，校验不拦。
- 修复建议：模板加载时生成随机密钥，或 apply 前阻止直到操作者替换占位。
- 业务行为影响：变更行为（见 §6 D5） ｜ 批次I ｜ 验收：模板不含已知弱密钥 ｜ 状态：待处理

**TD-SEC-007** ｜ server.mjs 未设安全响应头 ｜ P2
- 位置：`server.mjs:223-258`（serveStatic）、`server.mjs:79-114`（proxyToCoreC）
- 证据：无 X-Content-Type-Options: nosniff、Referrer-Policy、Strict-Transport-Security、Permissions-Policy。CSP 经 index.html meta 覆盖文档，静态资产无 nosniff。
- 修复建议：在 serveStatic 与 proxyToCoreC 加 res.setHeader：nosniff、Referrer-Policy: strict-origin-when-cross-origin、Permissions-Policy: geolocation=(), microphone=(), camera=()。TLS 时加 HSTS。
- 业务行为影响：无 ｜ 阶段3 ｜ 验收：curl 验证头存在 ｜ 状态：待处理

**TD-SEC-008** ｜ 依赖均为 bleeding-edge 大版本 ｜ P2
- 位置：`package.json:15-64`
- 证据：react ^19.3、vite ^8.3、typescript ~7.0、@biomejs/biome ^2.5、zod ^4、i18next ^26、@types/node ^26、vitest ^5、jsdom ^29。大版本很新，实战窗口短，传递 CVE 概率高。
- 修复建议：Phase 3 对实时 registry 跑 npm audit + pnpm audit；CI 锁定精确版本；审查 Vite 8 rolldown 传递依赖。
- 业务行为影响：无 ｜ 阶段3 ｜ 验收：audit 报告 + 无高危 CVE ｜ 状态：待处理

**TD-SEC-009** ｜ js-yaml load() 未指定安全 schema（原型污染风险） ｜ P2（待核实）
- 位置：`src/lib/configYaml.ts:24-32`，喂自服务配置（useHomepageProbe.ts:160、ConfigCenterPage）与用户粘贴 YAML（configStore.ts:190-204）
- 证据：`const parsed = load(yaml)`——无 { schema } 选项。含 `constructor.prototype.<x>` key 的 YAML 映射可能在 zod 校验前污染 Object.prototype。
- 修复建议：显式 `load(yaml, { schema: JSON_SCHEMA })`（或 DEFAULT_SAFE_SCHEMA）。解析后拒绝 `__proto__`/`constructor`/`prototype` key。核实解析出的 js-yaml@5.4.2 行为。
- 业务行为影响：无 ｜ 批次I ｜ 验收：污染 payload 被拒 ｜ 状态：待处理

**TD-SEC-010** ｜ 无仪表盘级鉴权——公网部署仅靠逐实例 Bearer 密钥 ｜ P2
- 位置：`src/App.tsx`/`src/main.tsx`、`.github/workflows/deploy.yml:1-16`、`public/CNAME`（dash.liusy.eu.org）
- 证据：无登录/会话/角色检查；任何能访问 URL 者可用仪表盘。deploy.yml 发布到公网 GitHub Pages 自定义域。
- 修复建议：若公网托管，加鉴权层（server.mjs 代理会话 cookie / basic auth，或 auth provider）。若内网/气隙，记录网络访问控制要求并避免公网 Pages 部署。
- 业务行为影响：变更行为（见 §6 D4） ｜ 批次I ｜ 验收：—— ｜ 状态：已豁免（用户 2026-10-02 决策：维持公网无鉴权现状，接受风险，仅靠逐实例 Bearer 密钥保护）

**TD-SEC-011** ｜ importInstances 未校验 JSON 即 spread，接受任意字段（含攻击者 baseUrl/secret） ｜ P2
- 位置：`src/stores/instanceStore.ts:251-290`
- 证据：`imported = JSON.parse(json)`（无 schema、无 __proto__ guard）；仅存在性检查 `if (!inst.id || !inst.name || !inst.baseUrl)`；`next.push({ ...inst, ... })` spread 全字段含 secret。
- 修复建议：用 InstanceDialog 同款 zod schema 校验导入实例（要求 ^https?:// baseUrl、min-8 secret、拒绝未知 key）。
- 业务行为影响：变更行为 ｜ 批次I ｜ 验收：畸形导入被拒 + 合法导入回归 ｜ 状态：待处理

**TD-SEC-012** ｜ ErrorBoundary 日志输出完整 error 对象（含 ApiError.body） ｜ P2
- 位置：`src/components/ErrorBoundary.tsx:39`
- 证据：`console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)`。ApiError.body 来自 `await res.text()`（client.ts:82）——原始服务响应文本。
- 修复建议：生产环境仅记脱敏摘要（status + message，不含 body）。完整日志置于 `import.meta.env.DEV` 之后。
- 业务行为影响：无 ｜ 阶段3 ｜ 验收：生产构建无完整 body 日志 ｜ 状态：待处理

### 门禁（GATE）

**TD-GATE-001** ｜ 质量门禁仅在 push main 部署时跑；无 PR/分支门禁；无独立 ci.yml ｜ P1
- 位置：`.github/workflows/deploy.yml`（唯一 workflow，触发 `push` to `main` + `workflow_dispatch`）
- 证据：lint/build/test 三件套仅在 deploy.yml 的 build job，触发条件为 push main。PR、harnessing 分支或其他分支推送不触发任何自动化质量校验——缺陷仅在合入主干部署时暴露。无独立 ci.yml，质量与发布耦合。
- 修复建议：新增 `.github/workflows/ci.yml` 在 PR 与所有分支推送触发，独立跑 lint + type-check + build + test + 覆盖率门禁；deploy.yml 改为 needs: ci 或复用产物。详见 `docs/CI.md` §4。
- 业务行为影响：无 ｜ 阶段3 ｜ 验收：PR 触发 ci.yml 且故意越层依赖失败 ｜ 状态：待处理

**TD-GATE-002** ｜ 双 lockfile（package-lock.json + pnpm-lock.yaml），CI 用 npm ｜ P1
- 位置：`package-lock.json`（178KB）、`pnpm-lock.yaml`（133KB）、`.github/workflows/deploy.yml`（`npm ci`、`cache: npm`）
- 证据：两份 lockfile 并存，权威来源不明；CI 用 npm ci 依赖 package-lock.json。两份可漂移。
- 修复建议：在 npm 与 pnpm 间确定唯一权威 lockfile，删除另一份，CI 与本地命令统一，决定写入 docs/CI.md。**需 Phase 3 落地前确认（见 §6 D1）。**
- 业务行为影响：无 ｜ 阶段3 ｜ 验收：仅一份 lockfile + CI 一致 ｜ 状态：待处理

**TD-GATE-003** ｜ 无 pre-commit / pre-push hook ｜ P2
- 位置：无 `.husky`、无 `lefthook.yml`、无 `.pre-commit-config.yaml`；`.git/hooks` 仅 sample
- 证据：本地提交前无任何自动校验。
- 修复建议：加 pre-commit hook（lint-staged / biome check on staged files）+ commit-msg hook（Conventional Commits 校验）。
- 业务行为影响：无 ｜ 阶段3 ｜ 验收：本地提交触发 hook ｜ 状态：待处理

**TD-GATE-004** ｜ biome noExplicitAny 为 warn 非 error——any 未被拦截 ｜ P2
- 位置：`biome.json`（`suspicious.noExplicitAny: "warn"`）
- 证据：`any` 用法仅告警不阻断，可随提交漂移。
- 修复建议：结合存量 any 清理后，将 noExplicitAny 提为 error（或先加结构测试统计 any 数量并设下降门禁）。
- 业务行为影响：无 ｜ 阶段3 ｜ 验收：lint 对 any 报 error ｜ 状态：待处理

### 文档（DOC）

**TD-DOC-001** ｜ 无 README.md ｜ P1
- 位置：仓库根（无 README）
- 证据：全仓无 README（`find` 仅命中 docs/HARNESS-RULES.md）。新工程师/智能体无入口说明。
- 修复建议：Phase 2 撰写 README（一句话定位 + 快速开始 + 指向 AGENTS.md/ARCHITECTURE.md）。
- 业务行为影响：无 ｜ 阶段2 ｜ 验收：README 存在且链接可解析 ｜ 状态：待处理

**TD-DOC-002** ｜ 无 AGENTS.md / ARCHITECTURE.md / docs 结构 / core-beliefs.md ｜ P1
- 位置：无（docs/ 此前不存在）
- 证据：无 AGENTS.md、无 ARCHITECTURE.md、无 docs/ 目录结构、无 core-beliefs.md。违反 §2.1 必需项。
- 修复建议：Phase 2 按 §2.1/§2.2/附录 E/F 建立 AGENTS.md（≤100 行地图）、ARCHITECTURE.md（分层 + 依赖方向）、docs/ 结构与 core-beliefs.md。
- 业务行为影响：无 ｜ 阶段2 ｜ 验收：四件必需项存在且通过文档校验 ｜ 状态：待处理

**TD-DOC-003** ｜ 无 QUALITY_SCORE.md / exec-plans 结构 ｜ P2
- 位置：无
- 证据：无 QUALITY_SCORE.md、无 docs/exec-plans/ 标准结构（active/completed/tracker）。
- 修复建议：Phase 2 建立 QUALITY_SCORE.md（按域/层打分）与 exec-plans 结构；本台账与计划即首批 active 产物。
- 业务行为影响：无 ｜ 阶段2 ｜ 验收：结构存在 + 分数可复算 ｜ 状态：待处理

### 性能（PERF）与可靠性

> 详见 `docs/exec-plans/.scratch/audit-performance.md`。流式/图表/超时等高风险路径已加固（WebSocket 退避+限流+重连上限、图表窗口封顶、rAF 批处理、apiRequest 15s 超时、路由懒加载、manualChunks 充分拆分）——以下为剩余缺口。

**TD-PERF-001** ｜ "View Tags" 弹窗渲染全量标签列表，无虚拟化/无封顶 ｜ P1
- 位置：`src/features/admin/DriversPage.tsx:480,522`
- 证据：`const tags = tagsData?.tags ? Object.values(tagsData.tags) : []` 后 `{tags.map((tag) => { … })}`，无 `.slice`、无 `useVirtualizer`。兄弟 `DriverDetailPage.tsx:717` 显式 `tags.slice(0, 200)`、`TagExplorerPage` 虚拟化同数据——本弹窗为不一致离群点。IIoT PLC 驱动常带 500–5000 标签，开弹窗即挂载数千 `<tr>`。
- 修复建议：用 `tags.slice(0, 200)`（对齐 DriverDetailPage）或更好用 `@tanstack/react-virtual`（已是依赖）虚拟化 `<tbody>`。
- 业务行为影响：无 ｜ 批次J ｜ 验收：大标签集开弹窗不卡（DOM 节点数有界） ｜ 状态：待处理

**TD-PERF-002** ｜ pprof 下载用裸 fetch 无超时/AbortController——可永久挂起 ｜ P1
- 位置：`src/features/admin/DiagnosticsPage.tsx:149`
- 证据：`const res = await fetch(url, { headers: { Authorization: … } })`——无 signal、无 AbortController、无单次超时。`trace?seconds=5`/`profile?seconds=5` 服务端阻塞 ≥5s；CoreC 挂起/不可达时 promise 永久 pending，`pprofLoading` 不清、spinner 永转。其余 fetch（apiRequest、useHomepageProbe）均有超时，本处绕过封装。
- 修复建议：经 `apiRequest`（15s 默认，可覆写 timeoutMs）或在 AbortController 加宽超时（如 30s）并于弹窗 unmount 时 abort。
- 业务行为影响：无 ｜ 批次J ｜ 验收：不可达后端超时清 spinner ｜ 状态：待处理

**TD-PERF-003** ｜ 表单模式配置校验逐键全量运行 zod validateFullConfig（无防抖） ｜ P2
- 位置：`src/features/admin/ConfigCenterPage.tsx:190` + `src/hooks/useConfigValidation.ts:28-34`
- 证据：`useConfigValidation()` 订阅 workingConfig，在 `useMemo([workingConfig])` 内跑 `validateFullConfig(workingConfig)`。表单视图 `GlobalConfigEditor`/`NodeConfigEditor` 每次 onChange 调 `updateGlobalField(...)` 产生新 workingConfig ref → 逐键同步全量 zod 遍历。YAML diff 预览已正确防抖（`debouncedYaml = useDebouncedValue(yamlContent, 300)` :201），校验未防抖。大配置致输入卡顿。
- 修复建议：校验输入防抖——`useDebouncedValue(workingConfig, 150-300)` 喂 validateFullConfig，或 `useDeferredValue`/setTimeout 防抖 effect，镜像 diff 预览模式。
- 业务行为影响：无 ｜ 批次J（与 批次F/TD-CPLX-001 ConfigCenterPage 拆分协同） ｜ 验收：大配置逐键无卡顿 ｜ 状态：待处理

**TD-PERF-004** ｜ AlertsPage 死信列表未虚拟化/未封顶 ｜ P2
- 位置：`src/monitor/AlertsPage.tsx:340`
- 证据：`{deadLetters.map((entry) => { … })}` 每死信一卡片，无 `.slice`、无虚拟化器。`deadLetters` 来自 `useDeadLetters()`（每 4s 轮询）。队列大小由后端控制；大积压（写入风暴打到宕机传输）挂载无界 DOM 且每 4s 全量重渲。
- 修复建议：封顶渲染条目（如 `.slice(0, 100)` + "显示 N/M" 提示）或虚拟化。上方 live-log 已封顶 50——同纪律。
- 业务行为影响：无 ｜ 批次J ｜ 验收：大积压 DOM 节点有界 ｜ 状态：待处理

**TD-PERF-005** ｜ WriteControlPage 死信：未 memo 过滤 + 未虚拟化渲染 ｜ P2
- 位置：`src/features/admin/WriteControlPage.tsx:137,531`
- 证据：`const visibleDeadLetters = deadLetters.filter((dl) => !clearedDlqKeys.has(dlqKeyOf(dl)))` 每渲染重算（无 useMemo），后 `{visibleDeadLetters.map((dl) => …)}` 全量渲染未封顶。`useDeadLetters()` 每 4s 轮询 → 过滤+全量重渲 15×/min，不论数据是否变化。
- 修复建议：过滤包 `useMemo([deadLetters, clearedDlqKeys])`，渲染封顶/虚拟化。
- 业务行为影响：无 ｜ 批次J（与 批次F/TD-CPLX-007 协同） ｜ 验收：轮询间无多余重算 ｜ 状态：待处理

**TD-PERF-006** ｜ DiagnosticsPage driverReads/transportPublishes 每渲染 .filter 重算 ｜ P2
- 位置：`src/features/admin/DiagnosticsPage.tsx:213-214`
- 证据：`const driverReads = metrics.filter(...)` 与 `transportPublishes = metrics.filter(...)` 在 render body 无 useMemo。`metrics` 来自 `useMetrics()`（每 12s 轮询），页面 autoRefresh 切换/手动 refetch 亦重渲 → O(n) 扫描每次轮询重跑，即使指标集未变。（兄弟 `metricsMap`/`histogramsMap` :177/:179 已正确 memo。）
- 修复建议：两者 `useMemo(() => metrics.filter(...), [metrics])`，或从 metricsMap 派生。
- 业务行为影响：无 ｜ 批次J ｜ 验收：指标未变时不重算 ｜ 状态：待处理

**TD-PERF-007** ｜ TopologyPage：未 memo 的 activeRules + .map 内逐项连接摘要查找 O(n²) ｜ P2
- 位置：`src/features/admin/TopologyPage.tsx:34`（及 driver/transport `.map` 体）
- 证据：`const activeRules = rules.filter((r) => !r.disabled)` 每渲染跑（相邻 `sortedRules` 已 memo :35）。driver/transport 渲染循环内 `getDriverConnectionSummary(config, d.name)`/`getTransportConnectionSummary(config, tr.name)` 逐项逐渲染调，各做 `config.drivers.find(...)`（O(drivers)）→ 卡片行 O(drivers²)/渲染。页面挂 7 个轮询查询（5–30s）→ 频繁重渲。
- 修复建议：memo activeRules；`useMemo` 预算 `Map<name, summary>`（每 config 一次），循环内按名查。
- 业务行为影响：无 ｜ 批次J ｜ 验收：渲染复杂度降为 O(n) ｜ 状态：待处理

**TD-PERF-008** ｜ DriversPage 每卡片每渲染调 getDriverConnectionSummary（O(n²) find） ｜ P2
- 位置：`src/features/admin/DriversPage.tsx:205,327`
- 证据：`filteredConfigDrivers.map` 与 `drivers.map` 内 IIFE `const summary = getDriverConnectionSummary(workingConfig, drv.name)`/`getDriverConnectionSummary(parsedConfig, drv.name)` 逐卡跑，各 `config.drivers.find(d => d.name === name)` → 渲 N 卡 O(N²)。`useDrivers()` 每 15s 轮询、workingConfig 每次 wizard 编辑变 → 频繁重跑。
- 修复建议：`useMemo` 建 `Map<driverName, summary>`（从 workingConfig/parsedConfig 一次），循环内索引。
- 业务行为影响：无 ｜ 批次J（与 批次E/TD-DUP-006 协同） ｜ 验收：渲染复杂度 O(n) ｜ 状态：待处理

**TD-PERF-009** ｜ AppShell 订阅整个 instances 数组（宽 Zustand selector） ｜ P2
- 位置：`src/components/layout/AppShell.tsx:65`
- 证据：`const instances = useInstanceStore((s) => s.instances)` 选整个数组。任何产生新数组 ref 的变更——尤其 `setProbeResult`（每次探测 map instances）——重渲整个 shell + `<Outlet>` 子树。ConnectionProvider 挂载即 setProbeResult；首页探测每 15s 更新 instances。`InstanceCard` 已正确 memo + 窄 selector，但 shell 本身未。
- 修复建议：若 AppShell 仅需实例数/ids 供切换器，选派生原语（`s.instances.map(i => ({id:i.id,name:i.name}))` + 浅相等 selector，或 useShallow）。否则接受——实例路由内有界且低频。
- 业务行为影响：无 ｜ 批次J（与 批次F/TD-CPLX-005 AppShell 拆分协同） ｜ 验收：探测不触发全 shell 重渲 ｜ 状态：待处理

**TD-PERF-010** ｜ Monaco 编辑器核心运行时从公网 CDN 拉取——离线/气隙 + CSP 依赖 ｜ P2
- 位置：`src/main.tsx:14`
- 证据：`loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs' } })` 启动即跑；`@monaco-editor/react` 在 Config Center 编辑器挂载时惰性从 jsDelivr 拉 Monaco 核心。权衡：Monaco 包（~3-4MB）不进 app chunk（首屏好），但 (a) 首次进 Config Center 有 CDN 往返，(b) 需联网 + CSP `script-src`/`style-src` 白名单 jsdelivr（代码注释已警告），(c) 气隙 IIoT 控制网无法加载编辑器 → Config Center 空白。
- 修复建议：IIoT 部署自托管 `monaco-editor` 的 `min/vs` 资产，loader.config 指本地路径（或用 @monaco-editor/react loader + bundled workers）。CDN 路径留作开发便利，置 env flag 后。
- 业务行为影响：变更行为（见 §6 D7——自托管 vs CDN 为部署决策） ｜ 批次J ｜ 验收：气隙环境 Config Center 可用 ｜ 状态：待处理

**TD-PERF-011** ｜ 首页探测每 15s 对 N 实例发 5 并行请求，无并发上限 ｜ P2
- 位置：`src/features/home/useHomepageProbe.ts:83-89,232`
- 证据：`probeInstance` 对每实例 `Promise.allSettled` 5 fetch（`/`、`/stats`、`/tags`、`/rules`、`/configs/raw`）；`probeAll` 在 `setInterval(probeAll, 15_000)` 上对全部实例 `list.map(...)` 并行。N 实例 = 每 15s 跨 N 后端 5N 请求。每请求 8s 超时 + unmount abort（好），但无单实例/全局并发限 → 大实例列表（或慢后端）突发 5N 同时 socket。
- 修复建议：对"同时多实例监控"为有意设计，典型 N（<20）无碍。若预期大 N，加小并发限（p-limit 式）或错峰逐实例探测。低优先。
- 业务行为影响：无 ｜ 批次J ｜ 验收：大 N 下 socket 数有界 ｜ 状态：待处理

**TD-PERF-012** ｜ WriteControlPage clearedDlqKeys Set 在 sessionStorage 无界增长 ｜ P2
- 位置：`src/features/admin/WriteControlPage.tsx:124`
- 证据：`sessionStorage.setItem(DLQ_CLEARED_KEY, JSON.stringify([...clearedDlqKeys]))` 每次变更持久化整个 cleared-keys Set。CoreC 无死信 DELETE 端点，"清除"为客户端按键隐藏；每次清除的复合 key（`driver-tag-failed_at-attempts`）累积入 Set 且每次清除重序列化。长会话 + 反复写入失败 → Set 及其 JSON 串无界增长。
- 修复建议：封顶 Set（如保留最近 200 个清除 key，淘汰最旧）或当对应死信不再出现于 deadLetters 时清陈旧 key。
- 业务行为影响：无 ｜ 批次J（与 批次F/TD-CPLX-007 协同） ｜ 验收：长会话 Set 大小有界 ｜ 状态：待处理

---

## 变更日志

| 日期 | 动作 | 关联 |
|---|---|---|
| 2026-10-02 | 初建。登记 76 条（ARCH 13 / CPLX 10 / DUP 6 / TEST 16 / SEC 12 / GATE 4 / DOC 3 / PERF 12），5 域并行审计完成 | Phase 1 全量扫描 |
