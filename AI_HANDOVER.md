# CoreC-Dashboard 项目 AI 深度交接与架构文档 (AI Handover Guide)

> **致接手的 AI 助手 / 开发者**：
> 本文档是 **CoreC-Dashboard** 工业物联网监控控制台前端的完整技术交接说明。它记录了项目架构、代码拓扑、核心设计决策、关键避坑经验、部署运维流程以及已知问题修复历史，帮助你在接手时零延迟理解并继续迭代。
>
> **配套后端文档**：CoreC 核心引擎的交接文档位于 `/workspace/codespace/CoreC/AI_HANDOVER.md`，二者通过 REST API + WebSocket 契约耦合。本文档聚焦前端。

---

## 1. 项目定位与核心哲学

### 1.1 什么是 CoreC-Dashboard？

**CoreC-Dashboard** 是为 [CoreC](../CoreC/) 工业数据采集核心量身打造的 Web 监控与控制中台。它是一个**纯前端 SPA**，通过标准 REST API 与 WebSocket 直接与 CoreC 守护进程通信，零中间依赖。

**双空间设计**：
- **前台监控空间** (`/monitor`)：面向车间操作员的大屏展示——总览仪表盘、实时测点看板、告警面板。
- **后台管理空间** (`/admin`)：面向工程师的配置管理——驱动/传输/规则的 CRUD 向导、配置中心、诊断终端、拓扑图。

### 1.2 核心设计哲学

| 原则 | 体现 |
|:---|:---|
| **纯前端 SPA 直连** | 零中间层，浏览器直接调 CoreC REST/WS。生产部署可选自带反向代理（`server.mjs`）消除 CORS/CSP/端口阻断。 |
| **Fail-Closed 安全** | 401 认证失败立即清除 secret 并跳转 `/login`，绝不留冻结的陈旧视图（工控安全要求）。 |
| **配置双模式** | 表单微调（结构化编辑） + Monaco YAML 编辑器（全量编辑），同一 `configStore` 底层。 |
| **路由级代码分割** | 每个页面是独立 chunk（`React.lazy + Suspense`），首屏只加载 `/monitor/dashboard` 所需代码。 |
| **恒定渲染安全** | Zustand selector 必须返回稳定引用（详见 §4.1 避坑），否则触发 React #185 无限循环。 |
| **工业级弹性** | WebSocket 指数退避重连（±20% 抖动）、消息速率限制（500 msg/s 滑窗）、请求超时（15s AbortController）。 |

### 1.3 技术栈

| 模块 | 技术 | 版本 |
|:---|:---|:---|
| 框架 | React | 19.2 |
| 语言 | TypeScript (strict) | ~6.0 |
| 构建 | Vite (rolldown) | 8.3 |
| 样式 | Tailwind CSS v4 + Radix UI (shadcn/ui) | 4.3 |
| 状态 | Zustand (无中间件，纯 `create<T>((set,get)=>...)`) | 5.0.15 |
| 数据请求 | TanStack Query (React Query) | 5.104 |
| 表单 | react-hook-form + zod | 7.89 / 4.6 |
| 路由 | react-router-dom | 7.18 |
| 图表 | Recharts + TradingView lightweight-charts | 3.10 / 5.2 |
| 编辑器 | Monaco Editor (@monaco-editor/react) | 4.7 |
| 终端 | xterm.js (@xterm/xterm) | 6.0 |
| 国际化 | react-i18next | 17.0 (zh-CN / en，1056 键) |
| 测试 | Vitest + @testing-library/react + jsdom | 5.0 / 16.3 / 25 |
| Lint | Biome | 2.5 |

---

## 2. 项目代码结构拓扑

