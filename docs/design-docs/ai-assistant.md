# 实例作用域的 AI 助手方案

> 状态：**已采纳，P1 已实施**（ADR-015）。选型、契约、分期与验收口径见下。
> 实施位置与本文最初设想不同：**不在裸首页**（`/`，`InstancePanel`）——那里没有
> `ConnectionProvider`，`apiRequest` 拿不到活跃连接，任何工具调用都会抛
> "No active CoreC instance"。实际挂在实例作用域的 `AppShell`（`/corec/:id/*`），
> 见 §7。写作约定同 `docs/design-docs/`：只写"为什么这样做、边界在哪"，可验证的事实标注出处。

## 1. 目标与区间

在选中的 CoreC 实例页内（`/corec/:id/*`，`AppShell`）提供可收起的对话面板，做到三件事：

1. **接自定义 AI**：provider（名称/baseURL/模型/密钥）由用户在设置页填写，支持 OpenAI 兼容的 `/chat/completions`（含 SSE 流式），一家都不预置密钥。
2. **能看**：查询驱动/传输/点位/告警/统计/配置，答案里的数字来自 CoreC 的真实响应，不是模型的记忆。
3. **能改**：通过既有 REST 完成设备侧写入与采集控制（`write_tag`/暂停恢复/`ack_alert`），**每一次改动都给出可审阅的调用摘要并由人确认后才发出**。配置文件的写回不在 P1 范围，见 §7。

**不做**：以 AI 替代现有表单与曲线；把模型判断当作数据来源；绕过 `corec` 的校验链（AI 只是另一个客户端，走的仍是同一套 API 与权限）。

## 2. 事实基线（方案据此取舍）

| # | 事实 | 出处 | 对方案的影响 |
|---|---|---|---|
| 1 | `corec-mcp` 传输为**纯 stdio**，且是对 REST 的适配器 | `cmd/corec-mcp/main.go` `serve(os.Stdin, os.Stdout)` | MCP **不进浏览器运行时路径**；它是桌面 MCP 客户端的宿主 |
| 2 | MCP 12 个工具：8 个读（含 `get_configs` / `validate_configs`）+ 4 个控制，**无配置写入** | `cmd/corec-mcp/tools.go` 与 `tools_manifest.json` | 读配置、校验配置两边都有；**写回**配置仍只有 REST，MCP 与助手都没暴露 |
| 3 | 控制面 44 个 REST 端点，含 `PUT/PATCH /configs`、`/configs/validate`、备份恢复 | `hub/route/router.go` | 浏览器侧配置能力**已经存在**，AI 只是调用者 |
| 4 | Dashboard 已有 `server.mjs` 同源代理（`/corec-api` 固定、`/corec-proxy` 动态）与 vite 开发代理 | `server.mjs`、`vite.config.ts` | 不需要为 AI 新增代理架构；需要时只加一条薄路由 |
| 5 | 实例元数据与 API 密钥存 localStorage，UI 明示披露 | `docs/SECURITY.md`「密钥存储（明示披露）」 | provider 密钥同姿态存储**不新增风险类别**，但必须同样明示 |
| 6 | 公网无仪表盘鉴权为**已接受风险**（ADR-005） | `docs/SECURITY.md` | AI 的写类工具必须人确认 + 默认关闭，不能"模型决定" |
| 7 | CSP `connect-src * ws: wss:` | `docs/SECURITY.md`「CSP」 | 浏览器直连第三方 provider 技术上可行 |

## 3. 选型：三条可选，推荐 A

| 方案 | 聊天运行时 | 工具调用 | 复用度 | 新面 | 取舍 |
|---|---|---|---|---|---|
| **A 浏览器直连 + REST 工具层**（推荐） | 前端 `fetch` SSE 到 provider | 封装 `src/api/endpoints` 的白名单工具 | 高：44 端点的封装与校验链全复用 | +1 前端 feature、+1 设置分区 | provider key 在浏览器；无后端 |
| **B 薄代理转发**（可选加固） | 前端 → `server.mjs` 转发 → provider | 同 A | 高 | `server.mjs` +1 同源路由（数十行）、+1 认证 | key 可不落浏览器；不改 CoreC |
| C 后端内置 AI | CoreC 内 | CoreC 内 | 低 | CoreC 新依赖、新密钥、新攻击面、破单二进制 | 违背 core-beliefs（R6 / 单二进制） |

