# CoreC Dashboard — 前端 UI 技术方案

> **项目名称**: corec-dashboard
> **项目路径**: `e:\project\corec-dashboard`
> **定位**: CoreC 工业物联网数据采集与控制核心的 Web 前端管理控制台
> **架构**: 纯前端 SPA 直连 CoreC REST API + WebSocket

---

## 一、技术栈总览

| 类别 | 选型 | 说明 |
|:---|:---|:---|
| **语言** | TypeScript 5.x (strict mode) | 全量类型安全 |
| **框架** | React 19 | 最新稳定版 |
| **构建** | Vite 6 | 极速 HMR，ESBuild + Rollup |
| **路由** | React Router v7 (SPA 模式) | 成熟稳定的客户端路由 |
| **UI 组件** | shadcn/ui + Radix Primitives | 源码拷入，完全可控 |
| **样式** | Tailwind CSS v4 | 原子化 CSS，零运行时 |
| **数据请求** | TanStack Query v5 (React Query) | 服务端状态管理 |
| **客户端状态** | Zustand | 轻量级客户端状态 (主题/布局/WS连接) |
| **图表 (统计)** | Recharts | 声明式 React 图表 |
| **图表 (实时时序)** | TradingView lightweight-charts | Canvas 渲染，万级数据点流畅 |
| **大屏编排** | react-grid-layout | 拖拽式 Grid 布局 |
| **YAML 编辑器** | Monaco Editor (@monaco-editor/react) | VS Code 同款编辑器内核 |
| **日志终端** | xterm.js + xterm-addon-search | 高性能虚拟化终端 |
| **国际化** | react-i18next | 中英双语 (zh-CN / en) |
| **Lint/Format** | Biome | Rust 写的一体化工具，替代 ESLint + Prettier |
| **单元测试** | Vitest | Vite 原生测试框架 |
| **主题** | prefers-color-scheme 跟随系统 + 手动切换 | Light / Dark 双主题 |

---

## 二、功能模块设计

### 前台 (Monitor) — 只读监控视图

#### M1. 监控大屏 (Dashboard)
- **可视化编排**: 后台管理员通过 react-grid-layout 拖拽编排卡片
- **卡片类型**:
  - 📊 KPI 指标卡 (运行状态/Uptime/驱动在线率/传输在线率/采集速率/丢弃数)
  - 📈 实时吞吐曲线 (WS `/traffic` → read vs publish vs dropped)
  - 📉 内存监控曲线 (WS `/memory` → heap/sys/goroutines)
  - 🟢 驱动状态卡 (连接状态指示灯矩阵)
  - 🟢 传输状态卡 (连接状态 + 队列深度)
  - ⚠️ 告警面板 (最近触发 alert 的数据点)
  - 🔢 测点看板 (选定测点的最新值大数字)
- **布局持久化**: 布局 JSON 存 localStorage，后续可存服务端
- **自适应**: 支持全屏投屏模式

#### M2. 实时测点监控 (Tag Explorer)
- **数据表格**: 虚拟化长列表 (TanStack Table + 虚拟滚动)
  - 列: 测点名 | 驱动 | 分组 | 最新值 | 类型 | 质量 | 时间 | 陈旧
- **实时更新**: WebSocket `/tags/stream` 推送，变化高亮闪烁
- **过滤/搜索**: 按驱动筛选、按分组筛选、关键字搜索
- **测点详情抽屉**: 点击展开时序趋势图 (lightweight-charts)

#### M3. 告警与事件 (Alerts & Events)
- **告警列表**: 从规则命中统计和 WebSocket `/tags/stream` 中筛选 alert 动作
- **日志流**: 从 WS `/logs` 筛选 warning + error 级别事件
- **告警音效**: 可选的浏览器通知 + 声音提示

---

### 后台 (Admin) — 完整管理控制台