```
CoreC-Dashboard/
├── server.mjs                    # 生产部署反向代理（静态文件 + /corec-api HTTP 代理 + WebSocket 升级转发）
├── index.html                    # HTML 入口 + Content-Security-Policy 头
├── vite.config.ts                # Vite 配置（别名 @/、dev proxy /corec-api、manualChunks 分包）
├── biome.json                    # Lint/Format 配置（recommended 预设，部分规则降级）
├── tsconfig.app.json             # TS 严格模式配置（strict: true，bundler resolution）
├── package.json                  # 39 deps + 14 devDeps
│
├── src/
│   ├── main.tsx                  # 应用入口（createRoot + StrictMode + Monaco CDN loader 配置）
│   ├── App.tsx                   # 路由树 + RequireConnection 守卫 + 路由级 ErrorBoundary
│   ├── index.css                 # Tailwind 全局样式 + CSS 变量（暗/亮主题）
│   ├── App.css                   # 补充样式
│   │
│   ├── api/                      # ── API 层 ──
│   │   ├── client.ts             # apiRequest<T>() 封装：Bearer auth + 15s 超时 + 401 clearAuth + 204 处理
│   │   ├── websocket.ts          # CoreCWebSocket 类：指数退避重连 + 500msg/s 速率限制 + onStatus 回调
│   │   ├── endpoints/index.ts    # 所有 REST 端点函数（getDrivers, getConfigs, validateConfigs…）
│   │   └── hooks/index.ts        # TanStack Query hooks（useDrivers, useConfigs, useValidateConfig…）含 refetchInterval
│   │
│   ├── stores/                   # ── Zustand 状态管理（均无中间件）──
│   │   ├── configStore.ts        # 工作配置状态：workingConfig / savedConfig / dirty + 实体 CRUD + YAML 序列化
│   │   ├── connectionStore.ts    # 连接状态：baseUrl / secret / isConnected + localStorage 持久化 + revalidate
│   │   ├── dashboardStore.ts     # 大屏编辑器布局状态（localStorage 持久化）
│   │   └── themeStore.ts         # 主题模式（system / dark / light）
│   │
│   ├── hooks/
│   │   └── useConfigValidation.ts # 配置验证 + 派生 selector hooks（useTransportNames / useDriverNames…）
│   │
│   ├── features/                 # ── 页面（路由级 chunk）──
│   │   ├── login/
│   │   │   └── ConnectionPage.tsx        # 连接设置页（输入 CoreC URL + Secret）
│   │   ├── monitor/                       # 前台监控空间
│   │   │   ├── DashboardPage.tsx          # 总览大屏（KPI + 吞吐图 + 内存图 + 驱动/传输矩阵 + 告警）
│   │   │   ├── TagExplorerPage.tsx        # 实时测点看板（虚拟化表格 + WS 高亮 + 反向控制下发）
│   │   │   └── AlertsPage.tsx            # 告警与死信队列
│   │   └── admin/                         # 后台管理空间
│   │       ├── DriversPage.tsx            # 南向驱动列表
│   │       ├── DriverDetailPage.tsx       # 驱动详情 + 点位寄存器
│   │       ├── DriverWizard.tsx           # 驱动创建/编辑向导
│   │       ├── TransportsPage.tsx         # 北向传输列表
│   │       ├── TransportDetailPage.tsx    # 传输详情
│   │       ├── TransportWizard.tsx        # 传输创建/编辑向导
│   │       ├── RulesPage.tsx              # 规则编排列表
│   │       ├── RuleWizard.tsx             # 规则创建/编辑向导
│   │       ├── RuleGroupEditor.tsx        # 规则组编辑器
│   │       ├── RuleProviderEditor.tsx     # 规则提供者编辑器
│   │       ├── WriteControlPage.tsx       # 控制下发 + 死信重试
│   │       ├── ConfigCenterPage.tsx       # 配置中心（表单 + Monaco YAML 双模式）
│   │       ├── GlobalConfigEditor.tsx     # 全局配置编辑器
│   │       ├── NodeConfigEditor.tsx       # 节点配置编辑器
│   │       ├── DashboardEditorPage.tsx    # 大屏可视化编排器
│   │       ├── TopologyPage.tsx           # 拓扑架构图
│   │       ├── DiagnosticsPage.tsx        # 系统诊断终端（xterm + Prometheus + pprof）
│   │       ├── SettingsPage.tsx           # 系统设置（连接/语言/主题）
│   │       └── pages_render_smoke.test.tsx # 渲染冒烟回归测试（#185 守卫）
│   │
│   ├── components/
│   │   ├── ErrorBoundary.tsx     # 全局 + 路由级错误边界（keyed on pathname）
│   │   ├── layout/
│   │   │   ├── AdminLayout.tsx   # 后台布局（TopBar + Sidebar + Outlet）
│   │   │   ├── MonitorLayout.tsx # 前台布局（TopBar + Tab导航 + Outlet）
│   │   │   ├── Sidebar.tsx       # 后台侧边栏导航
│   │   │   └── TopBar.tsx        # 顶部栏（连接状态 + 语言 + 主题）
│   │   ├── wizard/
│   │   │   ├── Wizard.tsx                  # 向导通用容器（步骤导航）
│   │   │   ├── ValidationBanner.tsx        # 配置验证结果横幅
│   │   │   ├── ConfigApplyConfirmationDialog.tsx # 配置应用确认对话框（YAML diff）
│   │   │   ├── EntitySearchBar.tsx         # 实体搜索栏
│   │   │   ├── SettingsFieldRenderer.tsx   # 动态字段渲染器
│   │   │   ├── KeyValueField.tsx           # 键值对编辑器
│   │   │   └── TagListField.tsx            # 标签列表编辑器
│   │   ├── charts/
│   │   │   ├── TrafficChart.tsx  # 吞吐面积图（WS /traffic 实时数据）
│   │   │   └── MemoryChart.tsx   # 内存监控图（WS /memory 实时数据）
│   │   └── ui/                   # shadcn/ui 基础组件（18个：button, card, dialog, select, tabs, tooltip…）
│   │
│   ├── lib/                      # ── 纯函数工具库（均有单元测试）──
│   │   ├── constants.ts          # 数据类型映射、质量码、连接状态、协议列表、DEFAULT_COREC_URL
│   │   ├── configYaml.ts         # YAML 序列化/反序列化 + 实体 CRUD 纯函数（upsert/remove/find）
│   │   ├── configSchema.ts      # zod 全量配置校验（validateFullConfig）
│   │   ├── configTemplates.ts   # 配置模板（新建空白配置的默认值）
│   │   ├── entityValidation.ts  # 实体名称唯一性 + 字段校验
│   │   ├── settingsRegistry.ts  # 驱动/传输类型的设置字段元数据注册表
│   │   ├── ruleExprValidator.ts # 规则匹配表达式 DSL 校验器
│   │   ├── transformExprValidator.ts # 转换表达式校验器
│   │   ├── prometheus.ts        # Prometheus 文本指标解析器
│   │   ├── writeValidation.ts   # 写入指令校验
│   │   └── utils.ts             # cn() 类名合并 + formatBytes/Number/Uptime
│   │
│   ├── types/                    # ── TypeScript 类型定义 ──
│   │   ├── config.ts            # CoreCConfig 顶层 + DriverConfig / TransportConfig / RuleConfig 等
│   │   ├── models.ts            # 运行时模型（DataPoint, DriverStatus, TransportStatus, RuleStat, LogEvent…）
│   │   ├── api.ts               # API 响应类型（ServerInfoResponse, ConfigSummaryResponse…）
│   │   └── dashboard.ts         # 大屏编辑器类型（DashboardCard, DashboardLayout）
│   │
│   └── i18n/
│       ├── index.ts             # i18next 初始化（localStorage 持久化语言，默认 zh-CN）
│       ├── en.json              # 英文翻译（1056 键）
│       └── zh-CN.json           # 中文翻译（1056 键）
│
├── *.md                          # 历史 audit 文档（见 §7）
└── dist/                         # 构建产物（gitignore）
```

