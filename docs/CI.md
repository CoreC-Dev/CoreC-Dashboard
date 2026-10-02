# CI 配置决定

> 本文件记录 CoreC-Dashboard 的框架判定、现有 CI 现状与后续门禁落地决定。
> 依据《存量项目 Harness 工程化规则》§3（项目框架识别与条件式 GitHub CI 配置）。
> **本文件为 Phase 1 产出，交互询问部分留到 Phase 3**（本项目判定为「其他」类型，按 §3.4 跳过 §3.3 三问）。

## 1. 框架判定

- **判定结果**：其他（纯 Web SPA，非 Tauri 桌面应用）
- **判定证据**：
  - 不存在 `src-tauri/tauri.conf.json`
  - 不存在 `src-tauri/Cargo.toml`（无 `tauri` crate 依赖）
  - 根 `package.json` 依赖中不含 `@tauri-apps/cli` / `@tauri-apps/api`
  - 实际技术栈：React 19 + Vite 8 + TypeScript SPA，构建产物为纯静态资源（`dist/`），由 `server.mjs`（静态文件 + 反向代理）或 GitHub Pages 托管
- **判定日期**：2026-10-02
- **结论**：按 §3.4，**不生成多平台打包与 Release 流水线**；基础门禁（lint / test / build）仍按 Phase 3 落地。

## 2. 现有 CI 现状（存量项目必填）

| 文件 | 触发条件 | 覆盖平台 | 是否自动发布 | 备注 |
|---|---|---|---|---|
| `.github/workflows/deploy.yml` | `push` 到 `main` + `workflow_dispatch` | `ubuntu-latest`（仅构建，非多平台打包） | 是（构建后部署到 GitHub Pages） | 单 `build` job 依次执行 `npm ci` → `npm run lint` → `npm run build` → `npm test` → 上传 Pages 产物；`deploy` job 部署。Node 24，`cache: npm`。 |

**关键观察（Phase 1 审计，详见 `tech-debt-tracker.md`）**：

1. **质量门禁只在部署时跑**：lint / build / test 三件套仅存在于 `deploy.yml` 的 `build` job 中，触发条件是 `push` 到 `main`。**PR、`harnessing` 分支或其他分支推送不会触发任何自动化质量校验**——缺陷只能在合入主干部署时才暴露。
2. **双 lockfile**：仓库同时存在 `package-lock.json`（npm，178KB）与 `pnpm-lock.yaml`（pnpm，133KB）。CI 使用 `npm ci`（依赖 `package-lock.json`）。两份 lockfile 可能漂移，权威来源不明确。
3. **无覆盖率门禁**：无 vitest 配置文件、无 `coverage` 配置，测试覆盖率既不测量也不拦截。
4. **无 pre-commit / pre-push hook**：`.husky`、`lefthook.yml`、`.pre-commit-config.yaml` 均不存在；`.git/hooks` 仅有 sample。本地提交前无任何自动校验。
5. **无独立 `ci.yml`**：质量校验与发布耦合在同一 workflow，无法在 PR 阶段单独跑质量门禁。

## 3. 交互确认记录（仅 Tauri 填写）

> **不适用**。本项目框架判定为「其他」（§3.2），按 §3.4 跳过 §3.3 的三步交互询问（是否生成 GitHub CI / 目标平台多选 / Release 发布方式）。**不生成 `.github/workflows/` 的打包发布流水线。**

若未来项目演进为 Tauri 桌面应用（新增 `src-tauri/`），需重新执行 §3.2 判定并按 §3.3 逐条询问后再决定 CI 形态。

## 4. 落地说明（Phase 3 执行，此处先记录决定）

- **框架判定**：其他 → 仅建基础门禁（lint / type-check / build / test / 依赖扫描），**不建**多平台打包与 Release 流水线。
- **计划新增**（Phase 3）：
  - `.github/workflows/ci.yml`：在 PR 与所有分支推送时触发，独立运行 lint + type-check + build + test + 覆盖率门禁，与 `deploy.yml` 解耦。
  - `deploy.yml`：保留发布职责，但将其中的质量校验改为 `needs: ci` 依赖（或直接复用 ci.yml 的产物），避免重复编译；具体改造在 Phase 3 确定。
  - pre-commit hook（lint-staged / biome check on staged files）+ commit-msg hook（Conventional Commits 校验）。
  - 覆盖率配置（vitest `coverage`，整体下限 + 关键模块下限）。
- **lockfile 治理**（Phase 3 决策项）：在 npm 与 pnpm 之间确定唯一权威 lockfile，删除另一份并在 `docs/CI.md` 记录决定；CI 与本地命令统一。**此决策需在 Phase 3 落地前确认。**
- **与现有配置的关系**：改造（非重建）。`deploy.yml` 的发布链路（GitHub Pages、custom domain、CNAME）经验证有效，保留；仅解耦质量校验并补齐 PR 门禁。

## 5. 变更历史

| 日期 | 变更 | 原因 |
|---|---|---|
| 2026-10-02 | 初建。记录框架判定（其他）与现有 CI 现状审计 | Phase 1 全量扫描（§3.2） |
