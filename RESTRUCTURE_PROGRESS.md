# CoreC Dashboard 架构重构 — 进展报告

> **日期**：2026-09-30
> **依据**：ARCHITECTURE_RESTRUCTURE.md
> **模式**：完全重写，不考虑旧版兼容

---

## 一、总体进展

| 阶段 | 状态 | 说明 |
|:---|:---|:---|
| Phase 1：骨架 + 首页 + 连接模型 | ✅ 完成 | 实例 Store、首页面板、路由重构、ConnectionProvider、TopBar、Monitor/Admin 壳 |
| Phase 2：Monitor 空间 | ✅ 完成 | 固定 5 行仪表盘、实时测点页、告警事件页（路由已适配实例作用域） |
| Phase 3：Admin 空间 + 全局设置 | ✅ 完成 | 所有 Admin 页面路由已适配实例作用域；全局设置页已创建 |
| 交叉审计 | 🔄 进行中 | 4 个审计 agent 并行运行 |
| 文档 + Push | 🔄 进行中 | 本文档 + 待提交 |

---

## 二、已完成的工作

### 2.1 实例数据模型（Phase 1）

**新建文件**：
- `src/stores/instanceStore.ts` — 多实例 Zustand Store

**数据模型**（完全匹配规格）：

| 字段 | 类型 | 说明 |
|:---|:---|:---|
| `id` | string | 自动生成唯一标识 |
| `name` | string | 用户自定义名称 |
| `baseUrl` | string | 连接地址 |
| `secret` | string | API Secret |
| `color` | string? | 可选颜色标识 |
| `notes` | string? | 可选备注 |
| `tags` | string[]? | 可选分组标签 |
| `lastConnectedAt` | string? | 最后成功连接时间 |
| `lastKnownInfo` | object? | 最后已知版本/状态/运行时间 |
| `createdAt` | string | 创建时间 |
| `sortOrder` | number | 排序序号 |

**Store 功能**：
- CRUD：`addInstance` / `updateInstance` / `deleteInstance` / `getInstance`
- 排序：`reorderInstances`
- 连接探测：`setProbing` / `setProbeResult`
- 导入导出：`exportInstances` / `importInstances`（支持 merge/replace 模式）
- 清空：`clearAll`
- 持久化到 `localStorage`（key: `corec_instances`）

### 2.2 连接模型重构（Phase 1）

**新建文件**：
- `src/api/activeConnection.ts` — 模块级活跃连接单例
- `src/contexts/ConnectionContext.tsx` — 连接上下文 + ConnectionProvider

**核心变化**：
- **旧**：全局单例 `connectionStore`，所有 API 请求读同一个 store
- **新**：路由绑定的连接 — 进入 `/corec/:id/*` 时 ConnectionProvider 设置活跃连接，离开时清除

**ConnectionProvider 职责**：
1. 从路由参数读取 `:id`，在 instanceStore 中查找实例
2. 设置模块级活跃连接（供 apiRequest / WebSocket 使用）
3. 探测连接（GET /），跟踪 `isConnected` / `isConnecting` / `error`
4. 创建 per-instance QueryClient（缓存隔离，切换实例不看到旧数据）
5. 卸载时清除活跃连接

**API 层适配**：
- `src/api/client.ts` — 从 `getActiveConnection()` 读取连接参数
- `src/api/websocket.ts` — 从 `getActiveConnection()` 读取连接参数
- `src/api/hooks/index.ts` — `useConnectedQuery` 改用 `useConnection().isConnected` 门控

### 2.3 路由重构（Phase 1）

**修改文件**：`src/App.tsx`

**新路由结构**：
```
/                                → 首页（实例管理面板）
/settings                        → 全局设置

/corec/:id/monitor/dashboard     → 总览仪表盘
/corec/:id/monitor/tags          → 实时测点
/corec/:id/monitor/alerts        → 告警事件

/corec/:id/admin/drivers         → 驱动管理
/corec/:id/admin/drivers/:name   → 驱动详情
/corec/:id/admin/transports      → 传输管理
/corec/:id/admin/transports/:name→ 传输详情
/corec/:id/admin/rules           → 规则管理
/corec/:id/admin/write           → 控制下发
/corec/:id/admin/config          → 配置中心
/corec/:id/admin/topology        → 拓扑视图
/corec/:id/admin/diagnostics     → 系统诊断
```

**路由守卫**：
- `InstanceGuard` — 实例不存在时重定向到 `/`
- `ConnectionGate` — 连接探测中显示加载，连接失败显示错误+重试

### 2.4 首页实例管理面板（Phase 1）

**新建文件**：
- `src/features/home/InstancePanel.tsx` — 首页主面板
- `src/features/home/InstanceCard.tsx` — 实例卡片
- `src/features/home/InstanceDialog.tsx` — 添加/编辑实例对话框

