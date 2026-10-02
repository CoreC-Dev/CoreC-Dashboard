# DESIGN.md

> 设计理据：写"为什么这样选"，不写"是什么"。架构总览见 `ARCHITECTURE.md`。

## 为什么 feature-sliced 而非按技术类型分
按业务域（admin/monitor/home/settings）切分，使每个域内的高内聚变更只动一个目录。跨域共享强制下沉到 `lib`/`api/hooks`/`stores`/`components`，边界可被结构测试锁定。按技术类型分（所有组件一堆、所有 store 一堆）会让域边界消失，演化时随意拉线。

## 为什么服务端状态用 react-query 而非 Zustand
服务端数据有 stale/invalidation/refetch 语义，react-query 内建缓存键失效、轮询、乐观更新、retry。Zustand 适合纯本地 UI 状态（工作配置副本、UI 开关）。混用会导致两份缓存源、失效逻辑分散。`configStore` 例外：配置需可编辑/回退/脏标记，工作副本放 Zustand 合理。

## 为什么 WebSocket 自封装而非用现成库
CoreC WS 协议需限流（PLC 高频推送）、退避重连、升级拒绝检测、token 鉴权。自封装 `CoreCWebSocket` 把这些集中可测。阶段 4 引入 `useCoreCWebSocket` hook 统一消费者生命周期（TD-ARCH-007）。

## 为什么 Monaco 而非 CodeMirror / textarea
配置中心编辑 YAML 需语法高亮 + diff + 大文件性能。Monaco 成熟且 `@monaco-editor/react` 集成简单。代价是包体积大——故运行时惰性加载 + manualChunks 拆分 + 阶段 4 自托管（ADR-008）解气隙依赖。

## 为什么 zod 而非手写校验
配置 schema 复杂（嵌套 driver/transport/rule + 跨实体引用 + 环检测）。zod 给类型推导 + 可组合 + 错误路径。`configSchema.ts` 是配置的单一真相源（阶段 4 批次 D 让 settingsRegistry 派生自此，消除三真相源 TD-ARCH-011）。

## 为什么同源代理而非浏览器直连后端（ADR-004）
浏览器直连用户输入的任意后端 + CSP `*` → 凭证可被外泄。同源代理把 Bearer 密钥留在 server.mjs 转发，浏览器只发同源请求，CSP 可收紧到 `'self'`。保留多实例能力（代理按实例路由），不牺牲 UX。

## 为什么改造走 harnessing 分支
隔离改造风险，main 保持可发布。所有 harness 提交（文档/重构/测试）落 harnessing，确认稳定后合并（ADR-009）。

## 为什么行为变更单独提交
重构与行为变更混提则无法单独回滚、无法在 review 时聚焦语义变化、无法对拍守恒（core-beliefs #12，契约 C4）。台账中"变更行为"项必须显式标注并独立提交。
