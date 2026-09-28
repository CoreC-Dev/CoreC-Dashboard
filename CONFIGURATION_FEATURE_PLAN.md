# CoreC-Dashboard 配置功能全面审计与实施规划

> **编制方式**：由 4 个独立子 agent 并行深度审计后汇总（配置模型 / HTTP API / Dashboard 现状 / 既有文档），所有结论均经源码与文档交叉验证。关键后端事实已二次核验（`hub/route/server.go` 路由表、`hub/route/configs.go` 摘要结构、`hub/executor/executor.go` 重载逻辑）。
>
> **状态**：规划阶段，待你审阅确认后进入实现。

---

## 一、审计结论速览

### 1.1 CoreC 后端配置能力（强）

CoreC 配置模型丰富且分层清晰，7 个顶层段：`node` / `global` / `drivers` / `transports` / `rules` / `rule-providers` / `rule-groups`，支持 `${ENV_VAR}` 预解析。

- **驱动**：8 种类型（modbus-tcp / modbus-rtu / modbus-tls / opcua / s7 / …），每种有专有字段与强逻辑约束（如 modbus-tls 证书三件套强必填、opcua mode 分支决定可用字段、s7 slot 取值表）。
- **传输**：mqtt / http 两类，mqtt 有 30+ 字段（TLS scheme 强约束、命令鉴权链、链式入站），http 的 url/webhook 互斥必填，另有 parser 三型。
- **规则**：3 种类型（simple / rule-set / sub-rule）× 5 种动作（forward / drop / alert / transform / mirror），match DSL 含运算符/字面量/委托匹配，支持 providers/groups。
- **全局**：log-level/log-format、api（secret≥8 / tls 成对 / CORS / 限速 / pprof）、engine（12 项调优含 on-bad-quality 枚举）、buffer（path 必填 / max-size≥10）。
- **字段间逻辑**：驱动 9 条、传输 10 条跨字段依赖；`settings` 均为 `map[string]any` 动态解析。

### 1.2 CoreC 后端 API 能力（读全、写窄、CRUD 缺）

| 能力 | 现状 |
|---|---|
| 读（GET） | ✅ 完整：configs 摘要 / drivers / transports / rules / tags / stats / metrics / 4 个 WS |
| 数据写 | ✅ `POST /write`（下发标签写入） |
| 配置整体热重载 | ✅ `PUT /configs`（提交完整 YAML，差量应用） |
| 配置局部补丁 | ⚠️ `PATCH /configs` **仅支持 log-level**（硬编码白名单） |
| 规则启停 | ✅ `PATCH /rules/disable`（按 index，唯一字段级真实端点） |
| **驱动 CRUD** | ❌ 无 `POST/PUT/DELETE /drivers`（引擎有 AddDriver/RemoveDriver 但 API 未暴露） |
| **传输 CRUD** | ❌ 无 `POST/PUT/DELETE /transports` |
| **规则 CRUD** | ❌ 无 `POST/PUT/DELETE /rules`（仅 disable/enable） |
| **单实体 reload** | ❌ 无 `POST /drivers\|transports\|rules/:name/reload` |
| **读取完整配置** | ❌ `GET /configs` 仅返回脱敏摘要（drivers/transports 只有 name+type），**无法重建可编辑配置** |
| **dry-run / 校验端点** | ❌ 不存在（`config.validate` 仅内部调用，PUT 直接应用） |
| **引擎生命周期** | ❌ 无 suspend/resume/restart 端点 |
| **配置变更事件推送** | ❌ WS 无此事件类型 |

### 1.3 CoreC-Dashboard 现状（读强、写弱、CRUD 无、向导无）

**实际调用的写端点仅 4 个**：`PUT /configs`、`PATCH /configs`(log-level)、`PATCH /rules/disable`、`POST /write`。**全仓 0 个 DELETE 端点调用。**

| 页面 | 配置写入能力 | 关键缺口 |
|---|---|---|
| DriversPage | ❌ 纯只读列表 | 无新建/删除/启停/重载 |
| DriverDetailPage | ⚠️ 类型化表单（modbus/s7/opcua）→ 拼 YAML → PUT /configs | 不回填当前配置、字段硬编码子集、无 tags 编辑、无校验、无新建/删除 |
| TransportsPage | ❌ 纯只读 | **卡片无 onClick，列表无法跳详情**（🔴 关键 bug） |
| TransportDetailPage | ⚠️ 类型化表单（mqtt/http）→ PUT /configs | 同 DriverDetail 全套缺口 |
| RulesPage | ⚠️ 编辑对话框 + Switch 启停（764 行，功能最丰富） | 无新建/删除、丢多目标、不支持 rule-set/sub-rule、match 无辅助、无 dry-run |
| ConfigCenterPage | ⚠️ Form(log-level) + YAML(Monaco) 双模式 | YAML 不回填服务端实际配置、提交前不解析校验、diff 仅对比本地历史 |
| SettingsPage | ❌ 纯本地偏好（连接/主题/语言/大屏备份） | 不承担 CoreC 全局配置 |
| Topology/Diagnostics | ❌ 纯只读 | — |