**代码规模**：107 源文件，~24,163 行 TS/TSX，18 个测试文件 / 309 测试用例。

---

## 3. 核心架构与数据流模型

### 3.1 整体数据流

```
浏览器
  │
  ├── REST (fetch) ──────→ apiRequest() ──→ connectionStore.baseUrl + Bearer secret
  │                          │                  │
  │                          │                  └── 15s AbortController 超时
  │                          │                  └── 401 → clearAuth() → 跳 /login
  │                          │
  │                          ├── endpoints/index.ts → CoreC :9090 REST API
  │                          └── hooks/index.ts → TanStack Query (refetchInterval 轮询)
  │
  └── WebSocket ──────────→ CoreCWebSocket ──→ ws://baseUrl/path?token=secret
                               │                  │
                               │                  ├── 指数退避重连 (1s→30s, ±20% 抖动, max 10 次)
                               │                  ├── 500 msg/s 滑窗速率限制 (丢弃超量)
                               │                  └── onStatus 回调 (connecting/open/closed/error/rejected)
                               │
                               └── 消费者:
                                     /logs        → DiagnosticsPage (xterm 终端) + AlertsPage
                                     /tags/stream → TagExplorerPage (实时测点高亮)
                                     /traffic     → TrafficChart (吞吐图)
                                     /memory      → MemoryChart (内存图)
```

