# CI

## 工作流

| 文件 | 触发条件 | 覆盖平台 | 是否自动发布 | 备注 |
|---|---|---|---|---|
| `.github/workflows/ci.yml` | `pull_request` + `push`（`branches-ignore: [main]`）+ `workflow_call` | `ubuntu-latest` | 否 | 质量门禁：lint（biome）→ typecheck（`tsc -b`）→ docs-lint → 结构测试 → 自定义 linter → any 棘轮 → build → test → coverage。Node 24（`.nvmrc`），`cache: npm` |
| `.github/workflows/deploy.yml` | `push` 到 `main` + `workflow_dispatch` | `ubuntu-latest` | 是（构建后部署到 GitHub Pages） | `ci` job 经 `workflow_call` 复用 ci.yml 全门禁 → `build` job 构建产物并上传 Pages artifact → `deploy` job 发布；concurrency `pages` 取消旧跑。Node 24（`.nvmrc`），`cache: npm` |

## 本地与门禁配套

- **pre-commit hook（husky）**：`npx biome check src` + `docs:lint` / `structure:lint` / `custom:lint` / `any:ratchet` 四项自定义检查（`.husky/pre-commit`）；commit-msg hook 校验 Conventional Commits（`.husky/commit-msg`）。
- **覆盖率门禁**：`vitest.config.ts` 全局阈值，由 CI 的 Coverage 步骤执行。
- **lockfile**：`package-lock.json` 为唯一 lockfile，CI 安装用 `npm ci`。
- **发布链路**：`deploy.yml` 的 GitHub Pages、custom domain、CNAME；质量门禁由 `ci.yml` 承载，deploy 经 `workflow_call` 复用。