**类型层**：`src/types` 只有运行时 Status（DriverStatus/TransportStatus/RuleStat…），**完全没有 Config 结构体**（DriverConfig/TransportConfig/RuleConfig/GlobalConfig/EngineConfig 全缺），编辑表单靠硬编码字段数组。

**基建层**：无 react-hook-form、无 zod；shadcn/ui 有基础件但缺 Form/Textarea/Checkbox/RadioGroup/Combobox/NumberInput/Stepper/Wizard；Monaco + js-yaml 已引入（js-yaml 仅用 dump 未用 load）。

### 1.4 既有文档结论（避免重复劳动）

- `DEVELOPMENT_PLAN 阶段2` 已规划配置 CRUD（驱动表单/传输抽屉/规则编辑器/配置双向同步/变更历史/死信清除），属**既定待办，尚未开始**。
- ConfigCenter 的 diff + 变更历史 **已实现**（DEVELOPMENT_PLAN 的该项 TODO 已完成，以实际代码为准）。
- 规则测试沙箱 **已实现**。
- **所有既有文档均未出现 wizard/stepper/向导术语**——向导式交互是本次新增设计。
- API 端点无缺失（19 REST + 4 WS 全对齐），但**无 per-resource CRUD 端点**是反复确认的核心架构约束。

---

## 二、核心架构约束与风险（必须先决策）

这是整个规划的基石，决定了实现路径：

### 约束 1：无完整配置读取（🔴 阻断性）

`GET /configs` 只返回 name/type 摘要。Dashboard 要"编辑某驱动的 settings/tags"，却**无法从 API 获取该驱动当前的实际配置**。现有 DriverDetail/TransportDetail 编辑表单初始值全空（操作员凭记忆重填），ConfigCenter YAML 编辑器加载的是硬编码样例而非服务端真实配置——**与服务端漂移**。

> **影响**：任何"编辑现有实体"的功能在缺此能力时都是盲操作，极易覆盖/丢失服务端已有配置。

### 约束 2：结构性变更只能全量热重载（🟠 高风险）

无 per-resource CRUD 端点。新增/编辑/删除单个驱动/传输/规则，唯一通路是"读全配置 → 改一项 → `PUT /configs` 提交完整 YAML"。而 `ApplyConfig` 的重载流程是：

```
Suspend(暂停全引擎采集 tick) → diffDrivers(删多余+重建变更) → diffTransports(同) → SetRules(整体替换) → Resume
```

- **非原子、无回滚**：中途失败会留下半应用状态（源码日志明示 "engine state may be inconsistent with currentCfg"）。
- **全引擎 Suspend**：改一个驱动，所有驱动都暂停 tick；变更的实体连接断开重连。
- **无 dry-run**：配置错误只能在应用时暴露，且可能已部分应用。

### 约束 3：热更新粒度受限（🟡 设计约束）

| 可热更新 | 需重启 |
|---|---|
| log-level、drivers[]、transports[]、rules[]、规则 disable/enable、driver tags-file 内容 | api.*(listen/secret/tls/origins/rate-limit/timeouts)、engine.*、buffer.*、rule-providers[]、rule-groups |

> Dashboard 对"需重启"类配置只能展示+提示，不能在线热改（除非后续后端补端点）。

### 风险小结

| 风险 | 等级 | 缓解策略 |
|---|---|---|
| 编辑覆盖服务端真实配置 | 🔴 | 必须先解决"完整配置读取" |
| 全量重载副作用（暂停/断连/半应用） | 🟠 | dry-run 预校验 + 变更影响提示 + 确认 |
| 字段逻辑错误（如 modbus-tls 缺证书） | 🟠 | 前端 zod schema 按类型条件校验 |
| YAML 拼接错误 | 🟡 | 用 js-yaml load 解析校验 + 结构化生成而非手拼 |

---

## 三、战略决策：后端协同 vs 纯前端

审计表明，**纯前端无法安全实现配置 CRUD**——约束 1（无完整配置读取）是阻断性的。两条路径：

### 路径 A：后端补端点（推荐，分两步）

**第一步（最小必备，解锁 Dashboard 编辑）**：
- `GET /configs/raw`：返回完整配置（secret 脱敏为占位），用于回填编辑器。
- `POST /configs/validate`：dry-run 校验（解析 + validate，不应用），返回字段级错误。