### 3.2 状态管理架构

四个独立的 Zustand store，**全部无中间件**（纯 `create<T>((set, get) => ({...}))`）：

#### connectionStore — 连与会话状态
```
baseUrl / secret          → localStorage 持久化 (key: "corec_connection")
isConnected / isConnecting → 启动时 revalidate() 探测 GET / 确认凭证有效性
lastError / serverVersion  → 连接探测结果
clearAuth()               → 401 时调用，清 secret → RequireConnection 跳 /login
```

#### configStore — 配置编辑状态（核心）
```
workingConfig  ← 用户正在编辑的配置（路径A: GET /configs/raw → loadFromConfig；路径B: 上传YAML → loadFromYaml）
savedConfig    ← 最后成功 PUT 的配置（用于 diff/revert）
dirty          ← workingConfig ≠ savedConfig（JSON.stringify 深比较）
error          ← 最后一次操作错误

实体 CRUD:     upsertDriver / removeDriver / upsertTransport / removeTransport / upsertRule…
节更新:        updateGlobal / updateNode / updateGlobalField / updateNodeField
保存/回退:     markSaved() / revert()
YAML 序列化:   getWorkingYaml() / getSavedYaml()
查找:          findDriver / findTransport / findRule / is*NameUnique
```
**关键**：所有实体 CRUD 委托给 `lib/configYaml.ts` 纯函数，configStore 只管理状态引用。

#### dashboardStore — 大屏编辑器布局
localStorage 持久化（`corec_dashboard_layout`），卡片位置/大小/类型。

#### themeStore — 主题
`system`（跟随 `prefers-color-scheme`）/ `dark` / `light`，localStorage 持久化。

### 3.3 路由架构

```
/login                        → ConnectionPage (公开)
/monitor                      → MonitorLayout (RequireConnection 守卫)
  /monitor/dashboard          → DashboardPage
  /monitor/tags               → TagExplorerPage
  /monitor/alerts             → AlertsPage
/admin                        → AdminLayout (RequireConnection 守卫)
  /admin/drivers              → DriversPage
  /admin/drivers/:name        → DriverDetailPage
  /admin/transports           → TransportsPage
  /admin/transports/:name     → TransportDetailPage
  /admin/rules                → RulesPage
  /admin/write                → WriteControlPage
  /admin/dashboard-editor     → DashboardEditorPage
  /admin/config               → ConfigCenterPage
  /admin/topology             → TopologyPage
  /admin/diagnostics          → DiagnosticsPage
  /admin/settings             → SettingsPage
/                             → 重定向 /monitor/dashboard
*                             → 重定向 /monitor/dashboard
```

**守卫逻辑**（`RequireConnection`）：
1. 无 `baseUrl`/`secret` → 跳 `/login`
2. `isConnecting` 且未 `isConnected` → 显示加载探测（刷新时不弹跳到 /login）
3. 有凭证但 `!isConnected`（401 清除 / 探测失败）→ 跳 `/login`
4. `isConnected` → 渲染子路由

**路由级 ErrorBoundary**：每个路由用 `key={pathname}` 包裹 `<ErrorBoundary>`，单个页面崩溃不会砖掉整个应用（导航仍可用），切换路由自动重置边界状态。

### 3.4 API 契约（CoreC 后端）

| 方法 | 路径 | 用途 | 前端 hook |
|:---|:---|:---|:---|
| GET | `/` | 服务器信息（名称/版本） | `useServerInfo` (30s) |
| GET | `/healthz/ready` | 就绪探针 | `useHealthReady` (5s) |
| GET | `/configs` | 配置摘要（redacted） | `useConfigs` |
| GET | `/configs/raw` | 原始配置（含 secrets，需认证） | `useConfigRaw` |
| PUT | `/configs` | 全量配置热重载 | `useUpdateConfig` |
| PATCH | `/configs` | 运行时日志级别调整 | `usePatchConfig` |
| POST | `/configs/validate` | 配置校验 | `useValidateConfig` |
| GET | `/drivers` | 驱动列表 | `useDrivers` (5s) |
| GET | `/drivers/:name` | 驱动详情 | `useDriver` (5s) |
| GET | `/drivers/:name/tags` | 驱动点位 | `useDriverTags` (3s) |
| GET | `/transports` | 传输列表 | `useTransports` (5s) |
| GET | `/transports/:name` | 传输详情 | `useTransport` (5s) |
| GET | `/tags` | 全局测点 | `useTags` (5s) |
| POST | `/write` | 下发控制指令 | `useWriteTag` |
| GET | `/write/failed` | 死信队列 | `useDeadLetters` (4s) |
| GET | `/rules` | 规则列表 | `useRules` (5s) |
| PATCH | `/rules/disable` | 启用/禁用规则 | `useToggleRule` |
| GET | `/stats` | 引擎统计 | `useStats` (5s) |
| GET | `/metrics` | Prometheus 指标文本 | — (手动 fetch) |
| WS | `/logs` | 实时事件日志流 | DiagnosticsPage, AlertsPage |
| WS | `/tags/stream` | 实时测点流 | TagExplorerPage |
| WS | `/traffic` | 吞吐量流 | TrafficChart |
| WS | `/memory` | 内存流 | MemoryChart |

