# ARCHITECTURE.md

> CoreC-Dashboard 架构总览：领域地图 + 分层 + 依赖方向规则。
> 细节见 `docs/FRONTEND.md`。

## 技术栈
React + Vite（rolldown）+ TypeScript + Zustand（本地状态）+ @tanstack/react-query（服务端状态）+ @tanstack/react-virtual + Radix UI + Tailwind + react-hook-form + zod + i18next。图表 recharts / lightweight-charts；编辑器 @monaco-editor/react；终端 xterm。测试 Vitest + jsdom；lint Biome。

## 领域地图
| 域 | 路径 | 职责 |
|---|---|---|
| admin | `features/admin` | 配置中心、驱动/传输/规则 CRUD、拓扑、写入控制、诊断 |
| monitor | `features/monitor` | 标签浏览（实时流+图表）、告警（一等 /alerts 注册表 + `/alerts/stream` 实时流） |
| home | `features/home` | 实例管理、首页多实例探测 |
| settings | `features/settings` | 全局设置、实例导入导出 |
| assistant | `features/assistant` | AI 助手对话（AppShell 挂载 AssistantPanel，经既有 REST 工具面） |

横切：`api`（HTTP+WS+hooks）、`stores`（Zustand 本地状态）、`contexts`（ConnectionContext）、`components`（共享 UI）、`lib`（纯函数）、`types`（schema）。

## 分层与依赖方向

```
types ← lib ← api ← stores ← hooks/contexts ← components ← features ← App
```

例外：`api/hooks` 可引用 `stores`（connection/wsStatus），其余 api 成员（HTTP client、endpoints）禁止。`WSStatus` 类型归 `types/models.ts`。规则本体与豁免表见 `scripts/structure-lint.mjs`。

**规则**：每层只能依赖左侧（更底层）。具体禁边以 `scripts/structure-lint.mjs` FORBIDDEN 表为准：
- `types/` → 不引 `lib`/`stores`/`api`/`hooks`/`contexts`/`components`/`features`/`i18n`
- `lib/` → 不引 `stores`/`api`/`hooks`/`contexts`/`components`/`features`/`i18n`
- `api/` → 不引 `contexts`/`components`/`features`
- `stores/` → 不引 `hooks`/`contexts`/`components`/`features`
- `features/*` → 不直接引其他 `features/*`（跨域仅经共享层）
- `components/ui` → 不引 `hooks`/`stores`/`features`/`api`/`contexts`（展示原语保持纯展示）

## 分层不变量（由 scripts/structure-lint.mjs 强制）
1. **零跨 feature 直连**：`features/*` 之间无直接互引；跨域共享仅经 `api/hooks`、`stores`、`components`、`lib`。
2. **下层干净**：`stores` 不引 `components`/`features`；`lib` 不引 `components`/`features`/`stores`/`api`。
3. **UI 原语纯展示**：`components/ui` 不引 `hooks`/`stores`/`features`/`api`/`contexts`。

## 状态管理边界
- **服务端状态** → @tanstack/react-query（`api/hooks`；staleTime 在 `contexts/ConnectionContext` 的 QueryClient 设置，按 hook 设 refetchInterval；mutation 失效对应 query key）
- **本地 UI/领域状态** → Zustand（`stores/configStore` 工作配置/保存/脏标记，实现拆 `stores/slices/`；`instanceStore` 实例+密钥隔离存储；`configHistory` 快照栈封顶，localStorage 持久化）
- **连接状态** → `contexts/ConnectionContext`（探测生命周期 + abort + unmount 清理）
- **表单** → react-hook-form + zodResolver（`InstanceDialog` 等）

## 入口与路由
`src/main.tsx` → `App.tsx`（React Router，全路由懒加载）→ `AppShell`（布局 + 实例切换 + 主题 + 语言）→ `<Outlet>` 各域页面。生产由 `server.mjs` 静态托管 + 反向代理 CoreC 后端。