**第二步（可选，消除全量重载副作用）**：
- `POST/PUT/DELETE /drivers`、`/transports`、`/rules`：per-resource CRUD，直接调引擎 AddDriver/RemoveDriver/SetRules，避免全引擎 Suspend。
- `POST /drivers\|transports\|rules/:name/reload`：单实体重建。

> 第一步工作量小（复用现有 `config.Load`/`validate`/`GetConfigFunc`），收益巨大；第二步工作量大但能根治副作用。**建议第一步随 Dashboard 同步落地，第二步作为后续优化。**

### 路径 B：纯前端（受限方案）

若后端短期内无法改动，Dashboard 可：
- 从本地持有的"配置副本"编辑（首次需手动导入 YAML 建立基线，之后每次 PUT 前先 GET 摘要对比 name/type 防漂移）。
- 风险：仍无法获取 settings/tags 实际值，编辑现有实体仍部分盲操作。

**本规划采用路径 A 第一步为前提**，并在类型/校验/向导设计上做到后端就绪即可对接；若你选择路径 B，规划中的前端部分（类型、schema、向导、表单）同样适用，仅"回填"环节降级为"本地副本"。

---

## 四、配置能力缺口全景矩阵

> 严重度：🔴 关键 / 🟠 重要 / 🟡 次要。形态：表单 / 向导 / 编辑器 / 确认。

### 4.1 驱动模块

| 缺口 | 严重度 | 建议形态 | 后端依赖 |
|---|---|---|---|
| 新建驱动 | 🔴 | 向导（选协议→连接参数→定义 tags→预览→应用） | 路径 A |
| 删除驱动 | 🔴 | 表单 + 二次确认 AlertDialog | 路径 A |
| 编辑不回填当前配置 | 🟠 | 表单（GET /configs/raw 回填） | 路径 A 第一步 |
| 缺 tags 列表编辑（地址/类型/间隔） | 🔴 | 子表单/表格编辑器 | 路径 A |
| 字段硬编码子集（缺 timeout/byte-order/unit 等） | 🟠 | 类型化表单 + 按 protocol 动态字段 | 无 |
| 缺单驱动 reload/启停 | 🟠 | 按钮/Switch | 路径 A 第二步 |
| 无字段级校验 | 🟡 | zod schema | 无 |
| 不支持协议无降级路径 | 🟡 | 回退原生 YAML 编辑 | 无 |

### 4.2 传输模块

| 缺口 | 严重度 | 建议形态 | 后端依赖 |
|---|---|---|---|
| **列表页无法跳详情** | 🔴 | 卡片包 `<Link>` | 无（纯前端 bug，立即可修） |
| 新建传输 | 🔴 | 向导（选类型→连接/发布参数→可选 parser→预览→应用） | 路径 A |
| 删除传输 | 🔴 | 表单 + 确认 | 路径 A |
| 编辑不回填 | 🟠 | 表单 | 路径 A 第一步 |
| 字段硬编码子集 | 🟠 | 类型化表单 | 无 |
| headers 无格式校验 | 🟡 | 键值对编辑器 | 无 |
| 缺单传输 reload/启停 | 🟠 | 按钮/Switch | 路径 A 第二步 |

### 4.3 规则模块

| 缺口 | 严重度 | 建议形态 | 后端依赖 |
|---|---|---|---|
| 新建规则 | 🔴 | 向导（match→action→target(s)→priority→测试→应用） | 路径 A |
| 删除规则 | 🔴 | 行内删除 + 确认 | 路径 A |
| 编辑丢失多目标 targets | 🟠 | 多目标标签编辑器 | 无 |
| 不支持 rule-set/sub-rule 结构 | 🟠 | 结构化编辑器 | 无 |
| match 表达式无编辑期辅助 | 🟠 | Monaco + 字段补全 + 实时求值 | 无 |
| 编辑无 dry-run 预演 | 🟠 | 预演按钮（复用客户端求值器 + 后端 validate） | 路径 A 第一步 |
| 编辑不回填完整状态 | 🟡 | 表单 | 路径 A 第一步 |

### 4.4 全局配置模块

| 缺口 | 严重度 | 建议形态 | 后端依赖 |
|---|---|---|---|
| ConfigCenter YAML 不回填服务端实际配置 | 🔴 | GET /configs/raw 回填 | 路径 A 第一步 |
| YAML 提交前不解析校验 | 🟠 | js-yaml load + schema 校验 | 无 |
| 无服务端 dry-run | 🟠 | 预演端点 | 路径 A 第一步 |
| PATCH /configs 仅支持 log-level | 🟠 | 表单（扩展可热补丁字段） | 后端扩展白名单 |
| diff 仅对比本地历史 | 🟡 | 拉取服务端实际 YAML 做 diff | 路径 A 第一步 |
| engine/api/buffer 无类型无表单 | 🟠 | 类型化表单（先补类型） | 无（但多为需重启项，仅展示+提示） |
| SettingsPage 不承担 CoreC 全局配置 | 🟡 | 明确职责或在 Settings 补 CoreC 全局区 | 无 |