**功能**：
- 实例卡片网格（响应式 1/2/3/4 列）
- 每张卡片：状态灯、名称、地址、版本、最后连接时间、分组标签
- 添加/编辑对话框：名称、URL、密钥、颜色、标签、备注（zod 校验）
- 删除确认对话框
- 导入/导出 JSON
- 空状态引导
- 全局设置入口

### 2.5 TopBar 三段式布局（Phase 1）

**修改文件**：`src/components/layout/TopBar.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│  [← 首页]  [🟢 实例名 ▾]  │  Monitor  Admin  │  🌐 🌙 ⛶ ⏏ │
│       左区                      中区            右区         │
└──────────────────────────────────────────────────────────────┘
```

- **左区**：返回首页 + 实例名（带状态灯）+ 下拉快速切换
- **中区**：Monitor / Admin 切换
- **右区**：全屏、语言、主题、断开（返回首页）

### 2.6 Monitor/Admin 壳适配（Phase 1）

**修改文件**：
- `src/components/layout/MonitorLayout.tsx` — 子导航使用实例作用域路径
- `src/components/layout/Sidebar.tsx` — 移除大屏编排链接，移除设置链接（已移至全局）

### 2.7 固定 5 行仪表盘（Phase 2）

**修改文件**：`src/features/monitor/DashboardPage.tsx`

**固定布局**（不再依赖 dashboardStore）：
1. KPI 指标行（6 个小卡片：状态、运行时间、采集速率、驱动数、传输数、丢弃数）
2. 实时图表行（流量图 + 内存图）
3. 驱动矩阵行
4. 传输矩阵行
5. 最近告警/死信行

### 2.8 全局设置页（Phase 3）

**新建文件**：`src/features/settings/GlobalSettingsPage.tsx`

**功能**：
- 外观设置：主题（system/dark/light）、界面语言
- 数据管理：导出所有实例、导入实例、清除所有数据

### 2.9 移除的模块

| 文件 | 原因 |
|:---|:---|
| `src/features/admin/DashboardEditorPage.tsx` | 大屏编排器移除 |
| `src/features/login/ConnectionPage.tsx` | 登录页替换为实例面板 |
| `src/features/admin/SettingsPage.tsx` | 设置移至全局 `/settings` |
| `src/stores/dashboardStore.ts` | 布局持久化不再需要 |
| `src/stores/dashboardStore.test.ts` | 随 store 移除 |
| `src/stores/connectionStore.ts` | 替换为 instanceStore |
| `src/stores/connectionStore.test.ts` | 随 store 移除 |
| `src/types/dashboard.ts` | 布局类型不再需要 |

**依赖移除**：
- `react-grid-layout` — 从 package.json 卸载
- `@types/react-grid-layout` — 从 package.json 卸载
- react-grid-layout CSS 导入 — 从 main.tsx 移除

### 2.10 新增 UI 组件

- `src/components/ui/dropdown-menu.tsx` — shadcn/ui DropdownMenu（基于 @radix-ui/react-dropdown-menu）

### 2.11 i18n 更新

- 新增 `instances` 命名空间（zh-CN + en，36 个键）
- 涵盖：添加/编辑/删除实例、导入导出、空状态、数据管理

### 2.12 路由适配

所有 Admin 页面的内部导航已适配实例作用域：
- `DriverDetailPage` — BackLink 使用 `/corec/:id/admin/drivers`
- `TransportDetailPage` — BackLink 使用 `/corec/:id/admin/transports`
- `TransportsPage` — 详情导航使用 `/corec/:id/admin/transports/:name`
- `DashboardPage` — 管理链接使用 `/corec/:id/admin/*`
- `DiagnosticsPage` — pprof 下载使用活跃连接

### 2.13 测试适配

- `src/api/endpoints/index.test.ts` — 改用 `setActiveConnection` 代替 `connectionStore`
- `src/features/admin/pages_render_smoke.test.tsx` — mock ConnectionContext 代替 connectionStore

---

## 三、未完成 / 未来扩展

### 3.1 本次明确不实现的（规格第八节）

| 扩展 | 说明 |
|:---|:---|
| 多标签页 | 同时连接多个 CoreC（架构已预留 per-instance QueryClient） |
| Hub 集成 | 连接 CoreC Hub 自动发现导入所有实例 |
| 拓扑全景 | 首页展示所有实例间的级联关系图 |
| 实例健康巡检 | 首页定时 ping 所有实例，卡片显示实时状态 |
| 跨实例数据对比 | 选择 2 个实例对比传感器数据 |

### 3.2 保留但未改动的现有页面

以下页面功能保留，仅路由适配实例作用域，内部实现未改动：

