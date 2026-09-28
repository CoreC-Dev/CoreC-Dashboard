# CoreC-Dashboard 既有审计/规划文档提炼报告

> 目的：从 8 份既有文档中提炼与「配置功能、驱动/传输/规则 CRUD、向导式交互、API 能力」相关的结论与已有规划，避免后续重复劳动。
> 基于文档原文提取，关键结论附来源标注。
> 提炼日期基于文档内标注（API_AUDIT_REPORT 标注 2026-09-27，其余无日期）。

---

## 1. 文档清单与定位

| 文档 | 范围与时效性 |
|:---|:---|
| `corec-research-report.md` | CoreC 后端深度研究报告（API 全表、数据模型、驱动/传输/规则引擎语义）。**纯后端背景资料，时效稳定**，是理解 API 能力边界的基准。 |
| `corec-dashboard-proposal.md` | 前端 UI 技术方案（技术栈、M1–M3/A1–A9 模块设计、路由、目录、分期计划）。**原始设计蓝图**，定义了"应有功能"；但部分模块（A1 配置编辑、A3 规则编辑器、A6 表单模式）至今未落地。 |
| `DEVELOPMENT_PLAN.md` | 开发规划与缺陷审计（含实测构建证据、P0–P2 缺陷、功能缺口对照表、分阶段路线图、API 契约速查）。**最早期的现状审计**，描述了"初版能跑但看不清、刷新即空、编排无效"的初始破损态；其 P0 止血项大多已被后续修复，但配置 CRUD 缺口结论仍然有效。 |
| `AUDIT_REPORT.md` | 代码质量审计（src/ 全量，React 模式/错误处理/类型安全/内存/Zustand）。**针对运行时健壮性的代码审计**，与配置 CRUD 无直接关系，但记录了 RulesPage 写操作无 catch 等管理操作缺陷。 |
| `API_AUDIT_REPORT.md` | Dashboard↔CoreC API 集成审计（对 live server curl/WS 实测，2026-09-27）。**最新且最权威的 API 对接结论**：19 REST + 4 WS 端点路径/方法全部正确，唯一实际 broken 的是 WebSocket 跨域 403。 |
| `I18N_UX_AUDIT.md` | i18n 与 UI/UX 审计（14 页面 + 组件 + i18n 文件）。**最新且最权威的前端实现现状盘点**，含 proposal 模块覆盖度逐项核对（A1–A9 哪些已实现、哪些缺口），并明确指出配置编辑表单缺失。 |
| `AUDIT_FIX_REPORT.md` | Phase 2 后多代理审计的修复报告（代码/安全/性能/i18n 三维）。**记录"已修复"清单**，但其中未涉及任何配置 CRUD 修复——即配置编辑类功能始终未被处理。 |
| `README.md` | 项目说明（特性、技术栈、启动、部署）。**对外宣传文案**，部分描述（如"配置中心表单+Monaco 双模式"）比实际实现更乐观，需以审计文档为准。 |

**时效排序（新→旧，用于冲突仲裁）**：`API_AUDIT_REPORT`(2026-09-27) ≈ `I18N_UX_AUDIT` ≈ `AUDIT_FIX_REPORT` ≈ `AUDIT_REPORT` > `DEVELOPMENT_PLAN` > `proposal` / `research-report`（背景资料）。

---

## 2. 已识别的配置/API 缺口（核心）

> 这是本报告重点：以下缺口在多份文档中被反复确认，后续规划**不应重复识别**，应直接进入实现。

### 2.1 驱动/传输/规则配置编辑完全缺失（只读）