**推荐 A，B 作为"要藏 key 或统一出入口"时的可选加固，C 不推荐。** 理由：A 让 AI 能力与"又一个调用 REST 的视图"同构，复用既有端点封装与校验链，新增面只在 UI 与 provider 适配；B 需要时才加，且落点是已存在的静态服务器而非新服务；C 会把一个可选前端能力变成工业内核的常驻依赖。

**与 MCP 的关系（关键，避免误读）**：
- AI 助手**不经过** MCP。它和 `corec-mcp` 是**同一 REST 面的两个客户端**，能力面与风险面相同，唯一差别是 MCP 已经封装了工具 schema 要不要照抄。
- **照抄的收益**是真实且廉价的：工具名、参数、只读/写分类、错误语义的都直接沿用 `corec-mcp/tools.go`，不必重新发明一套工具命名（`list_drivers`、`read_tag`、`write_tag`……），也避免"MCP 里的工具和 UI 助手里的工具行为不一致"这种长期债务。
- 要让助手能**配置**而 MCP 也能配，缺的那一步是**给 `corec-mcp` 加配置类工具**，那是 CoreC 侧的安全决策（见 §7 前置项），不在本提案范围。

## 4. 工具层契约（已实现的 11 个）

已实现的工具与 `corec-mcp/tools.go` 同名同参数，只读在前，写工具在"允许写操作"开关打开后才注册：

| 工具 | REST | 类 | 说明 |
|---|---|---|---|
| `list_drivers` | `GET /drivers` | 读 | 驱动清单与状态 |
| `driver_status` | `GET /drivers/{name}` | 读 | 单驱动状态 |
| `list_tags` | 带 `driver` 时 `GET /drivers/{name}/tags`，否则 `GET /tags`；**子串/精确过滤在本仓库本地**：`filterPoints(entries, tag, exact)` | 读 | 点位最新值；最多列 50 点（返回 `matched` / `returned` 与 `note`）。`exact:true` 时兼任 `corec-mcp` 的 `read_tag`——精确匹配单点，未命中返回空，不取邻近点 |
| `list_alerts` | `GET /alerts` | 读 | 活动告警 |
| `list_paused_drivers` | `GET /drivers/paused` | 读 | 暂停驱动 |
| `get_configs` | `GET /configs/raw` | 读 | 运行中配置 YAML 原文；受 64 KiB 截断 |
| `validate_configs` | `POST /configs/validate` | 读 | dry-run 校验候选配置，不改状态 |
| `write_tag` | `POST /write` | 写｜需确认 | 写点位；引擎写保护与限速照样生效 |
| `pause_driver` | `POST /drivers/{name}/pause` | 写｜需确认 | 暂停采集 |
| `resume_driver` | `POST /drivers/{name}/resume` | 写｜需确认 | 恢复采集 |
| `ack_alert` | `POST /alerts/ack` | 写｜需确认 | 确认告警 |

> `list_tags` 的过滤位置与 `corec-mcp` 不同，这是刻意的：`corec-mcp` 把 `driver`/`tag` 作为查询串交给服务端过滤；助手按 `driver` 选路由（`/drivers/{name}/tags` 或 `/tags`），`tag` 则取回后在本地过滤。两侧工具名与参数契约由 CoreC 的 `scripts/check-tools-parity.mjs` 对上（差异只在 `coveredBy` 里登记），实现位置不同不进契约。

**助手未实现（不要当成已有能力）**：`get_configs_raw`、`patch_configs`、`apply_configs`、`create_backup`、`restore_backup`。配置**写回**需要先定权限与审计模型（见 §7 前置项），在此之前助手只能"读配置 + 校验配置"。