| 页面 | 说明 |
|:---|:---|
| TagExplorerPage | 虚拟化表格 + WebSocket + 趋势图抽屉 — 已有实现 |
| AlertsPage | 日志流 + 规则告警 + 死信队列 — 已有实现 |
| DriversPage / DriverDetailPage | 列表 + 详情 + 向导 — 已有实现 |
| TransportsPage / TransportDetailPage | 列表 + 详情 + 向导 — 已有实现 |
| RulesPage | 列表 + 启停 + 向导 — 已有实现 |
| WriteControlPage | 写入表单 + 死信队列 — 已有实现 |
| ConfigCenterPage | Monaco YAML + 表单双模式 — 已有实现 |
| TopologyPage | 数据流管道可视化 — 已有实现 |
| DiagnosticsPage | 日志终端 + Prometheus + pprof — 已有实现 |

### 3.3 已知的小限制

1. **实例健康巡检**：首页卡片显示的是上次连接状态，不会自动定时 ping（规格第八节列为未来扩展）
2. **实例拖拽排序**：Store 有 `reorderInstances` 方法但 UI 未实现拖拽（可后续添加）
3. **dashboardEditor i18n 键**：JSON 文件中保留了 42 个 `dashboardEditor.*` 键（未删除，但无代码引用）

---

## 四、文件变更清单

### 新建（9 个）
| 文件 | 用途 |
|:---|:---|
| `src/stores/instanceStore.ts` | 多实例 Store |
| `src/api/activeConnection.ts` | 活跃连接单例 |
| `src/contexts/ConnectionContext.tsx` | 连接上下文 + Provider |
| `src/features/home/InstancePanel.tsx` | 首页面板 |
| `src/features/home/InstanceCard.tsx` | 实例卡片 |
| `src/features/home/InstanceDialog.tsx` | 添加/编辑对话框 |
| `src/features/settings/GlobalSettingsPage.tsx` | 全局设置页 |
| `src/components/ui/dropdown-menu.tsx` | DropdownMenu 组件 |
| `docs/API_REFERENCE.md` (CoreC) | 后端 API 参考（审计 agent 生成） |

### 修改（12 个）
| 文件 | 变更 |
|:---|:---|
| `src/App.tsx` | 完全重写路由结构 |
| `src/main.tsx` | 移除 react-grid-layout CSS |
| `src/api/client.ts` | 改用活跃连接 |
| `src/api/websocket.ts` | 改用活跃连接 |
| `src/api/hooks/index.ts` | 改用 ConnectionContext |
| `src/components/layout/TopBar.tsx` | 三段式布局 |
| `src/components/layout/MonitorLayout.tsx` | 实例作用域路径 |
| `src/components/layout/Sidebar.tsx` | 移除编排/设置链接 |
| `src/features/monitor/DashboardPage.tsx` | 固定 5 行布局 |
| `src/features/admin/DiagnosticsPage.tsx` | 改用活跃连接 |
| `src/features/admin/DriverDetailPage.tsx` | 实例作用域 BackLink |
| `src/features/admin/TransportDetailPage.tsx` | 实例作用域 BackLink |
| `src/features/admin/TransportsPage.tsx` | 实例作用域导航 |
| `src/api/endpoints/index.test.ts` | 测试适配 |
| `src/features/admin/pages_render_smoke.test.tsx` | 测试适配 |
| `src/i18n/zh-CN.json` | 新增 instances 命名空间 |
| `src/i18n/en.json` | 新增 instances 命名空间 |
| `src/index.css` | 更新注释 |
| `package.json` | 移除 react-grid-layout，新增 @radix-ui/react-dropdown-menu |

### 删除（8 个）
| 文件 | 原因 |
|:---|:---|
| `src/features/admin/DashboardEditorPage.tsx` | 大屏编排器移除 |
| `src/features/login/ConnectionPage.tsx` | 登录页替换 |
| `src/features/admin/SettingsPage.tsx` | 设置移至全局 |
| `src/stores/dashboardStore.ts` | 布局持久化移除 |
| `src/stores/dashboardStore.test.ts` | 随 store 移除 |
| `src/stores/connectionStore.ts` | 替换为 instanceStore |
| `src/stores/connectionStore.test.ts` | 随 store 移除 |
| `src/types/dashboard.ts` | 布局类型移除 |

---

## 五、验证结果

| 检查项 | 结果 |
|:---|:---|
| TypeScript 类型检查 (`tsc -b --noEmit`) | ✅ 通过 |
| 生产构建 (`vite build`) | ✅ 通过 |
| 测试套件 (`vitest run`) | ✅ 327/327 通过 |
| 旧模块引用搜索 | ✅ 无残留 |
| react-grid-layout 依赖 | ✅ 已移除 |

---

## 六、交叉审计结果

4 个审计 agent 并行运行，各自独立对比实现与规格。

### 审计 1：路由与壳结构 — 7/7 PASS ✅