- **A1 驱动配置表单编辑 🔴 缺失** — 来源 `DEVELOPMENT_PLAN §三`：原文"仅只读卡片，无表单编辑→YAML→热重载"。`I18N_UX_AUDIT §7 P2-3` 复核确认：`DriverDetailPage`/`TransportDetailPage` 为只读，proposal A1 要求的"表单式编辑驱动参数 → 生成 YAML → 提交热重载"无任何 edit UI。
- **A2 传输详情/队列趋势 🔴 缺失** — 来源 `DEVELOPMENT_PLAN §三`：原文"仅只读卡片，无详情抽屉、无队列趋势图"。`I18N_UX_AUDIT §7`：A2 无 queue-depth trend chart、无 edit（P2-3）。
- **A3 规则编辑器 🔴 缺失** — 来源 `DEVELOPMENT_PLAN §三`：原文"仅只读列表+启用开关，无编辑、无优先级拖拽、无测试沙箱"。`I18N_UX_AUDIT §7` 修正：**规则测试沙箱 ✓ 已实现**（RulesPage 有 test sandbox），但**规则编辑表单仍缺失**（P3 标注 "No rule editor form"）；优先级拖拽未实现。
- **A6 配置中心表单模式 🟡 部分** — 来源 `DEVELOPMENT_PLAN §三`：原文"仅 YAML 模式，无结构化表单模式"。`I18N_UX_AUDIT §7` 复核：ConfigCenter 已有 Form+YAML(Monaco) 双模式 + log-level PATCH + hot reload，但**无变更 diff 显示、无 localStorage 变更历史**（P3-6）。

### 2.2 写/管理操作的功能缺口

- **A4 死信批量清除 🟡 部分** — 来源 `DEVELOPMENT_PLAN §三` + `I18N_UX_AUDIT P2-2`：仅单条 Retry，缺 batch "Clear All"（`alerts.clear` 键已存在但未用）。
- **RulesPage 启用/禁用无错误处理** — 来源 `AUDIT_REPORT P2-1`：`handleToggle` 为 `try/finally` 无 `catch`，PATCH 失败产生 unhandled rejection，用户看不到失败（靠 5s 轮询自愈）。
- **写/变更错误信息丢弃** — 来源 `API_AUDIT_REPORT A4 (P3)`：`WriteControlPage` 等只展示 `err.message`（generic status），丢弃 `ApiError.body`（CoreC 的 `{"error":...}`），尤其 400 类 informative body 被吞（如 `PATCH /configs` 不支持的 key 的 400 提示）。

### 2.3 API 端点层面：**无端点缺失，但无 per-resource CRUD**

- 来源 `API_AUDIT_REPORT §1`：19 REST + 4 WS 端点路径与方法**全部与 server.go 一致，无缺失、无多余、无方法错误**。
- **关键架构约束**（综合 `research-report §三` + `DEVELOPMENT_PLAN §四` + `API_AUDIT_REPORT §1`）：CoreC API **没有 per-resource CRUD 端点**（无 `POST /drivers`、`DELETE /drivers`、`POST /rules` 等）。所有驱动/传输/规则的配置变更**只能**通过：
  - `PUT /configs`（`{path?, payload: YAML全文}` → 204）——全量热重载；
  - `PATCH /configs`（任意键 map，**实际仅支持 `log-level`**，其余 key 返回 `400 unsupported patch key(s)`）——运行时微调；
  - `PATCH /rules/disable`（`{index,disabled}` → 204）——仅启用/禁用，不能增删改规则内容。
- **含义**：所谓"驱动/传输/规则 CRUD"在前端只能实现为 **表单编辑 → 生成/合并 YAML → `PUT /configs` 全量热重载**，而非调用独立的增删改端点。`proposal A1` 与 `DEVELOPMENT_PLAN 阶段2` 均已据此设计（"表单→YAML→PUT /configs 热重载"）。

### 2.4 配置读取的 latent 缺陷

- 来源 `API_AUDIT_REPORT X2 (P3)`：`GET /configs` 在无 active config 时返回 `200 {"error":"no active configuration"}`，前端 `getConfigs` 当作 `ConfigSummaryResponse` 解析 → 字段全 undefined → `ConfigCenterPage` 静默渲染空配置且不报错（latent，live 未触发）。