---

## 4. 关键设计细节与避坑经验 (Crucial Gotchas)

### 4.1 ⚠️ Zustand selector 必须返回稳定引用（React #185）

**这是本项目最关键的避坑经验。**

Zustand v5 底层用 `useSyncExternalStoreWithSelector`，其 `getSnapshot = () => selector(getState())`。如果 selector **每次调用都创建新引用**（`.map()` / `.filter()` / `?? []` / 对象字面量），则 `Object.is(prev, next)` 永远为 `false` → React 重新渲染 → `getSnapshot` 再调 → 又一个新引用 → **无限循环 → React error #185（Maximum update depth exceeded）**。

**❌ 错误写法**（曾导致 TransportsPage + RulesPage 崩溃）：
```ts
const transportNames = useConfigStore((s) =>
  (s.workingConfig?.transports ?? []).map((tp) => tp.name),  // 每次新数组 → #185
)
```

**✅ 正确写法**（用 `useMemo` 派生，或用 `useShallow`）：
```ts
// 方案1: 选择稳定引用 + useMemo 派生（本项目采用，见 useConfigValidation.ts）
export function useTransportNames(): string[] {
  const workingConfig = useConfigStore((s) => s.workingConfig)  // 稳定引用
  return useMemo(() => (workingConfig?.transports ?? []).map((t) => t.name), [workingConfig])
}

// 方案2: 返回原始稳定引用（string/number/boolean 天然安全）
const dirty = useConfigStore((s) => s.dirty)  // ✅ primitive
const workingConfig = useConfigStore((s) => s.workingConfig)  // ✅ 对象引用（set 时不变则稳定）
```

**回归测试**：`src/features/admin/pages_render_smoke.test.tsx` 使用真实 configStore 渲染 TransportsPage + RulesPage，守卫此 bug 不再复发。

### 4.2 ⚠️ WebSocket 必须经反向代理转发 upgrade 事件

**问题**：生产部署的 `server.mjs` 如果只处理 HTTP 请求而不监听 `server.on('upgrade', ...)`，所有 WebSocket 升级请求会被 Node 静默销毁。前端 `CoreCWebSocket` 重试 10 次后放弃，但**用户看不到任何错误**——因为 DiagnosticsPage 曾在 WS 连接前就静态打印"已连接"横幅。

**修复**（提交 `27768f4`）：`server.mjs` 添加 `proxyUpgradeToCoreC()`，转发 101 Switching Protocols 握手并双向 pipe 原始 TCP socket。

**UX 修复**（提交 `0dad958`）：DiagnosticsPage 初始横幅改为"正在连接..."，添加 `onStatus` 回调显示真实状态（open/error/closed/rejected）。

**教训**：任何"已连接"提示必须在连接**成功后**才显示，不能在连接**尝试前**静态打印。

### 4.3 ⚠️ i18n 必须在测试中初始化

`useTranslation()` 在没有 i18next 实例时会触发 `getSnapshot` 警告，在 jsdom 测试环境中表现为假阳性 #185。所有 `@vitest-environment jsdom` 的渲染测试**必须** `import '@/i18n'`。

### 4.4 配置编辑双路径设计

configStore 支持两种加载路径，**底层状态完全一致**：
- **路径 A**（生产推荐）：`GET /configs/raw` → `loadFromConfig(config)` — 从后端获取完整配置对象
- **路径 B**（离线/导入）：用户上传 YAML 文件 → `loadFromYaml(yaml)` — 解析 YAML 字符串