**与 MCP 工具面对齐的实况**：MCP 12 个工具，助手 11 个，二者**同名 11 个**（助手缺 `read_tag`，该读能力由 `list_tags({exact:true})` 覆盖：精确匹配单个点位，未命中返回空而非邻近点）。

对齐由**另一个仓库**校验，不在本仓 CI 里：CoreC 的 `scripts/check-tools-parity.mjs` 读 CoreC 自己的 `cmd/corec-mcp/tools_manifest.json`（由 Go 测试从 `toolDefs()` 生成），再读本仓的 `src/features/assistant/tools.ts` 做差集，由 CoreC 的 `make parity` / CI doc-gate 任务执行，漂移会红在 CoreC 那边。本仓的 `tools.test.ts` 只断言本仓这一侧（写动词恰好四个、默认不注册、参数 schema 是 object），**它不知道 Go 侧改了什么**——这一点必须说清楚，否则会误以为前端测试在守跨仓契约。

差异登记在 CoreC 那个脚本里：`coveredBy`（`read_tag` → `list_tags`）、`uiOnly`（当前为空）。未登记的任何差异都失败，不自动豁免。

**强制规则（不随配置放宽）**：

- 写类工具只在"允许写入"开关打开后注册；关掉时**不出现在工具清单**（模型连发现都发现不了），与 `corec-mcp` 的 `-allow-write` 一致。
- 每次写类调用先渲染**人可读的变更摘要**（驱动/点位/旧值→新值/目标端点），等待确认才发出；确认超时或拒绝即为“未执行”，把结果如实回传模型，不假装成功。
- 引擎拒绝必须**原样呈现**：`is read-only (protect: read-only)`、`429` + `Retry-After`、`422` 批量全失败、`501` 能力不支持——不摘要、不改写、不重试写类调用（避免"改它一下就好了"的反复敲打）。
- 命令类写入**不**从 `topic` 反向下发；助手只走 REST。

## 5. Provider 配置契约

```yaml
# 概念形态，实际存 localStorage（键：corec_ai_provider），不进配置文件
provider:
  name:      "Our vLLM"                          # 展示名
  base-url:  "http://10.0.0.7:8000/v1"           # OpenAI 兼容前缀
  model:     "qwen2.5-72b-instruct"
  api-key:   "sk-..."                            # 可选（本地无鉴权 provider 可为空）
  headers:   {}                                  # 可选，网关自定义头
  timeout:   "60s"
  # max-tokens、temperature 等其余字段按需可选
```

- **适配面只有一条**：OpenAI Chat Completions + tool-calling（流式 SSE）。其它协议（Anthropic Messages、Ollama 原生、Gemini）**不写适配器**，等用户确有需求再加；"自定义 AI"在这一层面等价于"任意 OpenAI 兼容网关"（vLLM、LiteLLM、one-api、各家云厂商的兼容端点都属此类）。这一点要写进 UI 文案，避免用户以为"支持所有厂商"。
- 连接测试按钮触发一次 `models` 列表或极小 `chat/completions`，超时/`401`/`404` 分别给出可行动提示，不弹裸错误。
- 请求头 `Authorization: Bearer <key>`；key 只存在 localStorage、不写入 CoreC 配置文件、不出现在 `GET /configs` 返回里、不落日志。

## 6. 对话与工具循环

```
用户输入 → 组装 messages（system + 历史 + 本轮）
        → provider 流式返回
        → 有 tool_calls？ 否 → 边流边渲染，结束
                        是 → 逐个工具：读类直接执行；写类先确认
                             → 结果回灌为 tool 消息（截断超限体积）
                             → 回到"provider 流式返回"，直到无 tool_calls 或步数上限
```

**上下文守卫（必须，否则会烧 token / 撑爆窗口）**：

**上下文守卫（已实现）**：

