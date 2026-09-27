# CoreC-Dashboard 开发规划与缺陷审计报告

> 基于 CoreC 后端 Go 源码（`hub/route/*`、`core/types.go` 等）与 CoreC-Dashboard 前端全量源码逐文件审计得出。所有结论均经源码核验，非推测。

---

## 零、验证证据（构建实测）

```
$ npx tsc --noEmit        → exit 0，0 个类型错误（类型层正确）
$ npx vite build          → exit 0，构建成功，产出 45KB CSS / 1.25MB JS
$ grep ".bg-card|.text-muted-foreground|.border-border|.text-foreground|.bg-muted|.text-primary|.bg-primary|.ring-ring" dist/assets/*.css
                          → 0 条匹配（语义色工具类完全未生成 CSS）
$ grep "--color-card" dist/assets/*.css
                          → 0 条匹配（设计令牌未注册）
```

**结论**：构建"成功"但 UI 完全无样式——这正是"bug 很多/特别不完善"的根因。类型与端点对接正确，问题集中在样式系统（P0-1）、运行时状态（P0-2）与功能断链（P0-3/P0-4）。

---

## 一、当前状态总评

| 维度 | 评级 | 说明 |
|:---|:---:|:---|
| 架构骨架 | ✅ 良好 | 路由、API client、WS 封装、stores、i18n 骨架合理，技术栈与 proposal 一致 |
| API 对接 | ✅ 基本正确 | 端点路径、认证方式、WS 消息格式与 CoreC 后端一致 |
| **视觉样式** | 🔴 **完全失效** | Tailwind v4 缺 `@theme`，600+ 语义色工具类不生成 CSS，整个 UI 无色 |
| **数据加载** | 🔴 **刷新即失效** | `isConnected` 重载后为 false，所有 React Query 查询被禁用 |
| 功能完整度 | 🟡 50% | 12 个页面均有实现，但多个核心功能为桩/半成品 |
| 图表正确性 | 🟡 有 Bug | 流量图把累计计数器标注为"/s 速率" |
| 大屏编排 | 🔴 断链 | 编辑器与监控大屏完全脱节，编辑无效果 |

**结论**：初版"能跑但看不清、刷新即空、编排无效"，需系统性修复后才具备演示价值。

---

## 二、已核验的关键缺陷（按严重度）

### P0 — 阻断性缺陷（必须最先修复）

#### P0-1：Tailwind v4 `@theme` 缺失，整个 UI 无样式
- **位置**：`src/index.css`
- **现象**：CSS 仅在 `:root`/`.dark` 的 `@layer base` 定义了 `--background`、`--card`、`--muted-foreground` 等原始 HSL 通道值，但**没有 `@theme` 块**将这些变量注册为 Tailwind v4 设计令牌（`--color-card` 等）。
- **后果**：Tailwind v4 不会为 `bg-card`、`text-muted-foreground`、`border-border`、`text-primary`、`bg-muted`、`ring-ring` 等**任意语义色工具类生成 CSS 规则**。全项目共 **600+ 处** 使用（`text-muted-foreground` 123 次、`border-border` 78 次、`text-foreground` 58 次、`bg-card` 47 次……），导致卡片无背景、文字无颜色、边框不可见，UI 呈现"裸奔"状态。
- **修复**：在 `index.css` 中 `@import "tailwindcss";` 之后添加 `@theme inline { ... }` 块，映射全部 shadcn 令牌：
  ```css
  @theme inline {
    --color-background: hsl(var(--background));
    --color-foreground: hsl(var(--foreground));
    --color-card: hsl(var(--card));
    --color-card-foreground: hsl(var(--card-foreground));
    --color-popover: hsl(var(--popover));
    --color-popover-foreground: hsl(var(--popover-foreground));
    --color-primary: hsl(var(--primary));
    --color-primary-foreground: hsl(var(--primary-foreground));
    --color-secondary: hsl(var(--secondary));
    --color-secondary-foreground: hsl(var(--secondary-foreground));
    --color-muted: hsl(var(--muted));
    --color-muted-foreground: hsl(var(--muted-foreground));
    --color-accent: hsl(var(--accent));
    --color-accent-foreground: hsl(var(--accent-foreground));
    --color-destructive: hsl(var(--destructive));
    --color-destructive-foreground: hsl(var(--destructive-foreground));
    --color-border: hsl(var(--border));
    --color-input: hsl(var(--input));
    --color-ring: hsl(var(--ring));
    --radius-sm: calc(var(--radius) - 4px);
    --radius-md: var(--radius);
    --radius-lg: var(--radius);
    --font-sans: var(--font-sans);
    --font-mono: var(--font-mono);
  }
  ```