#### A1. 南向驱动管理 (Drivers)
- **驱动列表/卡片视图**: 名称、协议类型 (Modbus-TCP/RTU/S7/OPC UA)、连接状态指示灯、统计数据
- **驱动详情**:
  - 连接参数概览 (Host, Port, SlaveID, Rack, Slot, Endpoint 等)
  - 该驱动下所有测点的最新值表格
  - 外部标签文件 (tags-file) 路径与热重载状态
  - 历史错误/重连统计图表
- **驱动配置编辑**: 表单式编辑驱动参数 → 生成 YAML → 提交热重载

#### A2. 北向传输管理 (Transports)
- **传输列表/卡片视图**: 名称、协议类型 (MQTT/HTTP)、连接状态、发布统计
- **传输详情**:
  - 连接参数概览 (Broker, Topic, Webhook 等)
  - 批量/刷新/重试配置
  - 备用传输 (Fallback) 关系
  - 离线缓冲状态 (Pending/Drained/Pushed)
  - 队列深度趋势图

#### A3. 规则引擎管理 (Rules)
- **规则优先级列表**: 拖拽排序 (或数字输入排序)
- **规则项展示**: 名称、匹配 DSL、动作、目标传输、命中/未命中统计
- **启用/禁用开关**: 调用 `PATCH /rules/disable` 实时切换
- **规则编辑器**: 表单式编辑匹配条件 + 动作 + Transform 表达式
- **规则测试沙箱**: 输入模拟 DataPoint JSON → 高亮匹配的第一条规则及执行动作

#### A4. 控制下发 (Write Control)
- **控制面板**: 选择驱动 → 选择/输入测点 → 输入值 → 选择数据类型 → 下发
- **操作确认**: 二次确认对话框（工业安全）
- **操作审计日志**: 每次下发记录操作人时间和结果
- **死信队列 (Dead Letter Queue)**:
  - 表格展示: 指令详情、错误原因、失败时间、重试次数
  - 一键重新下发
  - 批量清除

#### A5. 大屏编排器 (Dashboard Editor)
- **可视化 Grid 编辑器**: react-grid-layout 编辑模式
- **卡片面板**: 从预设卡片类型库中拖拽添加
- **卡片配置**: 选择数据源 (绑定驱动/测点/统计指标)、配置刷新频率
- **布局操作**: 保存、重置、导入/导出布局 JSON
- **预设模板**: Overview / Production / Debug 等模板

#### A6. 配置中心 (Config Center)
- **双模式编辑**:
  - 📝 表单模式: 结构化表单编辑全局参数、驱动、传输、规则
  - 📄 YAML 模式: Monaco Editor 直接编辑 YAML (语法高亮, `${ENV_VAR}` 智能提示)
  - 双模式双向同步
- **差量热重载**: 提交 `PUT /configs` → 显示变更 diff → 确认重载
- **日志级别快捷调整**: 下拉框调用 `PATCH /configs`
- **变更历史**: localStorage 保存最近 N 次配置快照

#### A7. 拓扑视图 (Topology)
- **节点信息**: 当前节点 ID、角色 (collector/relay/aggregator/sink)
- **拓扑关系图**: 展示上游 subscribe 关系和已发现的邻居节点
- **中继路径**: 可视化命令透传路径 (云 → 网关 → 边缘)

#### A8. 系统诊断 (System Diagnostics)
- **实时日志终端**: xterm.js 渲染 WebSocket `/logs` 流
  - 日志级别颜色编码 (Debug=灰, Info=白, Warn=黄, Error=红)
  - 级别筛选开关
  - 实时搜索 (xterm-addon-search)
  - 暂停/继续滚动
- **Prometheus 指标仪表盘**: 拉取 `GET /metrics` → 解析展示
  - 读取延迟直方图
  - 发布延迟直方图
  - 数据新鲜度分布
  - HTTP 请求统计
- **Go 运行时**: Goroutine 数、GC 次数/暂停、内存分布
- **pprof 快捷入口**: 提供 pprof 端点的跳转链接

