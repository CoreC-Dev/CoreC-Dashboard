# AGENTS.md

## 这是什么项目
CoreC-Dashboard —— 面向 IIoT CoreC 后端的 React 单页前端：多实例监控、实时数据流（WebSocket）、配置中心（YAML/表单）、规则管理与写入控制。目标用户为运维/控制工程师。

## 如何开始
- 架构总览：见 `ARCHITECTURE.md`
- CI：`docs/CI.md`

## 硬性约束（不可违反）
- 分层依赖单向：`types ← lib ← api ← stores ← hooks/contexts ← components ← features ← App`，禁止反向与跨层
- `types/` 不得导入 `@/lib`、`@/stores`、`@/api`；`lib/` 不得导入 `@/components`、`@/features`、`@/stores`、`@/api`
- `features/*` 之间禁止直接互引（跨域仅经 `api/hooks`、`stores`、`components`、`lib` 共享）
- 边界处必须解析数据形状（zod / 显式校验），禁止信任外部输入（导入 JSON、后端响应、用户粘贴 YAML）
- 违反以上约束会被自定义 linter（`scripts/custom-lint.mjs` 等）与结构测试（`scripts/structure-lint.mjs`）拦截

## 目录地图
```
src/
  types/      领域类型与配置 schema（zod）
  lib/        纯函数：常量、工具、YAML、校验、连接摘要、模板
  api/        HTTP client、WebSocket、endpoints、react-query hooks
  stores/     Zustand：config / instance / config-history
  hooks/      通用 hooks（useDebouncedValue、useConfigValidation…）
  contexts/   ConnectionContext（连接探测与全局状态）
  components/ ui/（Radix 原语）+ layout + admin + charts 共享组件
  features/   admin / monitor / home / settings —— 按业务域切分
  i18n/       i18next 配置与语言资源
```

## 常用命令
- 安装：`npm install`
- 开发：`npm run dev`
- 构建：`npm run build`
- 测试：`npm test`（vitest run + server.mjs 冒烟）；覆盖率：`npm run test:coverage`（CI 门禁）
- lint：`npm run lint`
- 生产预览：`node server.mjs <port> <dist> <corec-url>`

## 规范索引
- 前端约定：`docs/FRONTEND.md`
- 安全态势：`docs/SECURITY.md`
- 可靠性态势：`docs/RELIABILITY.md`
- 工程化说明：`docs/engineering.md`

## 工作方式
- 以代码为唯一事实来源；仓库内不记录决策、理由、过程与临时状态。
- 提交粒度单一职责（Conventional Commits）；提交直接落 `main`，由 CI 全门禁约束。
