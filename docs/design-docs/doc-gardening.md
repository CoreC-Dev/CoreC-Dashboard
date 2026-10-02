# 文档防腐（doc gardening）

> 规则：知识库新鲜度、必填节、交叉链接、索引完整性。
> linter：`scripts/docs-lint.mjs`（阶段 3 接入 CI 文档门禁）。

## 必填节（linter 校验）
- `AGENTS.md`：项目定位 / 如何开始 / 硬性约束 / 目录地图 / 常用命令 / 规范索引 / 工作方式；行数 ≤ 200。
- `ARCHITECTURE.md`：技术栈 / 领域地图 / 分层与依赖方向 / 健康不变量。
- `docs/index.md`：必需项表 + 所有链接可解析。
- `docs/QUALITY_SCORE.md`：按域 + 按层评分 + 差距 + 复算方式。

## 交叉链接规则
- `docs/index.md` 必须索引 `docs/` 下全部 `.md`（除 `.scratch/`）。
- `AGENTS.md` 规范索引指向的文件必须存在。
- 死链（指向不存在文件）→ linter 失败。

## 新鲜度
- 每次阶段 4 批次完成后重算 `QUALITY_SCORE.md`。
- `tech-debt-tracker.md` 结清项移除或标"已完成"，新发现登记。
- ADR 过时标 `状态：已取代 → ADR-<新编号>`，不删除。

## 园丁任务（周期）
- **每次提交**：docs-lint 本地跑（阶段 3 pre-commit hook）。
- **每批次**：重算 QUALITY_SCORE + 更新 tracker + 进度日志。
- **每月**：抽 3 份文档与代码逐条比对，无遗留错误描述；检查 ADR 状态。