#### A9. 系统设置 (Settings)
- **连接配置**: CoreC 实例地址 + API Secret 管理
- **主题切换**: 跟随系统 / 浅色 / 深色
- **语言切换**: 中文 / English
- **大屏布局管理**: 导入/导出/重置布局

---

## 三、路由规划

```
/                           → 重定向到 /monitor/dashboard
/login                      → 连接配置页 (首次使用或未配置时)

# 前台 (Monitor)
/monitor
  /monitor/dashboard        → 监控大屏 (渲染编排好的布局)
  /monitor/tags             → 实时测点监控
  /monitor/alerts           → 告警与事件

# 后台 (Admin)
/admin
  /admin/drivers            → 驱动列表
  /admin/drivers/:name      → 驱动详情
  /admin/transports         → 传输列表
  /admin/transports/:name   → 传输详情
  /admin/rules              → 规则管理
  /admin/write              → 控制下发 & 死信队列
  /admin/dashboard-editor   → 大屏编排器
  /admin/config             → 配置中心
  /admin/topology           → 拓扑视图
  /admin/diagnostics        → 系统诊断 (日志/指标/pprof)
  /admin/settings           → 系统设置
```

---

## 四、数据流架构

```
┌─────────────────────────────────────────────────────┐
│                    React App                         │
│                                                      │
│  ┌──────────────┐   ┌──────────────┐                │
│  │  TanStack     │   │  Zustand      │               │
│  │  Query        │   │  Store        │               │
│  │              │   │              │               │
│  │ • drivers    │   │ • theme      │               │
│  │ • transports │   │ • locale     │               │
│  │ • tags       │   │ • layout     │               │
│  │ • rules      │   │ • wsStatus   │               │
│  │ • stats      │   │ • connection │               │
│  │ • configs    │   │              │               │
│  │ • deadLetter │   │              │               │
│  └──────┬───────┘   └──────────────┘               │
│         │                                            │
│  ┌──────┴────────────────────────────────────┐      │
│  │            API Client Layer                │      │
│  │                                            │      │
│  │  ┌─────────────┐  ┌────────────────────┐  │      │
│  │  │  REST Client │  │  WebSocket Manager │  │      │
│  │  │  (fetch/ky)  │  │  (reconnect logic) │  │      │
│  │  └──────┬──────┘  └────────┬───────────┘  │      │
│  └─────────┼──────────────────┼──────────────┘      │
│            │                  │                      │
└────────────┼──────────────────┼──────────────────────┘
             │                  │
             ▼                  ▼
   ┌─────────────────────────────────────┐
   │        CoreC Instance               │
   │  REST API (HTTP/HTTPS)              │
   │  WebSocket (WS/WSS)                │
   │  :9090                              │
   └─────────────────────────────────────┘
```

### WebSocket 管理策略
- **自动重连**: 断线后指数退避重连 (1s → 2s → 4s → ... → 30s)
- **心跳保活**: 定期 ping/pong 检测连接存活
- **多路复用**: 每个 WebSocket 端点独立管理生命周期
- **背压处理**: 前端缓冲区满时丢弃最旧数据 (与 CoreC 理念一致)

---

## 五、项目目录结构