#### P0-2：页面刷新后所有数据查询被禁用
- **位置**：`src/stores/connectionStore.ts` + `src/api/hooks/index.ts`
- **现象**：`baseUrl`/`secret` 持久化到 localStorage，刷新后 `getInitialState()` 恢复凭据 → `RequireConnection` 判定通过（`baseUrl && secret` 为真）→ 用户直接进入 `/monitor/dashboard`。但 `isConnected` 初始值为 `false`，而所有 `useXxx` hook 的 `enabled` 都依赖 `isConnected` → **全部查询禁用，页面永远 loading/空**。
- **后果**：用户每次刷新都必须断开重连才能看到数据。
- **修复**：App 启动时若 localStorage 存在凭据，自动做一次 `/` 健康验证并设置 `isConnected`；或将 `isConnected` 也持久化并在启动时异步校验。

#### P0-3：流量图把累计计数器误标为"/s 速率"
- **位置**：`src/components/charts/TrafficChart.tsx` + CoreC `hub/route/traffic.go`
- **现象**：后端 `/traffic` WS 推送 `stats.TotalRead`/`stats.TotalPublish`/`stats.TotalDropped`（`uint64` **单调递增累计值**），但前端直接绘制原始值，图例却写 `"Read / s"`、`"Publish / s"`。
- **后果**：图表是一条只增不减的直线，无法反映实时吞吐速率，严重误导运维。
- **修复**：前端记录上一帧的累计值，计算 `delta = current - prev`，按推送间隔（1s）换算为速率；首帧无法计算时显示 0。

#### P0-4：大屏编排器与监控大屏完全脱节
- **位置**：`src/features/admin/DashboardEditorPage.tsx` + `src/features/monitor/DashboardPage.tsx`
- **现象**：`DashboardEditorPage` 操作 `useDashboardStore`（增删卡片、改 layout），但 `DashboardPage` **完全无视 `dashboardStore`**，使用自己硬编码的固定布局。编辑器里的任何改动对监控大屏**零效果**。
- **后果**："大屏编排"功能名存实亡。
- **修复**：`DashboardPage` 改为从 `useDashboardStore` 读取 `currentLayout.cards`，用 `react-grid-layout` 的 `ResponsiveReactGridLayout`（`isDraggable={false}` 只读模式）按 card.type 渲染对应组件。

---

### P1 — 主要功能缺陷

#### P1-1：TagExplorer 无虚拟化，长列表卡顿
- **位置**：`src/features/monitor/TagExplorerPage.tsx`
- **现象**：直接 `<table>` 渲染全部测点，无虚拟滚动；`@tanstack/react-virtual` 甚至未在 `package.json` 依赖中。proposal 要求万级点位流畅。
- **修复**：安装 `@tanstack/react-virtual`，改用虚拟化行渲染。

#### P1-2：大屏编排器非拖拽（react-grid-layout 已装但未用）
- **位置**：`src/features/admin/DashboardEditorPage.tsx`
- **现象**：`react-grid-layout` 在 `package.json` 依赖中，但编辑器只是"添加/删除"按钮列表，无拖拽、无缩放、无 Grid 布局预览。
- **修复**：用 `ResponsiveReactGridLayout`（`isDraggable`/`isResizable`）实现真拖拽编辑，`onLayoutChange` → `updateCardLayout`。

#### P1-3：TagExplorer WS 测点 Map 键冲突
- **位置**：`src/features/monitor/TagExplorerPage.tsx:48-51`
- **现象**：`setTagMap(prev => ({...prev, [point.tag]: point}))` 仅用 `tag` 名做键。后端 `cache.GetAll()` 也是按 tag 名聚合（注释明确："When two drivers share a tag name, the last one visited wins"）。但 WS `/tags/stream` 会推送每个驱动的独立点位 → 同名 tag 互相覆盖。
- **修复**：WS Map 改用 `${driver}:${device||''}:${tag}` 复合键；展示时按 driver 过滤即可。

#### P1-4：测点详情趋势图缺失
- **位置**：`src/features/monitor/TagExplorerPage.tsx`
- **现象**：proposal 要求点击测点弹出 `lightweight-charts` 时序趋势抽屉，当前未实现（`lightweight-charts` 已装但仅未使用）。
- **修复**：新增测点详情 Drawer，订阅 `/tags/stream?driver=X` 累积该 tag 的时序点，用 lightweight-charts 渲染折线。

