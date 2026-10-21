# CoreC-Dashboard

> 面向 IIoT [CoreC](https://github.com/CoreC-Dev/CoreC) 后端的 React 单页前端：多实例监控、实时数据流（WebSocket）、配置中心（YAML / 表单）、规则管理与写入控制。目标用户为运维 / 控制工程师。

<p align="center">
  <img src="https://icon-marquee.giann.dev/v1/marquee?i=react,ts,vite,tailwind,reactrouter,tanstack,zustand,i18next,radixui,zod,reacthookform,biome,vitest,lucide,yml,npm&width=900" alt="CoreC-Dashboard 技术栈" />
</p>

## 技术栈

React 19 · Vite 8（rolldown）· TypeScript 7 · Tailwind v4 · React Router 7 · TanStack Query · Zustand · Radix UI · react-hook-form · Zod 4 · i18next · Biome · Vitest。图表 recharts / lightweight-charts；编辑器 Monaco；终端 xterm。

## 快速开始

```bash
npm install
npm run dev      # 开发
npm run build    # 构建
npm test         # 测试
npm run lint     # lint
```

## 文档

- 架构总览：[`ARCHITECTURE.md`](ARCHITECTURE.md)
- 文档索引：[`docs/index.md`](docs/index.md)
- 前端约定：[`docs/FRONTEND.md`](docs/FRONTEND.md)
- 安全态势：[`docs/SECURITY.md`](docs/SECURITY.md)
- 可靠性态势：[`docs/RELIABILITY.md`](docs/RELIABILITY.md)
- 设计理据：[`docs/DESIGN.md`](docs/DESIGN.md)
- 工程化说明：[`docs/engineering.md`](docs/engineering.md)
- 质量评分：[`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md)
- CI 决定：[`docs/CI.md`](docs/CI.md)
- 技术债跟踪：[`docs/exec-plans/tech-debt-tracker.md`](docs/exec-plans/tech-debt-tracker.md)
- 设计决策记录：[`docs/design-docs/architecture-decisions.md`](docs/design-docs/architecture-decisions.md)
- 执行计划：`docs/exec-plans/`（进行中在 `active/`，历史在 `completed/`）
- 后端仓库：[`CoreC`](https://github.com/CoreC-Dev/CoreC)（本仓所有 API 的上游；跨仓质量计划见其 `docs/exec-plans/active/codebase-quality-program.md`）