### 4.5 引擎/批处理/离线缓存/写控制

| 缺口 | 严重度 | 建议形态 | 后端依赖 |
|---|---|---|---|
| engine 配置无 UI（data-bus-size/workers/stale-threshold 等） | 🟠 | 只读展示 + "需重启"提示 | 无 |
| api 配置（listen/rate-limit/secret）无编辑 | 🟠 | 只读 + secret 旋转独立端点 | 路径 A 第二步 |
| offline buffer / batch 配置无 UI | 🟡 | 只读展示 | 无 |
| 写控制策略（concurrency/retry）只读 | 🟡 | 只读说明 | 无 |
| 死信队列无服务端清除 | 🟠 | 后端补 DELETE；前端已具备二次确认 UI | 后端补端点 |

---

## 五、分阶段实施规划

> 每阶段产出可独立验证。阶段间有依赖但可并行准备类型/组件。

### 阶段 0：后端协同必备端点 + 前端基建（地基）

**后端（CoreC 侧，路径 A 第一步）**：
- [ ] `GET /configs/raw`：返回完整配置 YAML/JSON（secret 脱敏为 `***` 占位），用于回填。
- [ ] `POST /configs/validate`：dry-run，复用 `config.Load` + `validate`，返回结构化字段级错误。
- [ ] （可选）`PATCH /configs` 白名单扩展：支持 `log-format` 等可热补丁字段。

**前端基建（Dashboard 侧）**：
- [ ] 引入 `react-hook-form` + `zod`（`package.json` 加依赖）。
- [ ] 补 shadcn/ui 缺失组件：`Form`（FormItem/FormField/FormControl）、`Textarea`、`Checkbox`、`RadioGroup`、`Combobox`、`NumberInput`。
- [ ] 新增 `Stepper`/`Wizard` 向导组件（基于现有 Tabs 封装，支持步骤导航/校验门禁/进度条）。
- [ ] 建立 `src/types/config.ts`：完整 Config 类型体系（DriverConfig/TransportConfig/RuleConfig/GlobalConfig/EngineConfig/BufferConfig/TagConfig/各协议 settings 子类型）——**从 CoreC `core/types.go` + 各驱动/传输 Config 结构体 1:1 映射**。
- [ ] 建立 `src/lib/configSchema.ts`：zod schema，含按类型条件分支的校验（如 `type=modbus-tls` 时证书三件套必填）。
- [ ] 建立 `src/lib/configYaml.ts`：YAML ↔ Config 对象双向转换（用 js-yaml load/dump），替代各页面手拼 YAML。

**验收**：类型能编译通过；zod schema 能拒绝非法配置；Wizard 组件 demo 可跑。

### 阶段 1：配置数据层与 ConfigCenter 重构（回填 + 校验 + dry-run）

- [ ] 新增 `getConfigRaw()` / `validateConfig()` API 封装与 hooks（`useConfigRaw`/`useValidateConfig`）。
- [ ] ConfigCenterPage YAML 模式：启动时 `useConfigRaw` 回填服务端实际配置（替代硬编码样例）。
- [ ] 提交前 `js-yaml load` 解析 + zod schema 校验，错误高亮定位。
- [ ] 提交前可选调 `validateConfig()` dry-run，展示字段级错误后再确认应用。
- [ ] diff 改为对比"服务端实际配置 vs 编辑器内容"（而非本地历史）。
- [ ] ConfigCenterPage form 模式扩展：log-level 之外，展示 engine/api/buffer 只读区 + "需重启"标识。

**验收**：ConfigCenter 能回填真实配置、提交前校验、dry-run 预演、diff 对比服务端。

### 阶段 2：驱动模块（向导式创建 + 表单编辑 + tags 编辑 + 删除）

- [ ] **DriversPage**：新增"新建驱动"按钮 → 触发向导。
- [ ] **DriverWizard**（新组件，4 步）：
  1. 选协议（modbus-tcp/rtu/tls/opcua/s7/…）+ 填 name。
  2. 连接参数（按协议动态渲染字段，zod 条件校验）。
  3. 定义 tags（表格编辑器：name/address/type/group/interval，支持批量增删）。
  4. 预览生成 YAML + dry-run 校验 + 应用（PUT /configs）。
- [ ] **DriverDetailPage** 编辑表单：用 `useConfigRaw` 回填当前 settings + tags；类型化表单替代硬编码字段；字段级校验。
- [ ] DriverDetailPage 新增"删除驱动"（二次确认 AlertDialog）。
- [ ] DriverDetailPage 新增"重载/启停"（若后端第二步就绪；否则提示走全量重载）。

**验收**：能向导式新建驱动（含 tags）、回填编辑现有驱动、删除驱动，全程校验+dry-run。