---

## 3. 已有的规划与路线图

### 3.1 DEVELOPMENT_PLAN §五 分阶段路线图（配置相关聚焦）

- **阶段 0 止血（1 轮）**：P0-1 `@theme` 缺失、P0-2 刷新即空、P0-3 流量图速率、补 `@tanstack/react-virtual`。
  > 注：P0-1/P0-3 据后续文档已修复（见 §7），P0-2 部分相关。
- **阶段 1 核心体验（2–3 轮）**：DashboardEditor 真拖拽 + DashboardPage 消费 store、TagExplorer 虚拟化/复合键/趋势抽屉、i18n 全量、降轮询。
- **阶段 2 管理功能补全（3–4 轮）** —— **与配置 CRUD 直接相关，尚未开始**：
  1. 驱动配置表单编辑器（表单→YAML→PUT /configs 热重载）；
  2. 传输详情抽屉 + 队列趋势图；
  3. 规则编辑器 + 优先级拖拽 + 测试沙箱；
  4. 配置中心表单模式（结构化编辑 + 双向同步）；
  5. 配置变更历史（localStorage 快照）；
  6. 死信批量清除、告警声效/通知。
- **阶段 3 成熟度（2 轮）**：代码分割、全局 WS 状态 store、拓扑交互图、单测、体积优化。

### 3.2 proposal 分期（§八）中的配置相关

- Phase 3 管理功能：规则管理页（列表+启用/禁用）、控制下发、**配置中心（表单+Monaco YAML 双模式）**、日志级别快捷调整。
- Phase 4 大屏与高级、Phase 5 打磨。
- proposal §二 模块设计已明确各 admin 模块的"应有形态"（见 §4）。

### 3.3 验收标准（DEVELOPMENT_PLAN §七）中与配置相关

- "驱动/传输/规则可在线编辑并热重载" —— 明确列为成熟度验收项，**当前未达成**。

### 3.4 已设计但未实现的方案

- **`FormYamlToggle.tsx`**：proposal §五 目录已规划 `components/editor/FormYamlToggle.tsx`（表单/YAML 双模式切换组件），`RuleExprEditor.tsx`（规则 DSL 编辑器），`YamlEditor.tsx`（Monaco 封装）。当前 `YamlEditor`(Monaco) 已在 ConfigCenter 落地，但 `FormYamlToggle` / `RuleExprEditor` **未见实现**（`I18N_UX_AUDIT` 未提及这些组件存在）。
- **API 层按资源拆分**：DEVELOPMENT_PLAN §六建议随阶段 2 将 `endpoints/index.ts` 拆为 `drivers.ts/transports.ts/rules.ts/configs.ts/...`，当前仍单文件。

---

## 4. 已建议的交互形态

> 现有文档**未出现 "wizard/stepper/向导/多步表单" 术语**。已有的交互设计建议集中在"表单式编辑 + 双模式 + 二次确认 + diff 确认重载"。若要引入向导式交互，属**新设计**，无既有规划可继承。

### 4.1 表单式编辑（proposal §二）

- **A1 驱动配置编辑**："表单式编辑驱动参数 → 生成 YAML → 提交热重载"。
- **A3 规则编辑器**："表单式编辑匹配条件 + 动作 + Transform 表达式"；"规则优先级列表：拖拽排序（或数字输入排序）"；"规则测试沙箱：输入模拟 DataPoint JSON → 高亮匹配的第一条规则及执行动作"。
- **A6 配置中心双模式**："📝 表单模式：结构化表单编辑全局参数、驱动、传输、规则" + "📄 YAML 模式：Monaco 直接编辑 YAML（语法高亮、`${ENV_VAR}` 智能提示）" + "双模式双向同步"。

### 4.2 二次确认 / 安全交互（工业场景）

