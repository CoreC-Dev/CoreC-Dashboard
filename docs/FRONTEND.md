# FRONTEND.md

> 前端约定：写"为什么"和"边界"。架构总览见 `ARCHITECTURE.md`。

## 分层（feature-sliced）
`types ← lib ← api ← stores ← hooks/contexts ← components ← features ← App`。每层只依赖更底层。`features/*` 间禁止直接互引——跨域共享经 `api/hooks`/`stores`/`components`/`lib`。理由：域边界是可测的第一道防线，防止演化时拉线成网。

## 状态管理边界
- **服务端状态** → @tanstack/react-query。`api/hooks` 统一封装；`staleTime` 3s；按 hook 设 `refetchInterval`（4–30s）；mutation 成功失效对应 query key。**禁止把服务端数据复制进 Zustand 长期保存。**
- **本地 UI/领域状态** → Zustand。`configStore`（工作配置/保存/脏标记，阶段 4 拆 slice）、`instanceStore`（实例+密钥隔离存储）、`configHistory`（快照栈封顶 10）。
- **连接状态** → `contexts/ConnectionContext`（探测生命周期 + abort + unmount 清理）。
- 选窄 selector，避免订阅整个数组致宽重渲（TD-PERF-009）。

## 表单
react-hook-form + zodResolver。schema 与组件同域定义；校验分支必须有测试（TD-TEST-007）。边界输入（URL/密钥）经 zod 校验，不信任默认值。

## i18n
i18next。**i18n 是 lib 的 peer 层而非 lib 的内部依赖**——`lib/utils` 当前模块级引 `@/i18n`（TD-ARCH-004/009），阶段 4 批次 A 将 `cn` 抽离解耦 16 个 UI 原语。格式化器接受 `t` 显式传入或隔离到 `lib/i18nFormatters.ts`。

## UI 原语
`components/ui` 保持纯展示：不引 `hooks`/`stores`/`features`/`api`。`cn`（className 合并）应零 src 依赖。例外 `count-up-number`（TD-ARCH-005）阶段 4 内联或移出。

## 实时流
WebSocket 经 `api/websocket.ts`（退避+抖动+重连上限 10+环形缓冲限流 500msg/s）。**消费者应经 `useCoreCWebSocket` hook**（TD-ARCH-007，阶段 4 批次 B 引入），不裸用 `CoreCWebSocket`。流式数据必须有界：图表窗口封顶、rAF 批处理、缓冲/列表/快照封顶（core-beliefs #17）。

## 路由与性能
全路由懒加载（`App.tsx`）；`vite.config.ts` manualChunks 充分拆分。大列表用 `@tanstack/react-virtual` 虚拟化 + `memo` 行 + `useDeferredValue` 搜索（参考 `TagExplorerPage`）。未虚拟化的列表/dialog 需封顶 `.slice`（TD-PERF-001/004/005）。

## 提交
Conventional Commits；单一职责；重构与行为变更不混提；改造仅落 `harnessing`。

## 测试
- 框架：Vitest 5 + jsdom（全局，`src/test/setup.ts`）；组件测试用 @testing-library/react + jest-dom。
- **⚠️ cleanup 必须手动**：`vitest.config.ts` 未设 `globals: true`，导致 @testing-library/react 的自动 cleanup 静默失效。**所有渲染组件/Context/hook 的测试文件必须在 `afterEach` 中显式调用 `cleanup()`**：
  ```ts
  import { cleanup } from '@testing-library/react'
  import { afterEach } from 'vitest'
  afterEach(() => cleanup())
  ```
  遗漏会导致 DOM 残留、后续测试断言串扰。纯函数测试（无 DOM 渲染）不需要 cleanup。
- Mock 约定：`globalThis.fetch` 用 `vi.fn()` mock；无 msw、无 user-event。Biome 强制单引号。
- 覆盖率门禁：`npm run test:coverage`（v8 provider），阈值在 `vitest.config.ts` 中配置（ratchet，只升不降）。CI（`ci.yml`）已接入。