#### P1-5：国际化覆盖不全
- **现象**：`zh-CN.json`/`en.json` 键一致（110 行），但大量页面标题/标签为**硬编码英文**（如 `"Southbound Drivers"`、`"Rule Pipeline & Routing"`、`"Configuration Center"`、`"Northbound Transports"` 等），未走 `t()`。
- **修复**：将所有硬编码字符串迁移到 i18n 键，补全两语言文件。

#### P1-6：REST 轮询过于激进，未利用 WS
- **现象**：`useDrivers`/`useTransports`/`useTags` 每 2s REST 轮询；而 `/tags/stream` WS 已能推送实时变更。高频轮询给 CoreC 增加无谓负载。
- **修复**：`/tags` 改为 WS 驱动 + 低频（30s）REST 兜底同步；drivers/transports 可降到 5s 或用 `/stats` 内嵌的 `driver_stats`/`transport_stats`。

---

### P2 — 次要缺陷与打磨项

| # | 位置 | 缺陷 | 修复 |
|:---:|:---|:---|:---|
| P2-1 | `MonitorLayout.tsx:46` | 硬编码 `"Real-time Stream Connected"` 绿点，未检测真实 WS 状态 | 引入全局 WS 状态 store |
| P2-2 | `TopBar.tsx:30-38` | `isFullscreen` 不监听 `fullscreenchange`，Esc 退出后状态不同步 | 添加事件监听 |
| P2-3 | `ConfigCenterPage.tsx:64` | `currentLogLevel` 初始 'info'，未从 `configData.global.log-level` 同步 | `useEffect` 同步 |
| P2-4 | `SettingsPage.tsx:25` | `setConnection` 不校验连通性即持久化 | 保存前调 `/` 验证 |
| P2-5 | 全局 | 无 ErrorBoundary，组件抛错白屏 | 包裹路由级 ErrorBoundary |
| P2-6 | 全局 | 无骨架/加载态、无 404 页 | 加 Skeleton + NotFound |
| P2-7 | `App.tsx` | 无代码分割/懒加载，首屏加载全量 | `React.lazy` + Suspense |
| P2-8 | `WriteControlPage.tsx:97` | 死信重试用 `alert()` 报错 | 改为内联错误提示 |
| P2-9 | `DiagnosticsPage.tsx` | xterm 实例在 React StrictMode 下可能双初始化 | 加 ref 守卫 |
| P2-10 | `api/client.ts` | 无请求超时、无统一 401 处理（401 应跳登录） | 加 AbortController + 401 拦截 |
| P2-11 | `types/models.ts` | `DataPoint.device`/`group` 在 Go 中是 `string`（空值 `""` 非 absent），前端标为可选 `device?`；`RuleStat.targets` 空时序列化为 `null` 非 `[]`；`/drivers/{name}/tags` 未知驱动返回 `{"tags":null}` | 类型对齐 + 空值防御（已部分用 `?.join` 兜底，需系统化） |

---

## 三、功能缺口（对照 proposal）

| proposal 模块 | 当前状态 | 缺口 |
|:---|:---|:---|
| M1 大屏可视化编排 | 🔴 断链 | 编辑器非拖拽、与大屏脱节（P0-4/P1-2） |
| M2 测点虚拟化+趋势 | 🟡 半成品 | 无虚拟化、无趋势抽屉、键冲突（P1-1/3/4） |
| M3 告警音效/通知 | 🟡 部分 | 无浏览器通知、无声效 |
| A1 驱动配置表单编辑 | 🔴 缺失 | 仅只读卡片，无表单编辑→YAML→热重载 |
| A2 传输详情/队列趋势 | 🔴 缺失 | 仅只读卡片，无详情抽屉、无队列趋势图 |
| A3 规则编辑器+沙箱 | 🔴 缺失 | 仅只读列表+启用开关，无编辑、无优先级拖拽、无测试沙箱 |
| A4 死信批量清除 | 🟡 部分 | 仅单条重试，无批量清除 |
| A5 拖拽 Grid 编排 | 🔴 缺失 | 见 P1-2 |
| A6 配置表单模式 | 🟡 部分 | 仅 YAML 模式，无结构化表单模式 |
| A6 变更历史 | 🔴 缺失 | 无 localStorage 快照历史 |
| 拓扑交互图 | 🟡 简单 | 静态三列布局，非真正交互式六边形图 |

