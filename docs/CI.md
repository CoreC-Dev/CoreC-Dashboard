# CI 配置决定

> 本文件记录 CoreC-Dashboard 的框架判定与 CI/门禁现状。
> 依据《存量项目 Harness 工程化规则》§3（项目框架识别与条件式 GitHub CI 配置）。

## 1. 框架判定

- **判定结果**：其他（纯 Web SPA，非 Tauri 桌面应用）
- **判定证据**：
  - 不存在 `src-tauri/tauri.conf.json`
  - 不存在 `src-tauri/Cargo.toml`（无 `tauri` crate 依赖）
  - 根 `package.json` 依赖中不含 `@tauri-apps/cli` / `@tauri-apps/api`
  - 实际技术栈：React 19 + Vite 8 + TypeScript SPA，构建产物为纯静态资源（`dist/`），由 `server.mjs`（静态文件 + 反向代理）或 GitHub Pages 托管
- **判定日期**：2026-10-02
- **结论**：按 §3.4，**不生成多平台打包与 Release 流水线**；基础门禁（lint / typecheck / build / test / coverage）由 `ci.yml` 承载。

## 2. CI 现状

| 文件 | 触发条件 | 覆盖平台 | 是否自动发布 | 备注 |
|---|---|---|---|---|
| `.github/workflows/ci.yml` | `pull_request` + `push`（`branches-ignore: [main]`）+ `workflow_call` | `ubuntu-latest` | 否 | 质量门禁：lint（biome）→ typecheck（`tsc -b`）→ docs-lint → 结构测试 → 自定义 linter → any 棘轮 → build → test → coverage。Node 24（`.nvmrc`），`cache: npm` |
| `.github/workflows/deploy.yml` | `push` 到 `main` + `workflow_dispatch` | `ubuntu-latest` | 是（构建后部署到 GitHub Pages） | `ci` job 经 `workflow_call` 复用 ci.yml 全门禁 → `build` job 构建产物并上传 Pages artifact → `deploy` job 发布；concurrency `pages` 取消旧跑。Node 24（`.nvmrc`），`cache: npm` |

## 3. 交互确认记录（仅 Tauri 填写）

> **不适用**。本项目框架判定为「其他」（§3.2），按 §3.4 跳过 §3.3 的三步交互询问（是否生成 GitHub CI / 目标平台多选 / Release 发布方式）。**不生成 `.github/workflows/` 的打包发布流水线。**

若未来项目演进为 Tauri 桌面应用（新增 `src-tauri/`），需重新执行 §3.2 判定并按 §3.3 逐条询问后再决定 CI 形态。

## 4. 本地与门禁配套

- **pre-commit hook（husky）**：`npx biome check src` + `docs:lint` / `structure:lint` / `custom:lint` / `any:ratchet` 四项自定义检查（`.husky/pre-commit`）；commit-msg hook 校验 Conventional Commits（`.husky/commit-msg`）。
- **覆盖率门禁**：`vitest.config.ts` 全局阈值（lines 41 / statements 40 / branches 30 / functions 31，ratchet 只升不降），由 CI 的 Coverage 步骤执行。
- **lockfile**：npm 为唯一权威包管理器（ADR-002），`package-lock.json` 为唯一 lockfile，CI 安装用 `npm ci`。
- **与发布链路的关系**：`deploy.yml` 的发布链路（GitHub Pages、custom domain、CNAME）保留；质量门禁由 `ci.yml` 承载，deploy 经 `workflow_call` 复用。