两种路径加载后，所有实体 CRUD（upsertDriver/removeTransport…）和验证逻辑（`useConfigValidation`）行为完全相同。

### 4.5 401 Fail-Closed 安全模式

`apiRequest()` 在收到 401 时调用 `useConnectionStore.getState().clearAuth()`，清除 localStorage 中的 secret 并将 `isConnected` 置 false。`RequireConnection` 守卫检测到 `!isConnected` 立即重定向到 `/login`。

**为什么不留陈旧视图？** 工控场景下，操作员看到冻结的"看似正常"页面可能误操作。Fail-closed 确保认证失效时立即清场。

### 4.6 Monaco Editor CDN 依赖

Monaco 核心通过 `@monaco-editor/loader` 从 jsDelivr CDN 加载（`main.tsx` 中 `loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs' } })`）。

**要求**：`index.html` 的 CSP `script-src` 和 `style-src` **必须** allow-list `https://cdn.jsdelivr.net`，否则生产环境 CSP 会阻断 Monaco 注入，配置中心编辑器空白。

### 4.7 路由级代码分割 + manualChunks

`vite.config.ts` 用 `manualChunks` 函数手动分割 vendor 库：
- `vendor-recharts` — Recharts + d3 依赖（最大，~365KB）
- `vendor-react` — react-dom + react-router（~261KB）
- `vendor-query` — TanStack Query
- `vendor-radix` — Radix UI 原语

每个页面是独立 chunk（`React.lazy`），首屏 `/monitor/dashboard` 只加载所需代码。`chunkSizeWarningLimit: 500`（默认）保留警告以发现分包回归。

### 4.8 WebSocket 速率限制与背压

`CoreCWebSocket` 内置 500 msg/s 滑动窗口速率限制。超量消息**直接丢弃**（不排队），`droppedCount` 暴露给 UI。DiagnosticsPage 另有 16ms 合并 flush（最多 200 行/帧），防止日志洪泛冻结 UI。

### 4.9 configStore dirty 检测用 JSON.stringify 深比较

`configEqual(a, b)` 用 `JSON.stringify(a) === JSON.stringify(b)` 做深比较。对于配置对象（无函数/undefined/Symbol）这是安全且简洁的。如果未来 config 含非 JSON 安全值，需改用结构化深比较。

### 4.10 生产构建 DEFAULT_COREC_URL 临时覆盖

`src/lib/constants.ts` 中 `DEFAULT_COREC_URL = 'http://127.0.0.1:9090'`（开发默认）。生产部署构建时需临时改为 `http://98.142.250.161:8080/corec-api`（或目标部署地址），构建后**必须恢复**为开发默认值再提交。

**推荐改进**：改用 `vite define` 环境变量注入，避免源码反复改。当前流程是手动 `edit → build → edit restore`。

---

## 5. 构建与部署流程

### 5.1 开发环境

```bash
cd CoreC-Dashboard
npm install          # 或 pnpm install
npm run dev          # Vite dev server :3000，自带 /corec-api → :9090 代理（含 ws:true）
```

开发时 Vite 的 `server.proxy['/corec-api']` 自动转发 HTTP + WebSocket 到本地 CoreC :9090，无需 `server.mjs`。

### 5.2 代码质量检查

```bash
npx tsc --noEmit     # TypeScript 类型检查（strict 模式）
npx biome lint src/  # Biome lint（104 文件，recommended 预设）
npx vitest run       # 全量测试（18 文件 / 309 用例，含 jsdom 渲染测试）
npm run build        # tsc -b && vite build → dist/
```

### 5.3 生产部署（server.mjs 反向代理模式）

**部署架构**：
```
浏览器 → :8080 (server.mjs)
              ├── 静态文件 (dist/)
              ├── /corec-api/* HTTP → :9090 (CoreC)
              └── WebSocket upgrade → :9090 (CoreC)
```

