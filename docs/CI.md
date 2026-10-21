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
| `.github/workflows/deploy.yml` | `push` 到 `main` + `workflow_dispatch` | `ubuntu-latest` | 是（构建后部署到 GitHub Pages） | 复用 `ci.yml`（`workflow_call`：lint → typecheck → docs/structure/custom/any 四 lint → build → test → coverage 全门禁）后 `build-pages` job 再构建产物并上传 Pages；concurrency `pages` 取消旧跑。Node 24，`cache: npm`。（2026-10-21 质量审计修正：本行原文描述的是 Phase 3 改造前的单 build job 布局） |

## 3. 交互确认记录（仅 Tauri 填写）

> **不适用**。本项目框架判定为「其他」（§3.2），按 §3.4 跳过 §3.3 的三步交互询问（是否生成 GitHub CI / 目标平台多选 / Release 发布方式）。**不生成 `.github/workflows/` 的打包发布流水线。**

若未来项目演进为 Tauri 桌面应用（新增 `src-tauri/`），需重新执行 §3.2 判定并按 §3.3 逐条询问后再决定 CI 形态。

## 4. 落地说明（Phase 3 执行，此处先记录决定）

- **框架判定**：其他 → 仅建基础门禁（lint / type-check / build / test / 依赖扫描），**不建**多平台打包与 Release 流水线。
- **已落地**（Phase 3 完成）：
  - `.github/workflows/ci.yml`：PR 与所有分支推送时触发，独立运行 lint + type-check + build + test + 覆盖率门禁，与 `deploy.yml` 解耦。
  - `deploy.yml`：保留发布职责，质量校验复用 ci.yml（`workflow_call`）。
  - pre-commit hook（husky：全量 biome check + 4 个自定义 lint）+ commit-msg hook（Conventional Commits 校验）。（2026-10-21 质量审计修正：原文声称 lint-staged——package.json 从未引入该依赖，钩子跑的是全量 `biome check`）
  - 覆盖率配置（vitest `coverage`，整体下限 + 关键模块下限）。
  - lockfile 治理：已确定 npm（`package-lock.json`）为唯一权威 lockfile，`pnpm-lock.yaml` 已删除。
- **与现有配置的关系**：改造（非重建）。`deploy.yml` 的发布链路（GitHub Pages、custom domain、CNAME）经验证有效，保留；质量校验已解耦并补齐 PR 门禁。

## 5. 变更历史

| 日期 | 变更 | 原因 |
|---|---|---|
| 2026-10-02 | 初建。记录框架判定（其他）与现有 CI 现状审计 | Phase 1 全量扫描（§3.2） |
