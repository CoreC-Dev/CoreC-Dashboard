# 首页 AI 助手方案

> 状态：**提案，待决策**（对应 ADR-015）。本文给出选型、接口契约、分期与验收口径；未批准前不改代码。
> 写作约定同 `docs/design-docs/`：只写"为什么这样做、边界在哪"，可验证的事实标注出处。

## 1. 目标与区间

在 Dashboard 首页（`/`，`InstancePanel`）加一个可收起的对话面板，做到三件事：

1. **接自定义 AI**：provider（名称/baseURL/模型/密钥）由用户在设置页填写，支持 OpenAI 兼容的 `/chat/completions`（含 SSE 流式），一家都不预置密钥。
2. **能看**：查询驱动/传输/点位/告警/统计/配置，答案里的数字来自 CoreC 的真实响应，不是模型的记忆。
3. **能改**：通过既有 REST 完成配置编辑与写入指令，**每一次改动都给出可审阅的 diff 并由人确认后才发出**。

**不做**：以 AI 替代现有表单与曲线；把模型判断当作数据来源；绕过 `corec` 的校验链（AI 只是另一个客户端，走的仍是同一套 API 与权限）。

## 2. 事实基线（方案据此取舍）

| # | 事实 | 出处 | 对方案的影响 |
|---|---|---|---|
| 1 | `corec-mcp` 传输为**纯 stdio**，且是对 REST 的适配器 | `cmd/corec-mcp/main.go` `serve(os.Stdin, os.Stdout)` | MCP **不进浏览器运行时路径**；它是桌面 MCP 客户端的宿主 |
| 2 | MCP 10 个工具只有读 + 控制，**无配置写入** | `cmd/corec-mcp/tools.go` 工具清单 | "通过 MCP 配置 CoreC"字面不成立，需先扩 MCP 工具（另案） |
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

## 4. 工具层契约（UI 助手与 MCP 共用同一份定义）

工具清单**照抄** `corec-mcp`，只读在前，写在 `-allow-write` 等价开关后才注册：

| 工具 | REST | 类 | 说明 |
|---|---|---|---|
| `list_drivers` | `GET /drivers` | 读 | 驱动清单与状态 |
| `driver_status` | `GET /drivers/{name}` | 读 | 单驱动（含暂停/调度健康） |
| `list_tags` | `GET /tags?driver=&tag=` | 读 | 点位最新值 |
| `read_tag` | `GET /tags?driver=&tag=`（本地精确匹配） | 读 | 单点精确读 |
| `list_alerts` | `GET /alerts` | 读 | 活动告警 |
| `list_paused_drivers` | `GET /drivers/paused` | 读 | 暂停驱动 |
| `write_tag` | `POST /write` | 写｜需确认 | 写点位；引擎写保护与限速照样生效 |
| `pause_driver` / `resume_driver` | `POST /drivers/{n}/pause\|resume` | 写｜需确认 | 暂停/恢复采集 |
| `ack_alert` | `POST /alerts/ack` | 写｜需确认 | 确认告警 |
| `get_configs` / `get_configs_raw` | `GET /configs`、`/configs/raw` | 读* | 原文只渲染，不整段喂模型（见 §6） |
| `validate_configs` | `POST /configs/validate` | 读* | dry-run 校验；**优先于**直接 apply
| `patch_configs`（建议新增） | `PATCH /configs` | 写｜需确认 | **无写工具前"配置"退化为"读配置 + 给 diff"**，以 `validate_configs` 当校验回执；更适合 AI 的小粒度变更 |
| `apply_configs` | `PUT /configs` | 写｜需确认 | 全量重载；危险，默认**不注册**，开关显式打开 |
| `create_backup` / `restore_backup` | `POST /configs/backups`、`.../restore` | 写｜需确认 | 还原同样危险，默认不注册 |

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