```
corec-dashboard/
├── public/
│   └── favicon.svg
├── src/
│   ├── api/                        # API 客户端层
│   │   ├── client.ts               # HTTP 客户端封装 (fetch + Bearer Token)
│   │   ├── websocket.ts            # WebSocket 管理器 (自动重连/多路复用)
│   │   ├── endpoints/              # 按资源拆分的 API 函数
│   │   │   ├── drivers.ts
│   │   │   ├── transports.ts
│   │   │   ├── tags.ts
│   │   │   ├── rules.ts
│   │   │   ├── configs.ts
│   │   │   ├── stats.ts
│   │   │   ├── write.ts
│   │   │   └── health.ts
│   │   └── hooks/                  # TanStack Query hooks
│   │       ├── useDrivers.ts
│   │       ├── useTransports.ts
│   │       ├── useTags.ts
│   │       ├── useRules.ts
│   │       ├── useStats.ts
│   │       ├── useConfigs.ts
│   │       ├── useWrite.ts
│   │       └── useHealth.ts
│   ├── components/                 # 共享 UI 组件
│   │   ├── ui/                     # shadcn/ui 组件 (Button, Card, Dialog, etc.)
│   │   ├── charts/                 # 图表组件封装
│   │   │   ├── RealtimeLineChart.tsx    # lightweight-charts 封装
│   │   │   ├── ThroughputChart.tsx
│   │   │   ├── MemoryChart.tsx
│   │   │   └── HistogramChart.tsx
│   │   ├── dashboard/              # 大屏卡片组件
│   │   │   ├── KpiCard.tsx
│   │   │   ├── DriverStatusCard.tsx
│   │   │   ├── TransportStatusCard.tsx
│   │   │   ├── AlertPanel.tsx
│   │   │   └── TagValueCard.tsx
│   │   ├── data/                   # 数据展示组件
│   │   │   ├── DataTable.tsx       # 虚拟化表格
│   │   │   ├── TagRow.tsx
│   │   │   ├── StatusBadge.tsx     # 连接状态指示灯
│   │   │   └── QualityBadge.tsx    # 数据质量标签
│   │   ├── editor/                 # 编辑器组件
│   │   │   ├── YamlEditor.tsx      # Monaco YAML 编辑器
│   │   │   ├── RuleExprEditor.tsx  # 规则 DSL 编辑器
│   │   │   └── FormYamlToggle.tsx  # 表单/YAML 双模式切换
│   │   ├── terminal/               # 终端组件
│   │   │   └── LogTerminal.tsx     # xterm.js 日志终端
│   │   └── layout/                 # 布局组件
│   │       ├── AppShell.tsx        # 全局布局容器
│   │       ├── MonitorLayout.tsx   # 前台布局 (全屏/极简导航)
│   │       ├── AdminLayout.tsx     # 后台布局 (Sidebar + Content)
│   │       ├── Sidebar.tsx         # 后台侧边栏
│   │       └── TopBar.tsx          # 顶部栏 (连接状态/主题/语言)
│   ├── features/                   # 功能模块页面
│   │   ├── monitor/                # 前台页面
│   │   │   ├── DashboardPage.tsx
│   │   │   ├── TagExplorerPage.tsx
│   │   │   └── AlertsPage.tsx
│   │   ├── admin/                  # 后台页面
│   │   │   ├── DriversPage.tsx
│   │   │   ├── DriverDetailPage.tsx
│   │   │   ├── TransportsPage.tsx
│   │   │   ├── TransportDetailPage.tsx
│   │   │   ├── RulesPage.tsx
│   │   │   ├── WriteControlPage.tsx
│   │   │   ├── DashboardEditorPage.tsx
│   │   │   ├── ConfigCenterPage.tsx
│   │   │   ├── TopologyPage.tsx
│   │   │   ├── DiagnosticsPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   └── login/
│   │       └── ConnectionPage.tsx  # 首次连接配置
│   ├── hooks/                      # 全局自定义 Hooks
│   │   ├── useWebSocket.ts         # WebSocket 流 Hook
│   │   ├── useTheme.ts             # 主题管理
│   │   └── useConnection.ts        # 连接状态管理
│   ├── i18n/                       # 国际化
│   │   ├── index.ts                # i18next 初始化
│   │   ├── zh-CN.json              # 中文语言包
│   │   └── en.json                 # English 语言包
│   ├── lib/                        # 工具函数
│   │   ├── utils.ts                # 通用工具 (cn(), formatUptime(), etc.)
│   │   ├── constants.ts            # 枚举与常量 (DataType, Quality, ConnState)
│   │   └── prometheus.ts           # Prometheus 文本格式解析器
│   ├── stores/                     # Zustand Stores
│   │   ├── connectionStore.ts      # CoreC 连接配置
│   │   ├── themeStore.ts           # 主题偏好
│   │   └── dashboardStore.ts       # 大屏布局配置
│   ├── types/                      # TypeScript 类型定义
│   │   ├── api.ts                  # API 响应类型
│   │   ├── models.ts               # 数据模型 (DataPoint, DriverStatus, etc.)
│   │   ├── websocket.ts            # WebSocket 消息类型
│   │   └── dashboard.ts            # 大屏卡片配置类型
│   ├── App.tsx                     # 根组件 (Router + Providers)
│   ├── main.tsx                    # 入口
│   └── index.css                   # Tailwind 入口 + CSS 变量
├── biome.json                      # Biome 配置
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 六、关键技术实现细节

### 6.1 API 客户端设计
```typescript
// api/client.ts — 核心 HTTP 客户端
class CoreCClient {
  private baseUrl: string;
  private secret: string;

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.secret}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new ApiError(res.status, await res.text());
    if (res.status === 204) return undefined as T;
    return res.json();
  }
}
```

### 6.2 WebSocket 管理器
```typescript
// api/websocket.ts — 自动重连 WebSocket 管理器
class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30000;

  connect(endpoint: string, params?: Record<string, string>) {
    const url = new URL(endpoint, this.baseWsUrl);
    url.searchParams.set('token', this.secret);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    
    this.ws = new WebSocket(url);
    this.ws.onclose = () => this.scheduleReconnect();
    this.ws.onmessage = (e) => this.onMessage(JSON.parse(e.data));
  }

  private scheduleReconnect() {
    const jitter = 1 + (Math.random() * 0.4 - 0.2); // ±20%
    const delay = Math.min(this.reconnectDelay * jitter, this.maxReconnectDelay);
    setTimeout(() => this.connect(this.endpoint, this.params), delay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }
}
```

### 6.3 实时测点流 Hook
```typescript
// hooks/useWebSocket.ts
function useTagStream(driverFilter?: string) {
  const queryClient = useQueryClient();
  
  useEffect(() => {
    const ws = wsManager.connect('/tags/stream', 
      driverFilter ? { driver: driverFilter } : undefined
    );
    ws.onMessage((point: DataPoint) => {
      // 更新 TanStack Query 缓存，触发 UI 响应式更新
      queryClient.setQueryData(['tags'], (old: TagsResponse) => ({
        tags: { ...old.tags, [point.tag]: point }
      }));
    });
    return () => ws.close();
  }, [driverFilter]);
}
```

### 6.4 大屏卡片注册表
```typescript
// types/dashboard.ts
type CardType = 'kpi' | 'throughput-chart' | 'memory-chart' | 'driver-status' 
  | 'transport-status' | 'alert-panel' | 'tag-value' | 'tag-table';

