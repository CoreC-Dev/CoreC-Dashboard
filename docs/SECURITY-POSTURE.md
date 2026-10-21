# 安全态势补充（2026-10-21 质量审计后）

`docs/SECURITY.md` 是安全态势的主文档。本页记录质量审计批次 W 的补充决定：

- **server.mjs（生产反向代理）已纳入门禁**：lint（biome）+ 冒烟测试（启动/静态服务/SPA 回退/代理分支/路径穿越 403 拒绝）随 `npm test` 运行——此前它游离于全部门禁之外（质量审计 H3）
- **依赖与 CI 供应链**：GitHub Actions 全部 SHA 钉版（tag 以注释保留）；dependabot 每周巡检 npm 与 actions
- **Node 版本**：`.nvmrc` + `engines` + `packageManager` 三处钉版，CI 经 `node-version-file` 消费——本地/CI 漂移可检测
- **上游 CoreC 的安全态势**：见其仓库 `SECURITY.md`（明文 raw 配置、共享 secret 模型等残余风险的明示）