### 阶段 3：传输模块（向导式创建 + 表单编辑 + 删除 + 列表跳详情修复）

- [ ] **TransportsPage**：🔴 立即修复卡片无 onClick 的 bug（包 `<Link to=transports/:name>`）。
- [ ] 新增"新建传输"按钮 → 向导。
- [ ] **TransportWizard**（新组件，3-4 步）：
  1. 选类型（mqtt/http）+ 填 name。
  2. 连接/发布参数（按类型动态字段；mqtt 含 TLS/鉴权/链式入站条件分支）。
  3. 可选 parser 配置（三型条件渲染）。
  4. 预览 + dry-run + 应用。
- [ ] **TransportDetailPage** 编辑表单：回填 + 类型化 + headers 键值对编辑器 + 校验。
- [ ] 删除传输（二次确认）。

**验收**：列表可跳详情；能向导式新建/编辑/删除传输。

### 阶段 4：规则模块（向导式创建 + 结构化编辑 + 多目标 + 表达式辅助）

- [ ] **RulesPage**：新增"新建规则"按钮 → 向导。
- [ ] **RuleWizard**（新组件，5 步）：
  1. 选类型（simple/rule-set/sub-rule）+ 填 name。
  2. match 表达式（Monaco + 字段补全：从 tags 拉可用字段名 + 运算符提示 + 实时客户端求值预览）。
  3. action 选择（forward/drop/alert/transform/mirror）+ 条件字段（transform 表达式 / alert 级别）。
  4. target(s) 多目标编辑器（forward/mirror 支持多 target）+ priority。
  5. 测试（复用现有沙箱，填模拟 DataPoint 求值）+ dry-run + 应用。
- [ ] 编辑对话框重构：回填完整状态（含 targets 多目标、type、transform）；支持 rule-set/sub-rule 结构化编辑。
- [ ] 行内"删除规则"（二次确认）。
- [ ] match 表达式编辑器：Monaco 替代裸 textarea，提供字段名补全 + 语法高亮 + 实时求值指示。

**验收**：能向导式新建规则（含多目标/复杂 match）、结构化编辑现有规则、删除规则。

### 阶段 5：全局配置与引擎参数（只读展示 + 可热补丁扩展）

- [ ] ConfigCenterPage form 模式：engine/api/buffer 只读展示 + "需重启/可热更新"标识。
- [ ] 可热补丁字段扩展（log-level/log-format 等，随 `PATCH /configs` 白名单扩展）。
- [ ] SettingsPage 明确职责边界：CoreC 全局配置归 ConfigCenter，Settings 仅本地偏好（或在 Settings 新增"CoreC 全局"区链接到 ConfigCenter）。
- [ ] 写控制策略 / offline buffer 状态只读展示。

**验收**：全局配置有清晰只读视图，可热补丁字段可在线改。

### 阶段 6：安全、确认与实时反馈（贯穿，但集中强化）

- [ ] 所有结构性变更（新建/编辑/删除/全量重载）统一走"预览生成 YAML → dry-run 校验 → 影响提示（将暂停引擎/断开 N 个连接）→ 二次确认 → 应用"流程。
- [ ] 应用后通过 WS /logs 或轮询 GET /stats/drivers 反馈重载结果（成功/部分失败）。
- [ ] 变更历史：ConfigCenter 已有 localStorage 快照，扩展为覆盖驱动/传输/规则的所有结构性变更。
- [ ] secret 脱敏：GET /configs/raw 返回的 secret 用占位，编辑时"留空=不变"。

**验收**：所有变更操作有预览+校验+确认+反馈闭环。

---

## 六、向导式交互设计详案

> 向导用于"新建"这类多步、有条件分支、需预览的场景；"编辑现有"用类型化表单（单页可折叠分区）。

### 6.1 通用 Wizard 组件设计

```
Wizard(steps: Step[], onComplete, onCancel)
  ├─ StepHeader（步骤标题 + 进度条 + 当前步/总步）
  ├─ StepBody（当前步内容，受 react-hook-form 控制）
  ├─ StepGuard（zod 校验当前步必填项，未通过禁用"下一步"）
  └─ StepFooter（上一步 | 下一步 | 跳过(可选) | 取消 | 预览YAML(随时) | 完成）
```

- 步骤间状态用 `react-hook-form` 的 `useForm` + `zodResolver` 全局管理，跨步累积。
- 任意步骤可点"预览 YAML"查看当前累积配置生成的完整 YAML（用 `configYaml.ts`）。
- 最后一步固定为"预览 + dry-run + 应用"。

### 6.2 驱动向导（DriverWizard）

