# docs/ 索引

> 仓库知识库根索引。每条标注校验状态（✅ 已校验 / 🟡 待补 / 🔗 死链）。
> 文档防腐 linter（`scripts/docs-lint.mjs`）校验本表链接可解析 + 必填节存在。

## 必需项
| 文档 | 职责 | 状态 |
|---|---|---|
| `../AGENTS.md` | 入口地图（≤100 行） | ✅ |
| `../ARCHITECTURE.md` | 领域与分层地图 + 依赖方向 | ✅ |
| `QUALITY_SCORE.md` | 按域/层质量打分 + 差距 | ✅ |
| `exec-plans/tech-debt-tracker.md` | 技术债台账（77 条） | ✅ |
| `exec-plans/active/harness-migration.md` | 改造计划（阶段 1，决策已确认） | ✅ |
| `CI.md` | 框架判定 + CI 现状 + 落地决定 | ✅ |

## 设计文档
| 文档 | 职责 | 状态 |
|---|---|---|
| `design-docs/index.md` | 设计文档索引 | ✅ |
| `design-docs/core-beliefs.md` | 第一性原则（争议裁决依据） | ✅ |
| `design-docs/architecture-decisions.md` | 架构决策记录（ADR：框架判定 + D1–D7） | ✅ |
| `design-docs/doc-gardening.md` | 文档防腐规则与园丁任务 | ✅ |
| `design-docs/gate-exemptions.md` | 门禁豁免/ratchet 机制 + npm audit 结果 | ✅ |

## 规范文档
| 文档 | 职责 | 状态 |
|---|---|---|
| `FRONTEND.md` | 前端约定：分层、状态、查询、表单、i18n | ✅ |
| `SECURITY.md` | 安全态势 + 已确认决策 | ✅ |
| `RELIABILITY.md` | 性能与可靠性态势 | ✅ |
| `DESIGN.md` | 设计理据（为什么这样选） | ✅ |
| `engineering.md` | 工程化说明：开发/构建/测试/调试/部署/排障 | ✅ |

## 规则母本
| 文档 | 职责 | 状态 |
|---|---|---|
| `exec-plans/completed/harness-2026-10-03.md` | 改造规则母本（已竣工归档） | ✅ |

## 执行计划
- `exec-plans/active/` — 进行中：
- `exec-plans/completed/` — 已完成归档：
  - `exec-plans/completed/harness-2026-10-03.md`（改造规则母本）
  - `exec-plans/completed/harness-migration-2026-10-03.md`（改造执行计划）
- `exec-plans/.scratch/` — 审计工作底稿（证据来源，非正式交付物）

## 裁剪说明
按 §2.1 裁剪：本项目为纯前端 SPA，无 `generated/`（无 DB schema）、无 `product-specs/`（暂无产品规格）、无 `references/`。`PLANS.md`/`PRODUCT_SENSE.md` 未建（exec-plans 与 design-docs 已覆盖其职责）。