---

## 四、已核验的 CoreC API 契约（前端对接基准）

> 以下均经 Go 源码核验，前端类型需严格对齐。**完整契约见 `CoreC/docs/api/COREC_API_CONTRACT.md`（1260 行，子代理产出，含全部 22 端点 + 5 pprof 路由 + 配置 schema + 指标清单 + TS 速查表）。**

### REST 端点
| 方法 | 路径 | 请求体 | 响应体 | 备注 |
|:---|:---|:---|:---|:---|
| GET | `/` | — | `{name,version,status,time,uptime}` | uptime 为 Go Duration 字符串 |
| GET | `/version` | — | `{version}` | |
| GET | `/healthz/live` | — | `{status}` | |
| GET | `/healthz/ready` | — | `{status, reason?, components?}` | |
| GET | `/configs` | — | `{global:{log-level,api:{listen,secret-set}},drivers:[{name,type}],transports:[{name,type}],rules:[{name,type,action,priority}]}` | rules.type 实为 match DSL |
| PUT | `/configs` | `{path?, payload?}` | 204 | payload 为 YAML 全文 |
| PATCH | `/configs` | `{log-level?:...}` (任意键 map) | 204 | |
| GET | `/drivers` | — | `{drivers:[DriverStatus]}` | |
| GET | `/drivers/{name}` | — | `DriverStatus` | |
| GET | `/drivers/{name}/tags` | — | `{tags: Record<tag,DataPoint>}` | |
| GET | `/transports` | — | `{transports:[TransportStatus]}` | |
| GET | `/transports/{name}` | — | `TransportStatus` | |
| GET | `/tags` | — | `{tags: Record<tag,DataPoint>}` | **键为 tag 名，跨驱动同名会覆盖** |
| POST | `/write` | `WriteCommand` | `{success,error?}` | |
| GET | `/write/failed` | — | `{failed_writes:[DeadLetterEntry], count}` | |
| GET | `/rules` | — | `{rules:[RuleStat]}` | |
| PATCH | `/rules/disable` | `{index,disabled}` | 204 | |
| GET | `/stats` | — | `EngineStats` | uptime 为**纳秒数** |
| GET | `/metrics` | — | Prometheus 文本 | |

### WebSocket 端点
| 路径 | 参数 | 推送消息 | 关键点 |
|:---|:---|:---|:---|
| `/tags/stream` | `?driver=X` | 单个 `DataPoint`（每条消息一个） | 非数组 |
| `/logs` | — | `{level,type,payload,timestamp}` | level: -4=debug,0=info,4=warn,8=error |
| `/traffic` | `?interval=1s` | `{read,publish,dropped}` | **累计计数器，非速率** |
| `/memory` | `?interval=1s` | `{alloc,total_alloc,sys,num_gc,goroutines}` | 无 timestamp 字段 |

### 认证
- REST：`Authorization: Bearer <secret>`（恒定时间 SHA256 比较）
- WS：`?token=<secret>`
- secret < 8 字符拒绝启动

### Go 结构体 json tag（前端类型须对齐）
- `EngineStats`: `status,uptime,drivers,transports,rules,total_read,total_publish,total_errors,total_dropped,points_per_sec,driver_stats,transport_stats`
- `DriverStatus`: `name,type,state,last_read,last_error,tag_count,read_count,error_count,reconnect_count`
- `TransportStatus`: `name,type,state,published,failed,received,last_publish,queue_size,dropped_commands`
- `RuleStat`: `index,name,type,match,action,target,targets,priority,disabled,hit_count,hit_at,miss_count,miss_at`
- `DataPoint`: `driver,device,group,tag,value,type,quality,timestamp,metadata,is_stale`

### 序列化陷阱速查（前端类型易错点）

经 Go 源码 + 子代理契约核验，以下字段序列化形式与直觉不同，前端类型/逻辑须特别注意：