| 步 | 内容 | 条件分支 | 校验门禁 |
|---|---|---|---|
| 1 | 选协议 + name | 协议决定后续字段集 | name 非空且全局唯一（查 GET /configs） |
| 2 | 连接参数 | modbus-tcp: host/port/slave-id/timeout/byte-order/unit；modbus-rtu: serial/baud/…；modbus-tls: + 证书三件套；opcua: endpoint/security-policy/security-mode（mode 分支）；s7: host/rack/slot | 按协议 zod 条件校验 |
| 3 | tags 表格 | name/address/type/group/interval；支持批量导入（CSV） | 至少 1 个 tag；address 非空；type 合法枚举 |
| 4 | 预览 YAML + dry-run + 影响提示 + 应用 | — | dry-run 通过方可应用 |

### 6.3 传输向导（TransportWizard）

| 步 | 内容 | 条件分支 | 校验门禁 |
|---|---|---|---|
| 1 | 选类型 + name | mqtt/http | name 唯一 |
| 2 | 连接/发布参数 | mqtt: broker（scheme 决定 TLS）/topic/client-id/qos/username/password（+TLS 证书）；http: url 或 webhook（互斥）/method/headers/batch-size/flush-interval | url/webhook 互斥；TLS scheme 强约束 |
| 3 | parser（可选） | 三型条件渲染 | parser 配置与型匹配 |
| 4 | 预览 + dry-run + 应用 | — | dry-run 通过 |

### 6.4 规则向导（RuleWizard）

| 步 | 内容 | 条件分支 | 校验门禁 |
|---|---|---|---|
| 1 | 选类型 + name | simple/rule-set/sub-rule | name 唯一 |
| 2 | match 表达式 | Monaco + 字段补全（从 GET /tags 拉可用 tag 名）+ 运算符提示 | 表达式非空；客户端求值不报语法错 |
| 3 | action + 条件字段 | forward/mirror: 多 target；transform: 表达式；alert: 级别；drop: 无 | action 必选；forward/mirror 至少 1 target |
| 4 | priority + 测试 | 测试沙箱填模拟 DataPoint 求值 | priority 为整数 |
| 5 | 预览 + dry-run + 应用 | — | dry-run 通过 |

### 6.5 编辑现有实体（表单式，非向导）

- 单页可折叠分区（基础信息 / 连接参数 / tags / 高级），用 `react-hook-form` + zod。
- 字段按 type 动态渲染（与向导步骤 2 同构，复用同一套字段定义组件）。
- 回填：`useConfigRaw` 取完整配置 → 按 name 定位 → 填入表单。
- 保存：生成完整 YAML → dry-run → 影响提示 → 确认 → PUT /configs。

---

## 七、技术选型与基建清单

| 项 | 选型 | 理由 |
|---|---|---|
| 表单管理 | `react-hook-form` | 受控/非受控混合，性能好，与 zod 集成 |
| 校验 | `zod` + `zodResolver` | 类型推导 + 条件分支校验（按 type 切 schema） |
| 向导组件 | 自研 `Wizard`（基于 Tabs） | shadcn 无现成 Stepper；复用现有 Tabs 封装 |
| YAML 处理 | `js-yaml`（load + dump） | 已在依赖；补 load 做解析校验 |
| 表达式编辑 | `@monaco-editor/react` | 已在依赖；ConfigCenter 已有集成范式 |
| 类型来源 | 从 CoreC Go 结构体 1:1 映射 | 保证字段/类型/默认值与服务端一致 |
| diff | 复用 ConfigCenter `computeDiff`（LCS） | 已有，扩展为对比服务端实际 |
| 确认 | 复用 `AlertDialog` 二次确认范式 | WriteControlPage 已有成熟范式 |
| 写入出口 | 统一复用 `useUpdateConfig`（PUT /configs） | 现有 hook，所有配置写入收敛于此 |

**新增依赖**：`react-hook-form`、`zod`、`@hookform/resolvers`。

**新增目录结构建议**：
```
src/
├── types/config.ts                 # 完整 Config 类型体系
├── lib/
│   ├── configSchema.ts             # zod schema（含条件分支）
│   ├── configYaml.ts               # Config ↔ YAML 双向转换
│   └── configDiff.ts               # diff（复用/重构 computeDiff）
├── components/
│   ├── wizard/Wizard.tsx           # 通用向导壳
│   └── ui/{form,textarea,checkbox,radiogroup,combobox,number-input}.tsx
├── features/admin/
│   ├── drivers/DriverWizard.tsx
│   ├── drivers/DriverTagsEditor.tsx
│   ├── transports/TransportWizard.tsx
│   └── rules/RuleWizard.tsx
```

---

## 八、风险与依赖

