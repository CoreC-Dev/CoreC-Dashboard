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

## 注释与文档

- 注释与文档只写当前为真、能在代码中验证、且不随实现漂移的内容。
- 保留已固化的协议与标准、安全与并发硬约束、编译期分层约束、跨仓机械约束，以及门禁要求的每包一处 `// Package` 包注释。
- 不写日期、版本、阶段、批次、审计编号、提交号、进度、状态、待办标记、计划与路线图。
- 不写决策记录、选型、权衡、理由与「为什么这么做」。
- 不写会因代码变动而反复更新的引用：文件与行号、复制自代码的阈值/计数/版本号。
- 不写与代码不符的描述、复述代码的句子、空泛标题。
- 不把删掉的内容改写成新的解释；不为通过门禁补说明。
- 文档文件增删时同步维护入站链接、索引与门禁检查项。