**构建步骤**：
```bash
# 1. 临时覆盖 DEFAULT_COREC_URL 为部署地址
# src/lib/constants.ts: 'http://127.0.0.1:9090' → 'http://<DEPLOY_HOST>:8080/corec-api'

# 2. 构建
npm run build

# 3. 恢复 constants.ts 为开发默认值（git checkout 或手动改回）

# 4. 打包 dist
tar czf dashboard-dist.tar.gz -C dist .

# 5. 上传到服务器
scp dashboard-dist.tar.gz root@<HOST>:/tmp/

# 6. 服务器端部署
ssh root@<HOST> 'cd /opt/corec-deploy/dashboard && \
  pkill -f "server.mjs" && sleep 1 && \
  rm -rf dist && mkdir dist && \
  tar xzf /tmp/dashboard-dist.tar.gz -C dist && \
  nohup node server.mjs 8080 ./dist http://127.0.0.1:9090 </dev/null >dashboard.log 2>&1 &'
```

**启动参数**：`node server.mjs [port=8080] [distDir=./dist] [corecTarget=http://127.0.0.1:9090]`

### 5.4 验证清单

部署后验证：
- [ ] `curl http://<HOST>:8080/` → 200（静态文件）
- [ ] `curl http://<HOST>:8080/corec-api/` → 200（HTTP 代理，含 CoreC JSON 响应）
- [ ] WebSocket 升级测试：`ws://<HOST>:8080/corec-api/logs?token=<SECRET>` → OPEN
- [ ] 浏览器访问，诊断终端显示"正在连接..." → "已连接到事件日志总线..."
- [ ] 触发 CoreC 事件（如 `POST /configs/validate`），诊断终端出现实时日志行

### 5.5 当前部署实例

| 组件 | 地址 | 备注 |
|:---|:---|:---|
| CoreC | `http://98.142.250.161:9090` | Go 二进制，PID 持续运行 |
| Dashboard | `http://98.142.250.161:8080` | `server.mjs` + dist/，反向代理模式 |
| CoreC Secret | `corec-deploy-secret-2026` | Bearer token 认证 |
| 代理前缀 | `/corec-api` | HTTP + WebSocket 均转发 |

---

## 6. 已知问题修复历史

### 6.1 React #185 无限渲染循环（已修复，提交 `86f90f1`）

**症状**：TransportsPage 和 RulesPage 加载即崩溃，报 "Minified React error #185"（Maximum update depth exceeded）。

**根因**：`TransportWizard.tsx:88` 和 `RuleWizard.tsx:129` 的 Zustand selector 在选择器内部 `.map()` 创建新数组，导致 `useSyncExternalStore` 无限重渲染。两个向导即使对话框关闭也始终挂载，所以两个页面一加载就触发循环。

**修复**：替换为已有的 `useTransportNames()` hook（`useMemo` 派生）。

**教训**：见 §4.1。

### 6.2 WebSocket 不经代理转发（已修复，提交 `27768f4`）

**症状**：诊断终端显示"已连接到事件日志总线..."但无任何日志流入。所有 WebSocket 功能（/logs, /alerts/stream, /tags/stream, /traffic, /memory）静默失败。

**根因**：`server.mjs` 只处理 HTTP 请求，无 `server.on('upgrade', ...)` 监听器，WebSocket 升级被 Node 静默销毁。

**修复**：`server.mjs` 添加 `proxyUpgradeToCoreC()` 转发 101 握手 + 双向 pipe TCP socket。

### 6.3 DiagnosticsPage 假性"已连接"横幅（已修复，提交 `0dad958`）

**症状**：即使 WebSocket 连接失败，终端仍显示"已连接到事件日志总线..."。

**根因**：横幅在 WS 连接尝试前静态打印，且未传 `onStatus` 回调。

**修复**：初始横幅改为"正在连接..."，添加 `onStatus` 回调显示真实状态。

### 6.4 配置功能 Path A 集成（已完成，提交 `83997cd`）

**内容**：后端 `GET /configs/raw` + `POST /configs/validate` + executor sentinel-merge；前端 `useConfigRaw` + `useValidateConfig` hook 接入 ConfigCenterPage。红队测试 + 全验证套件通过。

### 6.5 历史 audit 修复（提交 `c3646d8`）

12 个主要 bug + 20 个次要问题修复，涵盖安全、性能、i18n、可访问性。详见 `AUDIT_FIX_REPORT.md`。

---

## 7. 历史文档索引

项目根目录有多个历史 audit/plan 文档，按用途索引：