| 风险/依赖 | 说明 | 对策 |
|---|---|---|
| 后端端点未就绪 | 阶段 1-4 依赖 `GET /configs/raw` + `POST /configs/validate` | 阶段 0 先做后端；或前端用 mock + 本地副本降级 |
| 全量重载副作用 | 单实体变更触发全引擎 Suspend | dry-run + 影响提示；推动后端第二步 per-resource 端点 |
| 类型漂移 | CoreC Go 结构体变更后 TS 类型未同步 | 建立 types 映射说明文档；可选脚本从 Go 生成 TS |
| 非原子重载半应用 | PUT 中途失败留下不一致 | 应用后轮询 /stats + /drivers 验证；提供"重试/回滚到上次成功配置" |
| secret 脱敏 | GET /configs/raw 不能泄露 secret | 后端返回占位；编辑留空=不变 |
| i18n | 新增大量表单/向导文案 | 遵循 I18N_UX_AUDIT 的键命名规范，同步 zh-CN/en |

---

## 九、验收标准（整体）

1. **回填**：所有配置编辑入口能显示服务端当前实际配置（非空、非样例）。
2. **校验**：提交前前端 zod 校验 + 后端 dry-run 双重把关，非法配置无法应用。
3. **CRUD**：驱动/传输/规则均能新建（向导）、编辑（表单）、删除（确认）。
4. **向导**：新建流程多步、有条件分支、带预览与 dry-run。
5. **安全**：所有结构性变更有"预览→校验→影响提示→确认→反馈"闭环。
6. **类型**：`src/types/config.ts` 完整覆盖 CoreC 配置结构，编辑表单类型安全。
7. **修复**：TransportsPage 列表可跳详情。
8. **不破坏**：现有只读页面、规则启停、ConfigCenter diff/历史、规则测试沙箱保持可用。

---

## 十、建议执行顺序与优先级

| 优先级 | 内容 | 阻塞关系 |
|---|---|---|
| P0 | 阶段 0 后端两端点 + 前端类型/zod/Wizard 基建 | 解锁所有后续 |
| P0 | 阶段 3 传输列表跳详情 bug 修复 | 独立，可立即做 |
| P1 | 阶段 1 ConfigCenter 回填+校验+dry-run | 依赖阶段 0 |
| P1 | 阶段 2 驱动向导+编辑+tags+删除 | 依赖阶段 0/1 |
| P1 | 阶段 3 传输向导+编辑+删除 | 依赖阶段 0/1 |
| P2 | 阶段 4 规则向导+结构化编辑+表达式辅助 | 依赖阶段 0/1 |
| P2 | 阶段 5 全局配置只读+可热补丁 | 依赖阶段 1 |
| P2 | 阶段 6 安全确认与反馈闭环 | 贯穿，集中强化 |

---

**请审阅本规划。** 确认后我将按优先级进入实现。需你拍板的关键决策：

1. **后端协同**：是否同意路径 A（CoreC 侧补 `GET /configs/raw` + `POST /configs/validate`）？还是暂用路径 B（纯前端本地副本降级）？
2. **向导范围**：是否所有"新建"都走向导？还是驱动/传输走向导、规则用增强表单？
3. **后端第二步**（per-resource CRUD 端点）是否纳入本期，还是留作后续优化？
4. **优先级**：先做哪个模块（建议驱动，因其配置最复杂、tags 编辑价值最高）？

---

## 十一、实现状态（续会后补记）

> 本节为会话续会后对实际落地情况的核对，与上文规划对照。核对方式：重新安装依赖、运行 `tsc -b` / `biome check src` / `vitest run` / `vite build` 全量验证。

### 11.1 已实现（前端，路径 B）

四个决策在实现中采取的默认取值：**决策 1 = 路径 B**（纯前端本地副本，未改动 CoreC 后端）、**决策 2 = 全部"新建"走向导**、**决策 3 = 不纳入 per-resource CRUD**、**决策 4 = 全模块推进**（驱动→传输→规则→全局/节点→rule-providers/groups→安全闭环）。

