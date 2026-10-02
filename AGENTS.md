# AGENTS.md

> 本文件是**内容目录**，不是百科全书。需要细节时，按下方指引跳转。

## 这是什么项目
CoreC-Dashboard —— 面向 IIoT CoreC 后端的 React 单页前端：多实例监控、实时数据流（WebSocket）、配置中心（YAML/表单）、规则管理与写入控制。目标用户为运维/控制工程师。

## 如何开始
- 架构总览：见 `ARCHITECTURE.md`
- 设计理念与操作原则：见 `docs/design-docs/core-beliefs.md`
- 架构决策记录：见 `docs/design-docs/architecture-decisions.md`
- 当前执行计划：见 `docs/exec-plans/active/`
- CI 与框架判定：见 `docs/CI.md`
- 已知技术债：见 `docs/exec-plans/tech-debt-tracker.md`
- 质量评分：见 `docs/QUALITY_SCORE.md`

## 硬性约束（不可违反）
- 分层依赖单向：`types ← lib ← api ← stores ← hooks/contexts ← components ← features ← App`，禁止反向与跨层
- `types/` 不得导入 `@/lib`、`@/stores`、`@/api`；`lib/` 不得导入 `@/components`、`@/features`、`@/stores`、`@/api`
- `features/*` 之间禁止直接互引（跨域仅经 `api/hooks`、`stores`、`components`、`lib` 共享）
- 边界处必须解析数据形状（zod / 显式校验），禁止信任外部输入（导入 JSON、后端响应、用户粘贴 YAML）
- 重构不改变业务行为；行为变更必须显式登记并单独提交
- 违反以上约束会被自定义 linter / 结构测试拦截（阶段 3 落地）

## 目录地图
```
src/
  types/      领域类型与配置 schema（zod）
  lib/        纯函数：常量、工具、YAML、校验、连接摘要、模板
  api/        HTTP client、WebSocket、endpoints、react-query hooks
  stores/     Zustand：config / instance / config-history
  hooks/      通用 hooks（useCountUp、useDebouncedValue、useConfigValidation…）
  contexts/   ConnectionContext（连接探测与全局状态）
  components/ ui/（Radix 原语）+ layout + admin + charts 共享组件
  features/   admin / monitor / home / settings —— 按业务域切分
  i18n/       i18next 配置与语言资源
```

## 常用命令
- 安装：`npm install`
- 开发：`npm run dev`
- 构建：`npm run build`
- 测试：`npm test`（覆盖率：`npm run test:coverage`，阶段 3 接入）
- lint：`npm run lint`
- 生产预览：`node server.mjs <port> <dist> <corec-url>`

## 规范索引
- 前端约定：`docs/FRONTEND.md`
- 安全态势：`docs/SECURITY.md`
- 可靠性态势：`docs/RELIABILITY.md`
- 设计理据：`docs/DESIGN.md`
- 工程化说明：`docs/engineering.md`
- 质量评分：`docs/QUALITY_SCORE.md`

## 工作方式
- 变更前先读相关 `docs/`，变更后同步更新文档与 `QUALITY_SCORE.md`
- 提交粒度单一职责（Conventional Commits）；改造仅落 `harnessing` 分支
- 计划写在 `docs/exec-plans/active/`，完成后移入 `completed/`
- 任何交互式决策确认后必须写入仓库文档（见 `docs/design-docs/architecture-decisions.md`）
- 改造规则母本：`docs/HARNESS-RULES.md`