- **单次工具结果硬上限 64 KiB**：超出截断，并在内容里写明"已截断 N 字节，请加过滤条件重查"，让模型知道它没看全。上限按 **UTF-8 字节**计（`KiB` 就是字节；按 `String.length` 计的中文载荷会到三倍）；提示语本身计入上限，否则每条被截断的结果都必然超标。N 是**扣下**的字节数（读者量得出到手多少，量不出扣了多少）。
- **`list_tags` 最多列 50 点**：返回 `matched`（命中数）与 `returned`（本次返回数），超出时另加 `note`："showing 50 of N; narrow by driver/tag"。两个计数分开，是因为它们不等时恰好最要紧——模型若把命中数当成自己的 `tags` 规模，就会对没拿到的那部分回答"缓存里没有"，而那部分它根本没见过。
- **工具轮次上限 8 步**：到顶后停止自动调用，转向用户可见的"已停止自动调用工具"标记，而不是继续追问模型。
- **未实现**：历史滚动压缩与总时长上限。当前会话按轮次线性增长，长对话会累积 token——这是已知缺口，不是既有能力。

## 7. 阶段划分与前置项（截至本轮）

**前置项（不属于本 UI 需求，需单独决策）**

1. **给 `corec-mcp` 加配置类工具**：`get_configs`、`validate_configs`、`patch_configs`、（可选）`apply_configs`、备份/还原。涉及权限模型（是否只允许 patch 子集、是否禁止 `secret` 字段回显/修改）、审计（谁改的、AI 还是人）、与 `write-min-interval` 等节奏约束的关系。**在此之前，"通过 MCP 配置"应表述为"通过 MCP 查询 + 通过 REST 配置"，不要对外承诺后者。**
2. **ADR-005 复核触发条件**：AI 助手若启用写类工具，等于在无鉴权公网部署上增加一个"自主可写的客户端"。建议届时一并评估"是否要求启用 AI 写工具时至少配 `api.secret` + 反代认证"。

**分期**

| 期 | 内容 | 状态 | 出口标准 |
|---|---|---|---|---|
| P1 | provider 配置、对话面板（浮标 + Sheet，移动/桌面共用）、7 只读工具、截断与轮次上限、i18n、错误呈现 | **已实施** | 未配 provider 时只说明不渲染输入框；工具结果与 `curl` 同一端点一致；不写任何 CoreC 状态 |
| P2 | 4 个写类工具（`write_tag`/暂停/恢复/`ack_alert`），默认关闭、需显式开启、每次人工确认 | **已实施，默认关闭** | 只读点写入被引擎以 `is read-only` 拒绝且原样可见；429 原样呈现；拒绝确认则不发出请求 |
| P3 | （跨仓）MCP 配置类工具 + 助手改用 patch | **未做** | 见前置项 |
| P4 | 会话持久化、提示词模板、历史压缩 | **未做** | — |

## 8. 验收口径（P1 + P2 已达成部分）

1. **零 CoreC 改动**：后端 `hub/`、`core/` 无 diff；助手只经既有端占。
2. **零新增重型依赖**：不引入 OpenAI/Anthropic SDK 或整套 web-SDK，对话层是对 `/v1/chat/completions` 的一次流式 `fetch`。可加零或极端轻的手写实现。
3. **不新开关也安全**：provider key 只在 localStorage、仅显式披露；不新增跨域转发面（CSP 不再放宽）。
4. **诚实性**：工具失败的引擎原话必现；不以“已成功”概括一次部分失败；截断/压缩要显式标注。
5. **一致性**：不引入第二份 CoreC 类型/字段定义（现有 `src/types/config.ts` 与 `src/api/endpoints` 为准）。
6. **门禁**：`lint`/`typecheck`/`custom:lint`/`docs:lint`/`vitest`/`test:server` 全过。

## 9. 验证记录与一次记录失误

### 已验证（可复现）

- **时长文法与真实后端对齐**：32 个字符串同时喂给 `isValidGoDuration` 与运行中的 `corec` 的 `POST /configs/validate`，结论 0 处不一致。回归用例在 `configSchema.test.ts` 的 `duration grammar parity with corec`，做了变异验证（把文法改回旧正则，对应 2 条立即失败）。
- **MCP `isError` 语义**：真实 `corec` 上确认 `validate_configs` 的 400 是"判定"而非"故障"，见 CoreC `docs/guide/mcp.md`。
- **工具注册与写开关**：`tools.test.ts` 钉住写动词恰好四个、默认不注册；`AssistantPanel.test.tsx` 钉住未配 provider 时不渲染输入框。