- **A4 控制下发**："操作确认：二次确认对话框（工业安全）"；"操作审计日志：每次下发记录操作人时间和结果"。
- **A6 差量热重载**："提交 `PUT /configs` → 显示变更 diff → 确认重载"（diff 确认 = 写前确认模式）。

### 4.3 类型化表单与校验（已落地的可复用模式）

- **写值校验已抽取为共享模块** — 来源 `AUDIT_FIX_REPORT M8`：从 `WriteControlPage` 抽取 `validateValue` + `NUMERIC_RANGES` 到 `src/lib/writeValidation.ts`，`TagExplorerPage` 写对话框已用其做内联校验（空→0、NaN、范围、bool 歧义）。**此校验模式可直接复用于配置表单的字段校验**。
- **priority 输入校验** — `AUDIT_FIX_REPORT m7`：RulesPage priority 输入加 `Number.isNaN` 守卫 + `min={0}`。

### 4.4 抽屉/对话框无障碍交互（已落地的范式）

- `AUDIT_FIX_REPORT M9`：TagExplorer 趋势抽屉补齐 `role="dialog"`、`aria-modal="true"`、`aria-label`、`tabIndex={-1}`、Escape `onKeyDown`、`drawerRef` focus 管理。**配置编辑抽屉/对话框应遵循同一范式**。

---

## 5. API 审计结论（API_AUDIT_REPORT，与配置操作相关）

### 5.1 端点对接 ✅ 正确且完整

- 19 REST + 4 WS 路径/方法与 `server.go` 逐行一致；`encodeURIComponent` 处理 `{name}` 正确；204 变更（`PUT/PATCH /configs`、`PATCH /rules/disable`）`client.ts` 返回 `undefined`，live 实测 `PATCH /configs {"log-level":"debug"}` → 204。
- **含义**：配置写操作的 API 通道本身没有问题，缺口纯粹在前端 UI。

### 5.2 配置写能力的真实边界（live 实测）

- `PATCH /configs` live 实测：`{"foo":"bar"}` → `400 {"error":"unsupported patch key(s): [foo] (supported: log-level)"}`。**即 PATCH 仅支持 log-level**，不能用于驱动/传输/规则的字段级修改。
- `PUT /configs` 接受 `{path?, payload: YAML全文}`，是唯一的结构性配置变更通道。

### 5.3 与配置操作相关的缺陷

- **A4 (P3)**：变更类错误丢弃 CoreC 响应 body（见 §2.2），导致 `PATCH /configs` 的 400 informative 提示不展示给用户。
- **X2 (P3, latent)**：`GET /configs` 的 `200 {"error":...}` fallback 静默渲染空配置（见 §2.4）。
- **X1 (P3, latent)**：`useHealthReady` 对合法 503 "not ready" 抛错，`reason`/`components` 不可达（hook 当前无消费者）。

### 5.4 非配置但影响管理页的结论

- **W1 (P1)**：跨域 WS 升级被 live server 以 HTTP 403 拒绝（`coder/websocket` nil `AcceptOptions` 严格 Origin 校验），5 个实时页面（含 `/tags/stream` 趋势、`/logs` 诊断）对 live server 全部静默失效；根因在服务端，前端无法绕过浏览器 Origin。
- **W2 (P2)**：WS 持续升级失败时无限重连、不向页面报错。

---

## 6. UX / i18n 相关约束（开发时必须遵守）

> 来源 `I18N_UX_AUDIT` + `AUDIT_FIX_REPORT`。新增配置 UI 时须遵循以下规则。

### 6.1 i18n 键命名与结构

- **15 命名空间**：`alerts common config connection dashboard dashboardEditor diagnostics drivers nav rules settings tags topology transports write`。en/zh-CN **键结构完全一致**（AUDIT_FIX_REPORT 后达 609 键，完美对等）。
- **新增配置 UI 的键应落入既有命名空间**：驱动配置→`drivers.*`（建议增设 `drivers.detail.*` / `drivers.edit.*`）、传输配置→`transports.*`（`transports.detail.*`）、规则编辑→`rules.*`（已规划 `rules.col*`、`rules.action*`、待补 `rules.test*` 等）、配置中心→`config.*`（`config.formView`/`yamlCode`/`hotReload`/`reloadSuccess` 等已存在）。
- **必须同时改 en.json 与 zh-CN.json**，保持对等；移除多余 `defaultValue`（一旦键存在）。