- 大响应默认**摘要化**：`list_tags` 在百级点位时返回"共 N 点，示例前 5 条 + 可按 driver/tag 过滤"；`get_configs_raw` 原文**不在会话里回显**，只作为变更预览的数据源；
- 单次工具结果硬上限（如 64 KiB，超出截断并标注"已截断，可加过滤条件重查"）；
- 工具轮次上限（如 8 步）与总时长上限，超限则停止调用并向用户说明“已停止自动调用”；
- 历史滚动压缩：保留 system + 最近 K 轮，更早的总结为一条摘要消息。压缩是**有损**的，必须让用户能看到"已压缩多少"。

## 7. 前置项与阶段

**前置项（不属于本 UI 需求，需单独决策）**

1. **给 `corec-mcp` 加配置类工具**：`get_configs`、`validate_configs`、`patch_configs`、（可选）`apply_configs`、备份/还原。涉及权限模型（是否只允许 patch 子集、是否禁止 `secret` 字段回显/修改）、审计（谁改的、AI 还是人）、与 `write-min-interval` 等节奏约束的关系。**在此之前，"通过 MCP 配置"应表述为"通过 MCP 查询 + 通过 REST 配置"，不要对外承诺后者。**
2. **ADR-005 复核触发条件**：AI 助手若启用写类工具，等于在无鉴权公网部署上增加一个"自主可写的客户端"。建议届时一并评估"是否要求启用 AI 写工具时至少配 `api.secret` + 反代认证"。

**分期**

| 期 | 内容 | 出口标准 |
|---|---|---|
| P1 | 只读助手：provider 配置、对话面板、6 只读工具、摘要化、轮次上限、i18n、error 呈现 | 断网 provider 给出可行动提示；工具结果与 `curl` 同一端点一致；不写任何 CoreC 状态 |
| P2 | 写类工具（含人工确认卡与 diff 预览），默认关闭、需显式开启 | 只读点写入被引擎以 `is read-only` 拒绝且原样可见；429 原样呈现；拒绝写入则绝不发出请求（网络面板为证） |
| P3 | （跨仓）MCP 配置类工具 + 助手改用 patch | 见前置项 |
| P4 | 可选：会话持久化、提示词模板、可完全离线且本地分身 |

## 8. 验收口径（P1）

1. **零 CoreC 改动**：后端 `hub/`、`core/` 无 diff；助手只经既有端占。
2. **零新增重型依赖**：不引入 OpenAI/Anthropic SDK 或整套 web-SDK，对话层是对 `/v1/chat/completions` 的一次流式 `fetch`。可加零或极端轻的手写实现。
3. **不新开关也安全**：provider key 只在 localStorage、仅显式披露；不新增跨域转发面（CSP 不再放宽）。
4. **诚实性**：工具失败的引擎原话必现；不以“已成功”概括一次部分失败；截断/压缩要显式标注。
5. **一致性**：不引入第二份 CoreC 类型/字段定义（现有 `src/types/config.ts` 与 `src/api/endpoints` 为准）。
6. **门禁**：`lint`/`typecheck`/`custom:lint`/`docs:lint`/`vitest`/`test:server` 全过。

## 9. 已知风险（明示，不隐瞒）

- **密钥落在 localStorage 的 XSS 风险**：沿用既有姿态（实例 key 已如此）。新增的是**一个**第三方 key，不是新模式；但用户应知悉“本机浏览器被攻破即 provider key 泄露”。
- **无鉴权部署下写工具 = 能访问 UI 者皆可写**：P2 默认关闭、需显式开，且一次性使用确认卡；仍不构成对 ADR-005 的补救，只是不让新增面扩大既有敞口。
- **模型可能编造设备参数**：所有数字必须来自工具结果；UI 不呈现模型的"记忆数字"，工具结果在界面中以引用块独立呈现。
- **MCP 与助手能力面漂移**：两边工具定义若各写一份，迟早不一致。§4 的"共用同一份定义"是硬要求，不是建议。

