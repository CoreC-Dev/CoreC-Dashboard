# ARCHITECTURE.md

> CoreC-Dashboard 架构总览：领域地图 + 分层 + 依赖方向规则。
> 细节见 `docs/FRONTEND.md`；技术债见 `docs/exec-plans/tech-debt-tracker.md`。

## 技术栈
React 19 + Vite 8（rolldown）+ TypeScript 7 + Zustand（本地状态）+ @tanstack/react-query（服务端状态）+ @tanstack/react-virtual + Radix UI + Tailwind + react-hook-form + zod 4 + i18next。图表 recharts / lightweight-charts；编辑器 @monaco-editor/react；终端 xterm。测试 Vitest 5 + jsdom；lint Biome 2.5。

## 领域地图
| 域 | 路径 | 职责 |
|---|---|---|
| admin | `features/admin` | 配置中心、驱动/传输/规则 CRUD、拓扑、写入控制、诊断 |
| monitor | `features/monitor` | 标签浏览（实时流+图表）、告警（WS 日志流） |
| home | `features/home` | 实例管理、首页多实例探测 |
| settings | `features/settings` | 全局设置、实例导入导出 |

横切：`api`（HTTP+WS+hooks）、`stores`（config/instance/history）、`contexts`（ConnectionContext）、`components`（共享 UI）、`lib`（纯函数）、`types`（schema）。

## 分层与依赖方向

```
types ← lib ← api ← stores ← hooks/contexts ← components ← features ← App
```

**规则**：每层只能依赖左侧（更底层）。具体禁边：
- `types/` → 不引 `lib`/`stores`/`api`/`hooks`/`components`/`features`
- `lib/` → 不引 `stores`/`api`/`hooks`/`contexts`/`components`/`features`（注：`lib/utils`、`lib/writeValidation` 当前引 `@/i18n`，记为 TD-ARCH-009，批次 A 治理）
- `api/` → 不引 `contexts`/`components`/`features`（注：`api/hooks`↔`contexts` 当前双向，记为 TD-ARCH-002，批次 B 治理）
- `stores/` → 不引 `hooks`/`contexts`/`components`/`features`
- `features/*` → 不直接引其他 `features/*`（跨域仅经共享层）
- `components/ui` → 不引 `hooks`/`features`/`stores`（展示原语保持纯展示）

## 已验证的健康不变量（审计确认，需用结构测试锁定）
1. **零跨 feature 直连**：`features/admin` 仅自引 7 处，无跨域边；`monitor`/`home`/`settings` 同理。跨域共享仅经 `api/hooks`、`stores`、`components`、`lib`。
2. **下层干净**：`stores` 不引 `components`/`features`；`lib` 不引 `components`/`features`/`stores`/`api`；`components` 不引 `features`。
3. **UI 原语近纯展示**：`components/ui` 16/17 原语不引 `hooks`/`stores`/`features`（1 例外：`count-up-number`，TD-ARCH-005）。
4. **流式路径已加固**：`CoreCWebSocket` 退避+抖动+重连上限+环形缓冲限流；图表窗口封顶；rAF 批处理；`apiRequest` 15s 超时；路由懒加载 + manualChunks 充分拆分。
5. **无 XSS sink**：无 `dangerouslySetInnerHTML`/`innerHTML`/`eval`；无 SSRF（CoreC 目标固定）。

## 已知层反转（技术债，阶段 4 治理）
| ID | 位置 | 问题 | 批次 |
|---|---|---|---|
| TD-ARCH-001 | `types/models.ts:1` → `@/lib/constants` | types 反向依赖 lib | A |
| TD-ARCH-002 | `api/hooks` ↔ `contexts/ConnectionContext` | api/contexts 层级环 | B |
| TD-ARCH-004 | `lib/utils.ts` 模块级 `@/i18n` | lib 耦合 16 UI 原语到 i18n | A |
| TD-ARCH-011 | settingsRegistry + 详情数组 + configSchema | 字段元数据三真相源 | D |

## 状态管理边界
- **服务端状态** → @tanstack/react-query（`api/hooks`，staleTime 3s，按 hook 设 refetchInterval 4–30s；mutation 失效对应 query key）
- **本地 UI/领域状态** → Zustand（`stores/configStore` 工作配置/保存/脏标记；`stores/instanceStore` 实例+密钥隔离存储；`stores/configHistory` 快照栈封顶 10）
- **连接状态** → `contexts/ConnectionContext`（探测生命周期 + abort + unmount 清理）
- **表单** → react-hook-form + zodResolver（`InstanceDialog` 等）

## 入口与路由
`src/main.tsx` → `App.tsx`（React Router，全路由懒加载）→ `AppShell`（布局 + 实例切换 + 主题 + 语言）→ `<Outlet>` 各域页面。生产由 `server.mjs` 静态托管 + 反向代理 CoreC 后端。