| 阶段 | 交付 | 状态 |
|---|---|---|
| 阶段 0 前端基建 | `src/types/config.ts`（Go 1:1 类型）、`configSchema.ts`（zod，48 测试）、`configYaml.ts`（YAML↔Config + 实体 CRUD）、`Wizard.tsx`、shadcn Form/Label/Textarea/Checkbox/RadioGroup、react-hook-form+zod | ✅ |
| 阶段 0 字段元数据 | `settingsRegistry.ts`（8 驱动 + 2 传输全字段，16 测试）、`SettingsFieldRenderer`、`TagListField`、`KeyValueField` | ✅ |
| 阶段 1 ConfigCenter | YAML↔Form 双向桥（导入/导出/上传文件）、提交前 zod 校验 + `ValidationBanner`、`ConfigApplyConfirmationDialog`（YAML 行级 diff + 影响徽章 + 引擎暂停警告，23 测试）、配置模板 `configTemplates.ts`（4 预置场景，15 测试） | ✅ |
| 阶段 2 驱动 | `DriverWizard`（5 步：类型→连接→tags→高级→预览）、`DriversPage` CRUD + 脏状态横幅 + 删除确认 + 跨实体上下文校验 | ✅ |
| 阶段 3 传输 | 🔴 列表跳详情 bug 已修；`TransportWizard`（4 步）、`TransportsPage` CRUD + fallback 跨实体校验 | ✅ |
| 阶段 4 规则 | `RuleWizard`（5 步，action 条件分支）、`RulesPage` CRUD、`ruleExprValidator`（match DSL，25 测试）、`transformExprValidator`（算术表达式，21 测试）、SUB-RULE 循环引用检测 | ✅ |
| 阶段 5 全局/节点 | `GlobalConfigEditor`（log/api/engine/buffer + pprof，需重启徽章）、`NodeConfigEditor`（角色条件分支 + 自动发现禁用提示） | ✅ |
| 阶段 5 rule-providers/groups | `RuleProviderEditor`（文件型 provider CRUD）、`RuleGroupEditor`（手风琴式分组 + 内联规则编辑 + SUB-RULE 快捷填充） | ✅ |
| 阶段 6 安全闭环 | 所有结构性变更统一"预览 YAML → zod 校验 → 跨实体校验 → 影响提示 → 二次确认 → PUT /configs"；`entityValidation.ts`（单实体合并后预校验，10 测试）；`EntitySearchBar` 实体检索 | ✅ |
| i18n | 中英双语 1039 键完全对齐（0 缺失） | ✅ |

**验证结果（续会核对）**：`tsc -b` 0 错误 · `biome check src` 0 错误 · `vitest run` 16 文件 / 300 测试全通过 · `vite build` 成功。

### 11.2 未实现 / 待决策（后端，路径 A 第一步）

**决策 1 未落地**：CoreC 后端未补 `GET /configs/raw` 与 `POST /configs/validate`。当前 Dashboard 的"回填"走路径 B（本地副本 / 上传 YAML / 预置模板），**不自动拉取服务端真实配置**；"dry-run"为前端 zod + 跨实体校验，**无后端 dry-run**。

实现路径 A 第一步**并非规划所述"工作量小"**，存在两个需先解决的硬约束（建议你确认后再动后端）：

1. **密钥脱敏需完整密钥注册表（安全风险）**：CoreC 把传输/驱动配置放在动态 `map[string]any` 的 `settings` 里，密钥字段分散且按类型不同——mqtt 的 `username`/`password`/`command-forward-secret`/`tls-cert|key|ca`、http 的 `headers`（嵌套 `map[string]string`，可能含 `Authorization`）/`webhook-secret`/`webhook-tls-cert|key`、api 的 `secret`。`GET /configs/raw` 必须按类型枚举脱敏，遗漏任一字段即泄露凭据；`headers` 需递归脱敏。
2. **占位回写会破坏凭据（数据完整性风险）**：`PUT /configs` 是全量 YAML 重载（非合并）。若 `GET /configs/raw` 把 `password` 脱敏为 `***`，Dashboard 改一个 tag 后 PUT 回去，重载会把 `password` 持久化为字面量 `***`，破坏 mqtt/http 鉴权。必须在 executor 的 Reload 路径加"哨兵合并"：入站 YAML 中值为 `***` 的密钥字段，用当前活跃配置的同字段值回填后再 Load。该合并同样依赖上面的密钥注册表。

> 结论：路径 A 第一步 = 后端密钥注册表 + `GET /configs/raw` 脱敏 + executor 哨兵合并 + `POST /configs/validate` dry-run + 红队测试（脱敏不泄露 / 合并不破坏）+ 前端 `useConfigRaw`/`useValidateConfig` 接线。前端架构已就绪（`configStore.loadFromConfig()` 即为路径 A 入口），后端就绪即可对接。

### 11.3 验收对照

| 验收项（九节） | 状态 | 说明 |
|---|---|---|
| 1. 回填 | 🟡 部分 | 路径 B 本地副本回填；服务端真实回填待路径 A |
| 2. 校验 | 🟡 部分 | 前端 zod + 跨实体双校验；后端 dry-run 待路径 A |
| 3. CRUD（驱动/传输/规则） | ✅ | 新建向导 + 编辑 + 删除确认 |
| 4. 向导 | ✅ | 驱动 5 步 / 传输 4 步 / 规则 5 步，含条件分支与校验门 |
| 5. 安全闭环 | ✅ | 预览→校验→影响提示→确认→应用 |
| 6. 类型 | ✅ | `src/types/config.ts` 完整覆盖 |
| 7. 修复列表跳详情 | ✅ | TransportsPage 卡片可跳详情 |
| 8. 不破坏 | ✅ | 只读页/规则启停/ConfigCenter diff 历史/规则沙箱保留；构建与 300 测试通过 |