| 文档 | 用途 |
|:---|:---|
| `README.md` | 项目概览 + 快速启动 + 技术栈 |
| `DEVELOPMENT_PLAN.md` | 开发计划与里程碑 |
| `corec-dashboard-proposal.md` | 项目提案与设计论证 |
| `corec-research-report.md` | 竞品调研报告 |
| `AUDIT_REPORT.md` | 初始代码审计报告 |
| `AUDIT_FIX_REPORT.md` | 审计修复报告（12 bug + 20 minor） |
| `API_AUDIT_REPORT.md` | API 层审计报告 |
| `I18N_UX_AUDIT.md` | 国际化与 UX 审计 |
| `CONFIGURATION_FEATURE_PLAN.md` | 配置功能特性计划（Path A/B） |
| `DOC_DISTILLATION_REPORT.md` | 文档蒸馏报告 |
| `AI_HANDOVER.md` | **本文档** — AI 交接总览 |

---

## 8. 常用命令清单

```bash
# ── 开发 ──
npm run dev              # Vite dev server :3000（含 /corec-api 代理）
npm run build            # tsc -b && vite build → dist/
npm run preview          # 预览构建产物

# ── 质量检查 ──
npx tsc --noEmit         # 类型检查
npx biome lint src/      # Lint
npx biome check src --write --unsafe  # Lint + 自动修复
npx biome format src --write          # 格式化
npx vitest run           # 全量测试
npx vitest run <file>    # 单文件测试

# ── 部署 ──
# 见 §5.3 完整流程

# ── Git ──
git log --oneline        # 查看提交历史
git remote -v            # 查看远程（使用 ghfast.top 代理）
```

---

## 9. 未来演进建议 (Roadmap)

### 短期
- [ ] **`DEFAULT_COREC_URL` 改为环境变量注入**：用 Vite `define` 替代手动 edit constants.ts，避免部署构建时反复改源码。
- [ ] **`server.mjs` 支持 HTTPS/WSS**：当前仅 HTTP，生产环境应加 TLS（或前置 Nginx/Caddy 终结 TLS）。
- [ ] **WebSocket 连接状态全局可见**：当前仅 DiagnosticsPage 显示 WS 状态，可在 TopBar 加全局连接健康指示器。

### 中期
- [ ] **配置 diff 预览增强**：ConfigApplyConfirmationDialog 当前用文本 diff，可升级为结构化字段级 diff。
- [ ] **大屏编辑器持久化到后端**：当前 dashboardStore 仅 localStorage，可存到 CoreC 配置或独立 API。
- [ ] **E2E 测试**：当前仅有单元 + 渲染冒烟测试，可加 Playwright E2E 覆盖关键用户流程。

### 长期
- [ ] **PWA 离线支持**：工控场景可能网络不稳定，Service Worker 缓存 + 离线队列。
- [ ] **多实例 CoreC 管理**：当前单实例连接，可扩展为多实例切换/聚合视图。
- [ ] **权限分级**：前台监控（只读） vs 后台管理（读写）的 RBAC 权限模型。

---

## 10. AI 接手快速检查清单

接手本项目时，按以下顺序确认环境状态：

```bash
# 1. 确认依赖已安装
cd CoreC-Dashboard && ls node_modules/.package-lock.json && echo "deps OK"

# 2. 类型检查通过
npx tsc --noEmit && echo "tsc OK"

# 3. Lint 通过
npx biome lint src/ && echo "lint OK"

# 4. 测试全绿
npx vitest run 2>&1 | grep "Tests"  # 应显示 309 passed

# 5. 构建成功
npm run build && ls dist/index.html && echo "build OK"

# 6. Git 状态干净
git status --short  # 应无未提交改动（除非正在开发）

# 7. 远程同步
git status -sb | head -1  # 应显示 ## main...origin/main（无 ahead/behind）
```

**关键文件优先阅读**：
1. `src/App.tsx` — 路由树 + 守卫逻辑（理解整体结构）
2. `src/stores/configStore.ts` — 配置状态模型（理解核心数据流）
3. `src/stores/connectionStore.ts` — 连接与会话管理（理解认证流）
4. `src/api/client.ts` — API 请求封装（理解 auth/超时/401 处理）
5. `src/api/websocket.ts` — WebSocket 弹性策略（理解重连/背压）
6. `src/hooks/useConfigValidation.ts` — Zustand selector 正确模式（§4.1 避坑）
7. `server.mjs` — 生产部署反向代理（理解 HTTP + WS 转发）

---

*文档生成时间：2026-09-28 | 代码版本：commit `0dad958` (main) | 测试：309 passed | 源文件：107 | LOC：~24,163*