### 6.2 表单/交互规范

- **禁止硬编码英文**：`ConfigCenterPage`、`DashboardEditorPage` 此前因未 import `useTranslation` 而整页英文（`I18N_UX_AUDIT P1-2/P1-3`）——新页面必须 `import { useTranslation }` 并全程 `t()`。`TransportsPage.tsx`/`SettingsPage.tsx` 被列为"全量 i18n + 干净 loading/empty 处理"的范本，应参照。
- **状态/质量标签须走 i18n**：`constants.ts` 的 `ConnStateLabel`/`QualityLabel` 此前硬编码英文（影响 6 页），应改为 translation-key map + `<StateBadge>` 组件（`common.connected/disconnected/...` 已存在；`common.good/bad/uncertain` 待补）。
- **list 页 loading/empty/error 三态分支**：`I18N_UX_AUDIT P2-1` —— 列表页须 `isLoading→骨架`、`isError→错误卡 + refetch`、`data && length===0→空态`（detail 页已正确，list 页此前在初始 fetch 期间误显空态）。

### 6.3 无障碍（Accessibility）

- **图标按钮必须有 `aria-label`/`title`**（`P2-4`：DashboardEditor 删除按钮此前无 label）。
- **对话框/抽屉须**：`role="dialog"`、`aria-modal="true"`、`aria-label`、`tabIndex={-1}`、Escape 关闭、focus 管理（参照 `AUDIT_FIX_REPORT M9` 的 drawerRef 模式）。
- **可点击 Card / `<tr>` 须**：`tabIndex`、`aria-label`、`onKeyDown`(Enter/Space)（`AUDIT_FIX_REPORT` UI/UX 修复已对 DriversPage Card、TagExplorerPage tr 落地）。
- **颜色对比**：浅色模式 `--muted-foreground` 已从 46%→42% 亮度以满足 WCAG AA；勿回退。
- **勿仅靠颜色传达状态**：连接点等需配 badge 文本。

### 6.4 其他工程约束

- 写值校验复用 `src/lib/writeValidation.ts`（`AUDIT_FIX_REPORT M8`）。
- localStorage 写入须用 `safePersist`/`safeRemove`（try/catch 防 `QuotaExceededError`，`AUDIT_FIX_REPORT M7/m15`）；拖拽类高频写入须 debounce（300ms，`M5`）。
- React Query 默认 `staleTime: 3000`（`AUDIT_FIX_REPORT P3`），写后须主动 invalidate 相关 queryKey（如 `['configs']`/`['drivers']`/`['rules']`）。
- Monaco 编辑器 CSP 须含 `https://cdn.jsdelivr.net`（`AUDIT_FIX_REPORT P6`），并在 `main.tsx` `loader.config()` 锁版本。
- canvas 图表颜色勿传 `hsl(var(--xxx))`（`AUDIT_REPORT`：lightweight-charts 无法解析 CSS var，须先 `getComputedStyle` 取具体值）。

---

## 7. 已完成 vs 待办

### 7.1 已完成（AUDIT_FIX_REPORT + AUDIT_REPORT "done well" + I18N_UX_AUDIT §6/§7）