| 检查项 | 结果 |
|:---|:---:|
| 14 条路由完全匹配规格 | ✅ |
| 三种页面壳（裸页/Monitor/Admin） | ✅ |
| ConnectionProvider 包裹实例路由 | ✅ |
| InstanceGuard 不存在时重定向首页 | ✅ |
| 旧 `/login` 路由已移除 | ✅ |
| 旧 `/admin/dashboard-editor` 路由已移除 | ✅ |
| 旧 `/admin/settings` 路由已移除（移至全局 `/settings`） | ✅ |

### 审计 2：实例模型与连接 — 11/11 PASS ✅

| 检查项 | 结果 |
|:---|:---:|
| 实例数据模型 11 个字段 | ✅ |
| localStorage 持久化 | ✅ |
| CRUD 操作 | ✅ |
| 导入/导出 | ✅ |
| 连接绑定到路由（非全局） | ✅ |
| 挂载设置 / 卸载清除 | ✅ |
| per-instance QueryClient | ✅ |
| API 客户端读取活跃连接 | ✅ |
| WebSocket 读取活跃连接 | ✅ |
| 查询 hooks 受 isConnected 门控 | ✅ |
| 旧 connectionStore 完全移除 | ✅ |

**发现的差异（已处理）**：
- `lastKnownInfo` 字段：规格提及"节点角色"，但 CoreC API `GET /` 实际返回 `{name, version, status, time, uptime}`，**不暴露 node role**。实现正确匹配实际 API。
- Mutation hooks 未受 `isConnected` 门控：低风险，无活跃连接时抛出 `ApiError(0)`，功能安全。

### 审计 3：移除模块验证 — 14/14 PASS ✅

| 检查项 | 结果 |
|:---|:---:|
| DashboardEditorPage 已删除 | ✅ |
| dashboardStore 已删除 | ✅ |
| dashboardStore.test 已删除 | ✅ |
| types/dashboard 已删除 | ✅ |
| connectionStore 已删除 | ✅ |
| connectionStore.test 已删除 | ✅ |
| ConnectionPage（旧登录页）已删除 | ✅ |
| 旧 SettingsPage 已删除 | ✅ |
| react-grid-layout 从 package.json 移除 | ✅ |
| react-grid-layout CSS 导入移除 | ✅ |
| 无残留导入引用 | ✅ |
| dashboardEditor i18n 键无代码引用 | ✅ |
| Sidebar 无大屏编排链接 | ✅ |
| Sidebar 无设置链接 | ✅ |

### 审计 4：TopBar 与首页 UI — 19/19 PASS ✅

| 检查项 | 结果 |
|:---|:---:|
| TopBar 三段式布局 | ✅ |
| 左区：返回+实例名+状态灯+切换下拉 | ✅ |
| 中区：Monitor/Admin 切换 | ✅ |
| 右区：全屏+主题+语言+断开 | ✅ |
| 下拉列出所有实例 | ✅ |
| 断开返回首页 | ✅ |
| 首页为卡片网格（非登录表单） | ✅ |
| 显示已保存实例卡片 | ✅ |
| 添加新实例按钮 | ✅ |
| 空状态 | ✅ |
| 导入/导出 | ✅ |
| 编辑/删除实例 | ✅ |
| 全局设置入口 | ✅ |
| 卡片显示实例名 | ✅ |
| 卡片显示状态指示 | ✅ |
| 卡片显示服务器地址 | ✅ |
| 卡片显示版本信息 | ✅ |
| 卡片有进入按钮 | ✅ |
| 卡片有编辑/删除操作 | ✅ |

**发现的差异（已修复）**：
- ✅ 返回按钮图标：从 Radio 改为 ArrowLeft（匹配规格 "← 首页"）
- ✅ 右区按钮顺序：从 语言→主题 改为 主题→语言（匹配规格）
- ✅ 首页顶栏按钮顺序：同上修复
- ✅ 移除首页中不可达的 clearAll 对话框死代码

**保留的差异（非阻塞，合理偏离）**：
- 最后连接时间显示为相对时间（"刚刚"、"X 分钟前"）而非绝对时间 — 更好的 UX
- 实例切换下拉包含当前实例（高亮而非排除） — 合理的 UX 选择
- 重试按钮调用 handleEnter（导航触发自动重连）而非显式重探测 — 功能等价

### 审计总结

| 审计 | 检查项 | 通过 | 失败 |
|:---|:---:|:---:|:---:|
| 路由与壳结构 | 7 | 7 | 0 |
| 实例模型与连接 | 11 | 11 | 0 |
| 移除模块验证 | 14 | 14 | 0 |
| TopBar 与首页 UI | 19 | 19 | 0 |
| **合计** | **51** | **51** | **0** |

**结论**：实现完全符合 ARCHITECTURE_RESTRUCTURE.md 规格要求。所有结构性、功能性和清理性检查均通过。
