# RELIABILITY.md

## 不变量
- **WebSocket**（`api/websocket.ts`）：指数退避 + 抖动 + 重连上限 + 环形缓冲限流（O(1) 零分配）+ 升级拒绝检测 + `destroy()` 清空 handler。
- **图表**：`TrafficChart`/`MemoryChart` 滑动窗口封顶（`useLiveChartStream`），unmount 清 socket。
- **批处理**：`AlertStreamProvider`（AppShell 级全局 `/logs` 订阅，供告警 feed/徽标）rAF 批告警事件 + `alertStore` events 封顶（`MAX_ALERT_EVENTS`）；`EventLogTerminal` 在诊断/配置页另开 `/logs`，定时批 flush + unmount 释放终端与 socket；`TagExplorerPage` rAF 批合并 + 趋势样本封顶（`MAX_TREND_SAMPLES`）。
- **虚拟化**：`TagExplorerPage` `@tanstack/react-virtual` + `memo` 行 + `useDeferredValue` 搜索。
- **超时与周期任务**：`apiRequest` AbortController 超时（`api/client.ts`）；`useHomepageProbe` 单请求超时 + unmount abort。周期 `setInterval` 均在 unmount 清理——首页重探（`useHomepageProbe.ts`）、连接上下文复核（`ConnectionContext.tsx`）、测点页快照对账（`TagExplorerPage.tsx`，`TAG_SNAPSHOT_POLL_MS`）。
- **有界与清理**：stores 缓冲有界；socket 随 unmount 清理；detail hook 逐个使用，不在 `.map` 内调用。
- **拆分**：`vite.config.ts` manualChunks 分包；`App.tsx` 全路由懒加载；React Query staleTime 在 `ConnectionContext` 设置，按 hook 设 refetchInterval（见 `api/hooks`）。

## 流式数据边界
缓冲、窗口、列表、快照均封顶。无界增长即缺陷。