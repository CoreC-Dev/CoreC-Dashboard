# 门禁豁免机制与审计结果

> 阶段 3 建立。文档化各门禁的豁免/ratchet 机制 + npm audit 结果。
> 原则（core-beliefs #5/#8）：强制不变量，不微观管理；技术债小额高频偿还。豁免 = 显式登记 + TD ID + 移除条件，非永久放行。

## 豁免/ratchet 机制一览

| 门禁 | 脚本 | 机制 | 移压项移除条件 |
|---|---|---|---|
| 分层依赖方向 | `scripts/structure-lint.mjs` | `EXEMPTIONS` 数组（importer+importee+TD ID+批次） | 阶段 4 对应批次修复后从 EXEMPTIONS 删除 |
| 文件大小 | `scripts/custom-lint.mjs` | `SIZE_EXEMPTIONS`（file+TD ID+批次），阈值 500 行 | 阶段 4 拆分 God 文件后删除 |
| noExplicitAny | `scripts/any-ratchet.mjs` | `BASELINE` 计数，新增即失败 | 阶段 4/5 清理存量后下调 BASELINE，终态 biome.json 提 error |
| 覆盖率 | `vitest.config.ts` | `thresholds` floor（lines 26/stmt 25/branch 19/func 18） | 阶段 5 补测试后上调 |
| 文档 | `scripts/docs-lint.mjs` | 无豁免（硬性：链接可解析+必填节+索引完备） | —— |

### 当前已登记豁免
- **结构**：TD-ARCH-001（types→lib）、TD-ARCH-002（api↔contexts）、TD-ARCH-004/009（lib→i18n）、TD-ARCH-005（ui→hooks）——5 项，阶段 4 批次 A/B 移除。
- **文件大小**：15 个 God 文件（ConfigCenterPage 1049、TagExplorerPage 1019、RulesPage 947、settingsRegistry 878…），阶段 4 批次 D/F/G/H 拆分后移除。
- **any**：基线 2 处，阶段 4/5 清理后下调。

### ratchet 原则
门禁只收紧不放松。每项豁免有明确移除条件（阶段 4 批次）。修复后删除豁免条目即收紧门禁——防止回退。CI 每次运行验证豁免仍需存在（若已修复，lint 提示"豁免可移除"）。

## npm audit 结果（2026-10-02）

### 执行方式
```bash
npm audit --registry=https://registry.npmjs.org
```
> 项目 `.npmrc` 指向 `registry.npmmirror.com`（国内镜像），该镜像不实现 audit 端点。audit 必须显式指定官方 registry。

### 发现
| 严重度 | 包 | 路径 | 建议 |
|---|---|---|---|
| low | dompurify 3.4.13-15 | monaco-editor → dompurify | `npm audit fix` 或随批次 J 自托管 Monaco 升级（TD-SEC-013） |

**无 high/critical。** dompurify 漏洞（GHSA-p98j-92pf-mc4p）用于 Monaco markdown 预览，非应用配置路径，低危。

### js-yaml 供应链核实（TD-SEC-004）
- js-yaml@5.4.2 解析自 `registry.npmmirror.com`。
- **integrity 哈希与 `registry.npmjs.org` 官方一致**（`sha512-m+aqu+…`）→ 镜像 tarball 内容与官方相同，非 fork/typosquat。
- 结论：供应链风险已核实缓解。audit 需指定官方 registry。

### CI 集成
`ci.yml` 的 Coverage 步骤后可加 audit 步骤（阶段 3 暂未加，因 npmmirror 不支持；可加 `npm audit --registry=https://registry.npmjs.org || true` 作信息性，或切官方 registry）。
