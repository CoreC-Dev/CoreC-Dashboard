# RELIABILITY.md

> 性能与可靠性态势。详细发现见 `exec-plans/tech-debt-tracker.md`（TD-PERF-001..012）。

## 已加固（无需动作，记为不变量）
- **WebSocket**（`api/websocket.ts`）：指数退避 + ±20% 抖动 + 重连上限 10 + 环形缓冲限流 500 msg/s（O(1) 零分配）+ 升级拒绝检测 + `destroy()` 清空 handler。
- **图表**：`TrafficChart`/`MemoryChart` 滑动窗口封顶 25 点，unmount 清 socket。
- **批处理**：`AlertsPage` rAF 批 WS 日志 + `liveLogs` 封顶 50；`TagExplorerPage` rAF 批合并 + 趋势样本封顶 100；`EventLogTerminal` 16ms 批 flush（max 200/flush）+ unmount 释放终端与 socket。
- **虚拟化**：`TagExplorerPage` `@tanstack/react-virtual` + `memo` 行 + `useDeferredValue` 搜索。
- **超时**：`apiRequest` 15s AbortController；`useHomepageProbe` 8s 单请求超时 + unmount abort；唯一 `setInterval` 已清理。
- **无泄漏**：stores 无无界缓冲；无泄漏 socket；无 N+1（detail hook 逐个用，不在 `.map` 内）。
- **拆分**：`vite.config.ts` manualChunks 充分；`App.tsx` 全路由懒加载；React Query staleTime 3s + 合理 refetchInterval。

## 原则（core-beliefs #17）
流式数据必须有界：缓冲、窗口、列表、快照均封顶。无界增长即缺陷。