- **样式系统**：`@theme inline` 已完整注册 19 个 shadcn 令牌（`I18N_UX_AUDIT §6` 确认 ✅）——**DEVELOPMENT_PLAN P0-1 已修复**。
- **流量图速率**：`TrafficChart` 正确把累计计数器转为 per-second delta 并处理 server 重启复位（`AUDIT_REPORT` "done well" + `API_AUDIT_REPORT §4` WS 正确项）——**P0-3 已修复**。
- **TagExplorer 虚拟化 + 趋势抽屉 + 写值校验**：已实现（`I18N_UX_AUDIT §7` M2 ✅；`AUDIT_FIX_REPORT M8/M9/M11`）——**P1-1/P1-4 已修复**。
- **规则测试沙箱**：已实现（`I18N_UX_AUDIT §7` A3 "test sandbox ✓"）——**proposal A3 的沙箱部分已落地**。
- **ConfigCenter Form+YAML 双模式 + log-level PATCH + hot reload**：已实现（`I18N_UX_AUDIT §7` A6 ⚠️；hot reload 经 `API_AUDIT_REPORT` live 实测 204 正确）。
- **i18n 接线大规模修复**：606→609 键对等；ConfigCenter/DashboardEditor/Rules/WriteControl 等"键已存在但未接线"问题已处理（`AUDIT_FIX_REPORT` i18n Fixes）。
- **代码质量/安全/性能**：tsc 0 错、biome 0 错、69 测试通过、vite build 成功（`AUDIT_FIX_REPORT` 验证结果）；React.memo、staleTime、CSP、类型修复等。
- **写操作错误处理（部分）**：`WriteControlPage.handleConfirmWrite`、`AlertsPage.handleRetryDeadLetter` 已正确 catch（`AUDIT_REPORT` 对比项）。

### 7.2 仍待办（与配置功能相关，重点标注）

- 🔴 **驱动配置表单编辑器**（表单→YAML→`PUT /configs` 热重载）—— `DEVELOPMENT_PLAN 阶段2-1` / `I18N_UX_AUDIT P2-3`。
- 🔴 **传输详情抽屉 + 队列趋势图 + 传输配置编辑**—— `DEVELOPMENT_PLAN 阶段2-2` / `I18N_UX_AUDIT §7 A2`。
- 🔴 **规则编辑器表单（匹配条件+动作+Transform）+ 优先级拖拽**—— `DEVELOPMENT_PLAN 阶段2-3` / `I18N_UX_AUDIT §7 A3`（沙箱已做，编辑器未做）。
- 🟡 **配置中心结构化表单模式的双向同步完善 + 变更 diff 显示 + localStorage 变更历史**—— `DEVELOPMENT_PLAN 阶段2-4/5` / `I18N_UX_AUDIT P3-6`。
- 🟡 **死信批量清除**—— `DEVELOPMENT_PLAN 阶段2-6` / `I18N_UX_AUDIT P2-2`。
- 🟡 **RulesPage toggle 错误处理**（无 catch）—— `AUDIT_REPORT P2-1`（AUDIT_FIX_REPORT 未列入已修）。
- 🟡 **变更类错误展示 CoreC body**—— `API_AUDIT_REPORT A4 (P3)`（未修）。
- 🟡 **`GET /configs` error fallback 处理 / 503 readiness 处理**—— `API_AUDIT_REPORT X1/X2 (P3, latent)`（未修）。
- ⚪ **WS 跨域 403（W1, P1）**—— 需服务端改 `AcceptOptions.OriginPatterns`；前端只能做 same-origin 反代 + 失败提示（W2）。影响实时页，间接影响配置实时性展示。
- ⚪ **API 层按资源拆分 endpoints**—— `DEVELOPMENT_PLAN §六`（随阶段 2 增长再做）。
- ⚪ **告警声效/浏览器通知**—— `DEVELOPMENT_PLAN 阶段2-6` / proposal M3（部分）。

### 7.3 明确推迟（AUDIT_FIX_REPORT "Deferred"，非配置相关但需知）

- S1 bearer secret 存 localStorage（需后端 httpOnly cookie/WS ticket）、S2 WS token 在 URL query（需后端 WS auth 握手）、S4 布局导入形状校验、~103 个废弃 i18n 键、Admin 移动端 sidebar 折叠。

