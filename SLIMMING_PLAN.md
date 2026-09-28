# CoreC-Dashboard 代码瘦身计划 (Code Slimming Plan)

> 本文档是 CoreC-Dashboard 项目"代码瘦身"审查的实施计划。基于 7 个并行分析 agent 对全代码库的逐文件深读 + 主审 agent 的独立 grep 复核，所有"死代码/未使用"结论均经过全树搜索验证。

## 0. 基线 (Baseline)

| 检查项 | 结果 |
|:---|:---|
| `tsc -b --noEmit` | ✅ 通过 |
| `biome check src` | ✅ 通过 (105 文件) |
| `vitest run` | ✅ 349 测试 / 18 文件全通过 |
| `vite build` | ✅ 通过 (485ms) |
| 代码规模 | ~24,858 行 TS/TSX，107 源文件 |

**瘦身验收门槛**：每个批次后必须保持上述四项全绿，且不改变任何运行时行为。

## 1. 不可触碰的红线 (Gotchas)

实施过程中必须严格遵守 `AI_HANDOVER.md §4` 的 10 条避坑经验，瘦身改动**不得**违反：

1. **Zustand selector 引用稳定性 (#185)** — 不得把 `useMemo` 派生 selector 改成内联 `.map()/.filter()/?? []/对象字面量`。
2. **401 Fail-Closed** — `apiRequest` 收 401 必须调用 `clearAuth()`。
3. **WebSocket 反向代理 upgrade** — `server.mjs` 的 `proxyUpgradeToCoreC()` 保留。
4. **测试 i18n 初始化** — 所有 jsdom 渲染测试保留 `import '@/i18n'`。
5. **配置双路径** — `loadFromConfig` / `loadFromYaml` 均须可用。
6. **Monaco CDN + CSP** — `main.tsx` loader 配置与 `index.html` CSP 兼容性保留。
7. **manualChunks 路由级分割** — `vite.config.ts` 保留。
8. **WebSocket 500msg/s 速率限制 + 指数退避** — 保留（仅删除未读取的计数器，不删限流逻辑）。
9. **configEqual JSON.stringify 深比较** — 保留。
10. **DEFAULT_COREC_URL** — 保持 `'http://127.0.0.1:9090'`。

## 2. 已验证的瘦身发现 (Verified Findings)

### Tier 1 — 纯删除 (低风险，行为不变)

| ID | 文件 | 内容 | 验证 | 净删行 |
|:---|:---|:---|:---|:---:|
| T1-1 | `src/components/ui/separator.tsx` | 整文件未使用（0 导入），`@radix-ui/react-separator` 唯一消费者 | grep ✅ | 24 |
| T1-2 | `src/components/ui/tabs.tsx` | 整文件未使用，`@radix-ui/react-tabs` 唯一消费者 | grep ✅ | 53 |
| T1-3 | `src/components/ui/tooltip.tsx` | 整文件未使用（charts 用的是 recharts Tooltip），`@radix-ui/react-tooltip` 唯一消费者 | grep ✅ | 26 |
| T1-4 | `src/components/ui/sheet.tsx` | 整文件未使用（TagExplorerPage 内联实现 drawer） | grep ✅ | 123 |
| T1-5 | `src/components/wizard/SettingsFieldRenderer.tsx` | 整文件未导入（309行，含 RadioEnumField） | grep ✅ | 309 |
| T1-6 | `src/components/wizard/TagListField.tsx` | 整文件未导入（DriverWizard 自带内联 TagListEditor，无测试） | grep ✅ | 283 |
| T1-7 | `package.json` | 删除 5 个无消费者依赖：`react-separator/react-tabs/react-tooltip/react-dropdown-menu/react-popover` | grep ✅ | 5 |
| T1-8 | `src/api/endpoints/index.ts` | 删除 `getVersion`、`getHealthLive`（0 调用）+ `VersionResponse` 孤儿导入 | grep ✅ | 3 |
| T1-9 | `src/api/hooks/index.ts` + `src/api/endpoints/index.ts` | 删除 `useHealthReady` + `getHealthReady`（0 调用）+ smoke 测试 mock 条目 | grep ✅ | 28 |
| T1-10 | `src/api/websocket.ts` | 删除 `droppedCount` 字段+自增（从未读取，注释谎称 UI 展示） | grep ✅ | 2 |
| T1-11 | `src/api/websocket.ts` | 删除 `updateParams`/`reconnect`（0 外部调用，投机性 API） | grep ✅ | ~12 |
| T1-12 | `src/stores/configStore.ts` | 删除 `clearError` action（0 调用） | grep ✅ | 2 |
| T1-13 | `src/lib/ruleExprValidator.ts` | 删除 `_STRING_OPS`/`_NUMERIC_OPS`/`_SPECIAL_KEYWORDS` 死常量 + `foundFields` Set（只写不读） | 代码核对 ✅ | 10 |
| T1-14 | `src/components/ui/select.tsx` | 删除 `SelectGroup`/`SelectLabel`/`SelectSeparator`（0 使用） | grep ✅ | 26 |
| T1-15 | `src/components/admin/EventLogTerminal.tsx` | 删除 `showCard` prop + bare-terminal 分支（两调用点均用默认 true） | grep ✅ | 8 |
| T1-16 | `src/components/ErrorBoundary.tsx` | 删除 `fallback` render-prop（0 使用，3 处均用默认 Card fallback） | grep ✅ | 5 |

**Tier 1 小计：~919 行删除（含整文件）**

### Tier 2 — 行为保持的小重构 (低-中风险)

| ID | 文件 | 内容 | 风险 |
|:---|:---|:---|:---:|
| T2-1 | `src/stores/connectionStore.ts` + `dashboardStore.ts` | 提取共享 `safePersist` → `src/lib/storage.ts`，两 store 复用 | 低 |
| T2-2 | `src/stores/connectionStore.ts` | 提取 `clearSession(lastError)` 私有 helper，`clearAuth`/`disconnect` 复用（401 fail-closed 不变） | 低 |
| T2-3 | `src/stores/configStore.ts` | 提取 `commit(next)` 私有 helper，14 处提交点复用（DRY，行数不变但不变量集中） | 低 |
| T2-4 | `src/stores/dashboardStore.ts` | 提取 `commitLayout(next)` 私有 helper（不动 debouncedPersist 路径） | 低 |
| T2-5 | `src/stores/configStore.ts` | 删除 4 个 upsert action 中不可达的"名称碰撞守卫"块（`!isXNameUnique` 与 `findX` 同谓词，内部分支永不可达） | 低 |
| T2-6 | `src/features/admin/DriverDetailPage.tsx` + `TransportDetailPage.tsx` | 提取 `formatTimestamp`/`BackLink`/`StatCard`/`Param` → 共享 `DetailPageParts.tsx`（逐字节相同） | 低 |
| T2-7 | `src/features/admin/TransportWizard.tsx` | 提取本地 `buildTransportConfig()`，3 处重复的对象字面量复用 | 低 |
| T2-8 | `src/features/admin/DriverWizard.tsx` | 删除空 no-op `if (field.visibleWhen){}` 块 | 低 |
| T2-9 | `src/features/admin/RuleWizard.tsx` | 删除恒真守卫 `step1Valid = action !== null`（action 非 null 类型） | 低 |

### Tier 3 — 较大重构 (中风险，须测试把关)

| ID | 文件 | 内容 | 风险 |
|:---|:---|:---|:---:|
| T3-1 | `src/features/admin/DriverWizard.tsx` + `TransportWizard.tsx` | 提取共享 `RegistryFieldGrid`/`RegistryFieldInput` → `src/components/wizard/RegistryFieldGrid.tsx`（~120行去重） | 中 |
| T3-2 | 3 个 Wizard | 提取 `WizardContextValidationBanner` 共享组件（~75行去重） | 中 |
| T3-3 | `RuleWizard.tsx` + `RuleGroupEditor.tsx` | 提取 `ExprValidationMessages` 共享组件（~45行去重） | 中 |
| T3-4 | `DriverDetailPage.tsx` + `TransportDetailPage.tsx` | 提取 `EntityEditConfigCard` 可折叠编辑卡片外壳（~55行去重） | 中 |
| T3-5 | `src/lib/ruleExprValidator.ts` + `transformExprValidator.ts` | 提取共享 `exprShared.ts`（结果类型 + 空表达式守卫 + 平衡括号检查） | 中 |
| T3-6 | `src/lib/configSchema.ts` | 提取 `checkRuleTargetRefs` 局部 helper（rules 与 rule-groups 重复的引用校验） | 中 |
| T3-7 | `src/lib/settingsRegistry.ts` | 提取 `MODBUS_CONNECTION_FIELDS` 片段（5 个 modbus 驱动重复的连接字段组） | 中 |
| T3-8 | `src/lib/configYaml.ts` | 提取 `makeArrayEntityHelpers` 泛型工厂（4 实体类型 × 4 函数 = 16 个重复） | 中 |
| T3-9 | `src/api/hooks/index.ts` | 提取 `useConnectedQuery<T>` helper（13 个近乎相同的 useQuery 调用，保留 primitive `isConnected` selector） | 中 |

### 暂不实施 (Deferred / Skip)

| 项 | 原因 |
|:---|:---|
| F-COMP-09 LCS line-diff 统一 | 标记为 behavior-change 风险（两种不同 DP 遍历，可能重排 diff 行）；收益 45 行但风险高于其他项，本轮跳过 |
| F-COMP-11 AppShell 提取 | 净行数 ~0，纯样式 DRY，无实质瘦身 |
| i18n 未使用键清理 | 1056 键，动态 `t()` 拼接风险高，收益不确定，本轮跳过 |
| 历史审计文档删除 | 非代码；`CONFIGURATION_FEATURE_PLAN.md` 仍被 src 注释引用须保留；其余审计文档为历史记录，本轮保守保留 |

## 3. 实施分区 (Implementation Partition)

为支持多 agent 并行且不冲突，按**互斥文件集**分区。每个 agent 拥有且只改自己分区内的文件 + 可创建新文件。

### Wave 1 — 纯删除 + 简单死代码 (并行，互斥)

| Agent | 拥有文件 | 任务 |
|:---|:---|:---|
| **A-delete-files** | `ui/{separator,tabs,tooltip,sheet}.tsx`, `wizard/{SettingsFieldRenderer,TagListField}.tsx`, `package.json` | T1-1..T1-7 |
| **B-api** | `src/api/**`, `pages_render_smoke.test.tsx` | T1-8..T1-11 |
| **C-lib-dead** | `src/lib/ruleExprValidator.ts` | T1-13 |
| **D-stores-dead** | `src/stores/configStore.ts` | T1-12 |
| **E-components** | `ui/select.tsx`, `ErrorBoundary.tsx`, `admin/EventLogTerminal.tsx` | T1-14..T1-16 |

**Wave 1 验收**：`tsc` + `biome` + `vitest` + `build` 全绿。

### Wave 2 — 行为保持重构 (并行，互斥)

| Agent | 拥有文件 | 任务 |
|:---|:---|:---|
| **F-stores** | `src/stores/{configStore,connectionStore,dashboardStore}.ts`, 新 `src/lib/storage.ts` | T2-1..T2-5 |
| **G-lib** | `src/lib/{ruleExprValidator,transformExprValidator,configSchema,settingsRegistry,configYaml}.ts`, 新 `src/lib/exprShared.ts` | T3-5..T3-8 |
| **H-api** | `src/api/hooks/index.ts` | T3-9 |
| **I-wizards** | `DriverWizard.tsx`, `TransportWizard.tsx`, `RuleWizard.tsx`, `RuleGroupEditor.tsx`, 新 `src/components/wizard/{RegistryFieldGrid,WizardContextValidationBanner,ExprValidationMessages}.tsx` | T2-7,T2-8,T2-9,T3-1..T3-3 |
| **J-detail** | `DriverDetailPage.tsx`, `TransportDetailPage.tsx`, 新 `src/components/admin/DetailPageParts.tsx` | T2-6,T3-4 |

**Wave 2 验收**：`tsc` + `biome` + `vitest` + `build` 全绿。

## 4. 交叉审计 (Cross-Audit)

Wave 2 验收通过后，派出多 agent 从不同角度交叉验证：
- **审计-行为等价性**：逐项核对每个 Tier 2/3 改动的前后行为等价（重点 #185 selector、401、WS 限流、配置双路径）。
- **审计-遗漏死代码**：重新全树 grep 残留未使用导出/导入。
- **审计-构建产物**：对比 dist chunk 大小，确认无异常膨胀/缺失。
- **审计-测试覆盖**：确认 349 测试仍全通过，无测试被弱化。

## 5. 预期收益

- **净删行**：Tier 1 ~919 行 + Tier 2/3 去重 ~400 行 ≈ **1300+ 行**（约 5% 代码量）。
- **依赖减少**：5 个 radix 包移除。
- **维护性**：wizard/detail-page/store/lib 的重复逻辑集中化，单一不变量点。

## 6. 回滚策略

每个 Wave 完成后单独 commit，便于精确回滚。最终 push 前确保 main 分支全绿。
