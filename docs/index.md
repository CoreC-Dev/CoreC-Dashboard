# docs/ 索引

> 仓库知识库根索引。每条标注校验状态（✅ 已校验 / 🟡 待补 / 🔗 死链）。
> 文档防腐 linter（`scripts/docs-lint.mjs`）校验本表链接可解析 + 必填节存在。

## 必需项
| 文档 | 职责 | 状态 |
|---|---|---|
| `../AGENTS.md` | 入口地图（≤200 行） | ✅ |
| `../ARCHITECTURE.md` | 领域与分层地图 + 依赖方向 | ✅ |
| `CI.md` | 框架判定 + CI 现状 + 落地决定 | ✅ |

## 设计文档
| 文档 | 职责 | 状态 |
|---|---|---|
| `design-docs/index.md` | 设计文档索引 | ✅ |
| `design-docs/core-beliefs.md` | 第一性原则（争议裁决依据） | ✅ |
| `design-docs/architecture-decisions.md` | 架构决策记录（ADR：框架判定 + D1–D7） | ✅ |
| `design-docs/motion-catalog.md` | 前端动效目录（已有/待实施清单 + 实现约定） | ✅ |

## 规范文档
| 文档 | 职责 | 状态 |
|---|---|---|
| `FRONTEND.md` | 前端约定：分层、状态、查询、表单、i18n | ✅ |
| `SECURITY.md` | 安全态势 + 已确认决策 | ✅ |
| `RELIABILITY.md` | 性能与可靠性态势 | ✅ |
| `DESIGN.md` | 设计理据（为什么这样选） | ✅ |
| `engineering.md` | 工程化说明：开发/构建/测试/调试/部署/排障 | ✅ |

## 执行计划

## 裁剪说明
按 §2.1 裁剪：本项目为纯前端 SPA，无 `generated/`（无 DB schema）、无 `product-specs/`（暂无产品规格）、无 `references/`。`PLANS.md`/`PRODUCT_SENSE.md` 未建（design-docs 已覆盖其职责）。
