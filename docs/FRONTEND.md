# FRONTEND.md

> 前端约定：写"为什么"和"边界"。架构总览见 `ARCHITECTURE.md`。

## 分层（feature-sliced）
`types ← lib ← api ← stores ← hooks/contexts ← components ← features ← App`。每层只依赖更底层。`features/*` 间禁止直接互引——跨域共享经 `api/hooks`/`stores`/`components`/`lib`。理由：域边界是可测的第一道防线，防止演化时拉线成网。

## 状态管理边界
- **服务端状态** → @tanstack/react-query。`api/hooks` 统一封装；`staleTime` 3s；按 hook 设 `refetchInterval`（4–30s）；mutation 成功失效对应 query key。**禁止把服务端数据复制进 Zustand 长期保存。**
- **后端响应校验**：新端点在 `api/endpoints` 层用 zod parse 后端响应（如 /write/history、/version、/healthz/*——503 未就绪体被归一化为 `{ready:false,…}`、/drivers/test——连通与不通都是 200，400 拒绝归一化为 `{outcome:'rejected'}`、/rules/preview——400 编译错误/501 不支持原样透传为 `{outcome:'error'}`、/configs/backups*——列表/备份原文 zod 解析，恢复 204 归一化为 `{outcome:'restored'}`，400 校验失败/404 未找到/503 无配置路径归一化为 `{outcome:'rejected'}` 携服务器原文）；存量端点暂保持 TS 类型断言，后续批次统一收敛到 zod。WS 推送帧同理：`/traffic`、`/memory` 帧经 `types/api` 的 zod schema 逐帧校验，坏帧丢弃不渲染。
- **本地 UI/领域状态** → Zustand。`configStore`（工作配置/保存/脏标记，阶段 4 拆 slice）、`instanceStore`（实例+密钥隔离存储）、`configHistory`（快照栈封顶 10）。
- **连接状态** → `contexts/ConnectionContext`（探测生命周期 + abort + unmount 清理）。
- 选窄 selector，避免订阅整个数组致宽重渲（TD-PERF-009）。

## 表单
react-hook-form + zodResolver。schema 与组件同域定义；校验分支必须有测试（TD-TEST-007）。边界输入（URL/密钥）经 zod 校验，不信任默认值。

## i18n
i18next。**i18n 是 lib 的 peer 层而非 lib 的内部依赖**——`cn` 已抽离到 `lib/cn.ts`，`lib/utils` 不再引 `@/i18n`。格式化器接受 `t` 显式传入或隔离到 `lib/i18nFormatters.ts`。

## UI 原语
`components/ui` 保持纯展示：不引 `hooks`/`stores`/`features`/`api`。`cn`（className 合并）应零 src 依赖。

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


## UX 修复波（2026-10-18）：行为变更登记

本批按 UX 审计（ux-audit A/B/C/D 四组报告）落地的可观察行为变更，登记如下：

- **连接探测改打带鉴权的 `GET /stats`**：密钥错误现在显示为明确的"密钥无效 (401)"，不再假装已连接；`ConnectionContext` 每 15s 周期复核（后端掉线一周期内可见）。
- **401 全局拦截**：任何查询/变更收到 401 即切换到全屏"认证已失效"遮罩，提供重输密钥与返回实例列表两条出路。
- **WS 断线可见**：`/tags/stream`、`/logs`、`/traffic`、`/memory` 四条流的状态汇入 `wsStatusStore`；监控三页顶部横幅在断线/放弃重连时可见；侧栏"实时流"徽标绑定真实 socket 状态；`rejected` 状态提供"重新连接"按钮。
- **告警全局触达**：`/logs` 订阅由 AppShell 级 `AlertStreamProvider` 独占持有，告警页只是消费者；侧栏"告警事件"显示未读 error 计数徽标（死信计数兜底）；声音/浏览器通知在任何路由下生效。
- **危险操作归一**：`PUT /configs` 仅有一个门——所有入口经 `ConfigApplyConfirmationDialog`（diff+变更摘要+暂停警告）确认后触发；`RuleEditDialog` 直发路径已删除（规则运行区编辑并入向导，延迟应用）。
- **死信单条重放加两步确认**（对齐批量重放与手动写入标杆），列出上次失败时间/次数/错误原文。
- **向导取消守卫**：三个向导的取消/关闭/遮罩点击在脏草稿时先弹放弃确认。
- **配置中心**：YAML 重载不再把未应用的表单编辑标成已保存（蒸发修复）；模式切换分歧时三选一桥接；播种失败红色横幅+创建/应用守卫；`POST /configs/validate` 接入两条应用确认流；变更历史按钮改名"载入到编辑器"（"恢复"仅指服务端备份真恢复）。
- **诚实性**：`GET /configs/raw` 明文（无脱敏/无 sentinel-merge）在注释与提示文案中如实标注；`settings.subtitle`/`secretsRedactedNote` 等死键与失实文案清除。
- **门禁收紧**：`SIZE_EXEMPTIONS` 移除 RulesPage/RuleParts 两项（C-B1 死代码删除后回到 500 行内）。