### 本地校验器与后端校验器的关系（2026-11-07，实测）

用 19 份配置对比 `src/lib/configSchema/validators.ts` 的 `validateConfig` 和运行中的 `corec`：后端拒绝、本地放行的有 12 例（`api.secret` 缺失或过短、非法与零值 duration、driver/tag 空名、非法 `type`、拼错的 `protect`、同驱动内 tag 重名、含空格的 `trigger-group`）。

**这个数字容易读错，所以先说明它不意味着"表单会放行坏配置"**：表单的保存路径不走这份本地校验器，走的是 `useValidateConfig()` → `api.validateConfigs()`（`src/api/hooks/index.ts:227`），即 `POST /configs/validate`，由后端判定。我最初按"表单用的是本地校验器"解释这 12 例，并写进了本节；随后查调用点推翻了它——生产路径不经过 `validators.ts`。

所以本地校验器是**离线/辅助路径的第二实现**，不是权威。权威是后端；它与 `schema.ts` 的字段级 zod schema 拼起来，覆盖后端规则的一部分。两边不一致时，**用户看到的最终结论以后端为准**，这也是本文件只把后端实测结果写进"已验证"的原因。

### 未验证（必须说清）

- **真实 AI 服务商链路**。provider 的 SSE 解析、`tool_calls` 分片归并、`tool_choice:"auto"` 的实际行为，全部用假 `fetch`/假服务器测过两个方向（支持 tool_calls 与否），但**没有一个真实厂商端点参与**。不同实现对分片格式、`finish_reason`、并行工具调用的取舍不同，测试测不出来。联调脚本见 `/root/DSH/notes/probe-assistant-provider.mjs`（不在仓库内，需外部端点才有意义）。
- **浏览器实际渲染**。jsdom 不等于浏览器，布局与交互未真机验证。

### 一次记录失误（2026-11-07）

提交 `5fc9171`（`fix(schema): accept the Go durations the server accepts`）的说明**只写了事情的一半**：它陈述了"6 处不一致中 3 处是前端误拒合法值"，随后**没有再写**另外 3 处（`-5s` / `0s` / `00ms`，前端放行、后端拒绝）。

代码本身是完整的——`isValidGoDuration` 里 `startsWith('-')` 与 `isZeroDuration` 两条校验都在（该文件第 68–69 行），测试也覆盖了。**缺的只是说明**。原因是我写说明时被输出中的乱码字符打断，选择了"先提交再补说明"，而补说明那一步没有发生。

不修改这条历史（已推送，重写对读者无益）；在此记录，因为 `git log` 的读者会据此误以为只修复了单向问题。**提交信息也是文档**，它同样受本文档"不说过头话、不省略该说的话"的约束。

## 9. 已知风险（明示，不隐瞒）

- **密钥落在 localStorage 的 XSS 风险**：沿用既有姿态（实例 key 已如此）。新增的是**一个**第三方 key，不是新模式；但用户应知悉“本机浏览器被攻破即 provider key 泄露”。
- **无鉴权部署下写工具 = 能访问 UI 者皆可写**：P2 默认关闭、需显式开，且一次性使用确认卡；仍不构成对 ADR-005 的补救，只是不让新增面扩大既有敞口。
- **模型可能编造设备参数**：所有数字必须来自工具结果；UI 不呈现模型的"记忆数字"，工具结果在界面中以引用块独立呈现。
- **MCP 与助手能力面漂移**：两边工具定义是**两份手抄**（`cmd/corec-mcp/tools.go` 与 `src/features/assistant/tools.ts`），不是共享源码——语言不同。防漂移目前靠一条测试断言两边工具名一致（`tools.test.ts`），它只能保证"名字没分家"，**不能**保证参数与错误语义同步。改 MCP 工具面时必须同步改前端，这条约束写在两处文件的头注释里。

