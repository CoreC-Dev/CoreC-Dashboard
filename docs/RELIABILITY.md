# RELIABILITY.md

> 性能与可靠性态势。

## 已加固（无需动作，记为不变量）
- **WebSocket**（`api/websocket.ts`）：指数退避 + ±20% 抖动 + 重连上限 10 + 环形缓冲限流 500 msg/s（O(1) 零分配）+ 升级拒绝检测 + `destroy()` 清空 handler。
- **图表**：`TrafficChart`/`MemoryChart` 滑动窗口封顶 25 点，unmount 清 socket。
- **批处理**：`AlertStreamProvider`（AppShell 级 `/logs` 独占订阅）rAF 批告警事件 + `alertStore` events 封顶 50（`MAX_ALERT_EVENTS`）；`TagExplorerPage` rAF 批合并 + 趋势样本封顶 100（`MAX_TREND_SAMPLES`）；`EventLogTerminal` 16ms 批 flush（max 200/flush）+ unmount 释放终端与 socket。
- **虚拟化**：`TagExplorerPage` `@tanstack/react-virtual` + `memo` 行 + `useDeferredValue` 搜索。
- **超时与周期任务**：`apiRequest` 15s AbortController 超时（`api/client.ts`）；`useHomepageProbe` 8s 单请求超时 + unmount abort。周期 `setInterval` 均在 unmount 清理——首页 15s 重探（`useHomepageProbe.ts:291`）、连接上下文 15s 复核（`ConnectionContext.tsx:282`）、测点页 60s 快照对账（`TagExplorerPage.tsx:72`，`TAG_SNAPSHOT_POLL_MS`）。
- **无泄漏**：stores 无无界缓冲；无泄漏 socket；无 N+1（detail hook 逐个用，不在 `.map` 内）。
- **拆分**：`vite.config.ts` manualChunks 充分；`App.tsx` 全路由懒加载；React Query staleTime 3s + 合理 refetchInterval。

## 原则（core-beliefs #17）
流式数据必须有界：缓冲、窗口、列表、快照均封顶。无界增长即缺陷。