---

## 8. 文档可信度与冲突

### 8.1 主要冲突

| 冲突点 | 文档 A（旧） | 文档 B（新） | 判断 |
|:---|:---|:---|:---|
| Tailwind `@theme` 是否缺失 | `DEVELOPMENT_PLAN P0-1`：缺 `@theme`，600+ 工具类无 CSS，UI 裸奔 | `I18N_UX_AUDIT §6`：`@theme inline` ✅ 完整注册 19 令牌 | **以 I18N_UX_AUDIT 为准**——P0-1 已修复。DEVELOPMENT_PLAN 描述的是修复前初始态。 |
| 流量图是否为速率 | `DEVELOPMENT_PLAN P0-3`：直接绘制累计值，误标 "/s" | `AUDIT_REPORT` done well + `API_AUDIT_REPORT §4`：TrafficChart 正确转 delta + 处理重启复位 | **以新文档为准**——P0-3 已修复。 |
| 规则测试沙箱是否实现 | `DEVELOPMENT_PLAN §三 A3`：无测试沙箱 | `I18N_UX_AUDIT §7 A3`：test sandbox ✓ 已实现 | **以 I18N_UX_AUDIT 为准**——沙箱已落地，仅编辑器/拖拽未做。 |
| ConfigCenter 是否有表单模式 | `DEVELOPMENT_PLAN §三 A6`：仅 YAML，无结构化表单 | `I18N_UX_AUDIT §7 A6`：Form+YAML 双模式已有 | **以 I18N_UX_AUDIT 为准**——双模式已有，但 diff/历史未做。 |
| i18n 键数 | `DEVELOPMENT_PLAN`：110 行/键一致 | `I18N_UX_AUDIT`：378 叶键；`AUDIT_FIX_REPORT`：609 键 | 不冲突——前者指早期，后者指修复后增长。以最新 609 为准。 |
| README vs 实际 | README 宣称"配置中心表单+Monaco 双模式""拓扑交互式六边形"等 | 审计文档显示部分为宣传性表述（如拓扑为静态三列，`DEVELOPMENT_PLAN §三`） | **以审计文档为准**，README 不可作为实现状态依据。 |

### 8.2 可信度排序与取信原则

1. **API 能力/端点事实** → 以 `API_AUDIT_REPORT`（live 实测，2026-09-27）为最高权威；`research-report`/`DEVELOPMENT_PLAN §四` 作背景补充。
2. **前端实现现状（哪些页有/无什么功能）** → 以 `I18N_UX_AUDIT §7` 的逐模块覆盖表为最高权威（最新、逐页核对）。
3. **已修复/未修复** → 以 `AUDIT_FIX_REPORT` 的"已修清单 + Deferred 清单"为准；其未提及的配置 CRUD 项 = 未修。
4. **运行时健壮性缺陷** → 以 `AUDIT_REPORT` 为准（其 "done well" 段也用于判断某项是否已正确）。
5. **规划/路线图** → `DEVELOPMENT_PLAN §五` 是唯一完整分阶段路线图，但其"当前状态总评"（§一）已过时，仅"路线图"与"功能缺口对照表（§三）"中的**配置 CRUD 缺口结论**仍有效。
6. **设计意图/应有形态** → `proposal §二`（定义目标），但不可当现状。

### 8.3 一句话结论

> **配置 CRUD 缺口（驱动/传输/规则表单编辑、规则编辑器、配置 diff/历史、死信批量清除）在 DEVELOPMENT_PLAN、I18N_UX_AUDIT 中被一致且反复确认为"未实现/只读"，且属 DEVELOPMENT_PLAN 阶段 2 的既定待办——后续无需重新识别，应直接进入实现；API 层无端点缺失，但受限于"只能经 `PUT /configs` 全量热重载"的架构约束，CRUD 须实现为表单→YAML→热重载形态；wizard/stepper 式交互在所有文档中均无先例，属新设计。**