interface DashboardCard {
  id: string;
  type: CardType;
  title: string;
  config: Record<string, unknown>; // 卡片特定配置 (绑定的数据源等)
  layout: { x: number; y: number; w: number; h: number; };
}

interface DashboardLayout {
  id: string;
  name: string;
  cards: DashboardCard[];
  createdAt: string;
  updatedAt: string;
}
```

---

## 七、性能优化策略

| 策略 | 实现 |
|:---|:---|
| **路由级代码分割** | React.lazy + Suspense，按功能模块懒加载 |
| **虚拟化长列表** | TanStack Virtual 处理百/千级测点列表 |
| **Canvas 时序图表** | lightweight-charts 替代 SVG，万级数据点不卡 |
| **WebSocket 背压** | 前端缓冲区满时丢弃最旧数据，防止内存溢出 |
| **请求去重** | TanStack Query staleTime + refetchInterval 控制 |
| **选择性重渲染** | Zustand selector + React.memo 精确控制 |
| **资源预加载** | Vite 自动 prefetch，关键路由 preload |
| **xterm.js 虚拟化** | 终端渲染器天然支持百万行日志流 |
| **Web Worker** | Prometheus 文本解析放 Worker，不阻塞主线程 |

---

## 八、分期开发计划

### Phase 1 — 基础骨架 (1~2 周)
- [ ] 项目初始化 (Vite + React + TS + Tailwind + Biome)
- [ ] shadcn/ui 组件安装
- [ ] API 客户端层 + 类型定义
- [ ] 连接配置页 (ConnectionPage)
- [ ] 后台布局 (AdminLayout + Sidebar)
- [ ] 前台布局 (MonitorLayout)
- [ ] 路由骨架

### Phase 2 — 核心监控 (2~3 周)
- [ ] 驱动列表页 + 详情页
- [ ] 传输列表页 + 详情页
- [ ] 实时测点监控 (TagExplorer + WebSocket 集成)
- [ ] 基础统计仪表盘 (Stats + 图表)
- [ ] 系统诊断 - 日志终端 (xterm.js)

### Phase 3 — 管理功能 (2~3 周)
- [ ] 规则管理页 (列表 + 启用/禁用)
- [ ] 控制下发页 (WriteControl + 死信队列)
- [ ] 配置中心 (表单 + Monaco YAML 双模式)
- [ ] 日志级别快捷调整

### Phase 4 — 大屏与高级 (2~3 周)
- [ ] 大屏卡片组件库
- [ ] 大屏编排器 (DashboardEditor + react-grid-layout)
- [ ] 监控大屏渲染引擎
- [ ] 告警面板 + 浏览器通知
- [ ] 拓扑视图

### Phase 5 — 打磨与优化 (1~2 周)
- [ ] 国际化语言包完善
- [ ] 性能优化 (代码分割/虚拟化/Worker)
- [ ] Prometheus 指标仪表盘
- [ ] 响应式适配 (平板/移动端基础支持)
- [ ] 单元测试覆盖
- [ ] README + 使用文档

---

## 九、可扩展性规划

| 未来需求 | 预留方案 |
|:---|:---|
| **多 CoreC 实例管理** | connectionStore 支持实例列表切换，API 层参数化 baseUrl |
| **用户权限管理** | 预留 AuthProvider context，后续接入 BFF 中间层 |
| **历史数据查询** | 预留 History 模块槽位，对接时序数据库 (InfluxDB/TDengine) |
| **报警通知推送** | 预留 NotificationProvider，对接邮件/钉钉/企微 Webhook |
| **更多驱动/传输** | 驱动/传输组件注册表模式，新协议只需新增卡片 + 表单 |
| **Kafka / gRPC 传输** | Transport 类型枚举可扩展，UI 自动适配 |
| **移动端 App** | 共享 API 层 + 类型定义，React Native 复用逻辑 |
| **Docker 部署** | 预留 Dockerfile 模板 |
| **嵌入 CoreC 二进制** | 构建产物目录结构兼容 Go embed |

---

## 十、设计决策汇总

| # | 决策项 | 结论 |
|:---:|:---|:---|
| 1 | 架构模式 | 纯前端 SPA 直连 CoreC API |
| 2 | UI 组件库 | shadcn/ui + Radix + Tailwind CSS v4 |
| 3 | 构建工具 | Vite + React Router v7 |
| 4 | 状态管理 | TanStack Query + Zustand |
| 5 | 图表库 | Recharts + lightweight-charts |
| 6 | 主题 | 跟随系统 (prefers-color-scheme) + 手动切换 |
| 7 | 前台/后台划分 | 前台=只读监控 / 后台=完整管理 |
| 8 | 大屏编排 | 后台拖拽编排 → 前台渲染只读大屏 |
| 9 | 国际化 | 中英双语 (react-i18next) |
| 10 | 配置编辑 | 表单 + Monaco YAML 双模式 |
| 11 | 日志查看 | xterm.js 虚拟终端 |
| 12 | 连接管理 | 首期单实例 + localStorage |
| 13 | 项目名 | corec-dashboard |
| 14 | 项目路径 | e:\project\corec-dashboard |
| 15 | 部署方式 | 静态文件部署 |
| 16 | 代码质量 | Biome + Vitest + TS strict |