| 字段 | 位置 | 序列化形式 | 前端注意 |
|:---|:---|:---|:---|
| `state` | drivers/transports | **整数** 0/1/2/3（无 MarshalJSON） | 已正确处理 |
| `quality` | DataPoint | **整数** 0/1/2 | 已正确处理 |
| `level` | /logs WS | **整数** -8/0/4/8（slog.Level） | 已正确处理 |
| `type` | DataPoint/WriteCommand | **字符串** `"float32"`（有 MarshalJSON） | 已正确处理 |
| `status` | /stats | **字符串** `"running"` | 已正确处理 |
| `uptime` (/stats) | EngineStats | **整数纳秒** ÷1e9 | `formatUptime` 已处理 |
| `uptime` (GET /) | hello | **字符串** `"5m32.1s"` | `formatUptime` 已处理（typeof string 直接返回） |
| `device`/`group` | DataPoint/WriteCommand | 非可选 `string`（空为 `""`） | 前端标可选，逻辑需 `\|\| undefined` 兜底 |
| `targets` | RuleStat | 空时 `null` 非 `[]`（nil slice 无 omitempty） | 须 `?.join` 或 `?? []` |
| `/drivers/{name}/tags` | 未知驱动 | 返回 `{"tags":null}` 非 404 | 前端须 `data?.tags ?? {}` |
| `entrySummary.type` | /configs rules | 存的是 **match 表达式**非协议类型 | 同字段不同语义 |

---

## 五、开发路线图（分阶段）

### 阶段 0：止血修复（让 UI 可见、数据可加载）— 预计 1 轮
1. **P0-1**：添加 `@theme inline` 块，恢复全部语义色
2. **P0-2**：启动时自动校验持久化凭据，修复刷新即空
3. **P0-3**：流量图改为速率（delta 计算）
4. 跑通 `npm install && npm run build && npx tsc --noEmit`，确保零错误
5. 补齐 `@tanstack/react-virtual` 依赖

### 阶段 1：核心体验修复 — 预计 2-3 轮
1. **P0-4 + P1-2**：DashboardEditor 改为真拖拽 Grid，DashboardPage 消费 store 渲染
2. **P1-1**：TagExplorer 虚拟化
3. **P1-3**：TagExplorer 复合键
4. **P1-4**：测点趋势抽屉（lightweight-charts）
5. **P1-5**：i18n 全量覆盖
6. **P1-6**：降轮询、WS 驱动
7. P2 批量打磨（ErrorBoundary、Skeleton、401 拦截、fullscreen 同步等）

### 阶段 2：管理功能补全 — 预计 3-4 轮
1. 驱动配置表单编辑器（表单→YAML→PUT /configs 热重载）
2. 传输详情抽屉 + 队列趋势图
3. 规则编辑器 + 优先级拖拽 + 测试沙箱
4. 配置中心表单模式（结构化编辑 + 双向同步）
5. 配置变更历史（localStorage 快照）
6. 死信批量清除、告警声效/通知

### 阶段 3：成熟度与工程化 — 预计 2 轮
1. 代码分割/懒加载
2. 全局 WS 连接状态 store（MonitorLayout/TopBar 消费）
3. 拓扑页改交互式六边形图
4. 单元测试（Vitest 覆盖 prometheus 解析、utils、stores、api hooks mock）
5. 构建产物体积优化、Dockerfile

---

## 六、架构改进建议

1. **API 层按资源拆分**：当前 `endpoints/index.ts` 单文件 68 行尚可，但随阶段 2 增长应拆为 `endpoints/drivers.ts`、`transports.ts`、`rules.ts`、`configs.ts`、`tags.ts`、`system.ts`。
2. **全局 WS 状态**：新增 `wsStore`（Zustand）统一管理 4 路 WS 连接状态，供 TopBar/MonitorLayout/各页面消费，替代当前各组件自管 WS。
3. **类型对齐校验**：前端 `types/models.ts` 已与 Go json tag 基本一致，阶段 0 后用 `tsc --noEmit` 守护。
4. **请求层增强**：`apiRequest` 加 `AbortController` 超时 + 401 自动跳 `/login` + 统一错误 toast。

---

## 七、验收标准（"成熟"定义）

- [ ] `npm run build` 零错误，`npx tsc --noEmit` 零错误，`npm run lint` 零错误
- [ ] 刷新页面后数据正常加载（无需手动重连）
- [ ] 所有语义色正常渲染（深/浅主题切换正确）
- [ ] 流量图显示真实速率（波动曲线，非直线）
- [ ] 大屏编排器拖拽编辑后，监控大屏实时反映变更
- [ ] TagExplorer 可流畅展示 1000+ 测点（虚拟化）
- [ ] 点击测点可看时序趋势
- [ ] 全部文案随语言切换（中/英）
- [ ] 驱动/传输/规则可在线编辑并热重载
- [ ] 无 console error / warning
