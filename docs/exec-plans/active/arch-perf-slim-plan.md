# 架构 / 性能 / 交互 / 代码瘦身 优化方案

> CoreC-Dashboard · 多 agent 审查产出 · 2026-10-03
> 基线：tsc ✓ · biome ✓ (173 files) · vitest ✓ (610 tests) · vite build ✓
> 分支：`harnessing/arch-perf-slim`
> 约束：重构不改变业务行为；行为变更显式登记。不引入 bug 与功能逻辑问题。

## 一、审查方法

4 个并行 agent 分方位深度审查 + 架构师亲自逐文件复核：
- **性能 agent** → `PERFORMANCE_AUDIT.md`（13 findings）
- **交互/响应式 agent** → `UX_AUDIT_REPORT.md`（21 findings）
- **架构 agent** → 层级 / 耦合 / 状态边界 / 过度设计（进行中）
- **瘦身 agent** → 死代码 / 重复 / 冗余 / 过度抽象（进行中）

## 二、架构问题

项目已历经批次 A–J 重构（tech-debt 73/77 已结清），层级干净、feature-sliced 边界完整。
剩余项由架构 agent 补充。已确认的健康不变量：零跨 feature 直连、下层干净、UI 原语近纯展示、流式路径已加固、无 XSS sink。

## 三、性能问题

| # | 严重度 | 位置 | 问题 | 修复 | 行为影响 |
|---|---|---|---|---|---|
| P1 | MAJOR | `api/hooks/index.ts:83` | useTags 5s REST 轮询与 WS 流冗余——数据首次 seed 后被忽略 | 移除 refetchInterval | 无（数据 seed 后即忽略） |
| P2 | MAJOR | `api/hooks/index.ts:131` | useDeadLetters 4s 轮询过激（全站最快），驱动 DashboardPage 每 4s 重渲 | 4s → 15s | 变更行为（新鲜度降低，登记） |
| P3 | MAJOR | `RulesPage.tsx:389` | rules 列表未虚拟化，O(n) 渲染，每 15s 全量重渲 | 加 @tanstack/react-virtual + memo 行 | 无 |
| P4 | MAJOR | `vite.config.ts:204` | recharts 364KB 仅用于 2 个 25 点图表；lightweight-charts 已打包 | **暂缓**——替换为 canvas 图表属视觉行为变更，风险高，登记为后续项 | — |
| P5 | MINOR | `index.css:439` | .sidebar-transition 动画 width 属性触发 reflow | 保留（仅 200ms 用户触发，低频） | 无 |
| P6 | MINOR | `TagExplorerPage.tsx` | closeTrend 未 useCallback | 加 useCallback | 无 |
| P7 | MINOR | `count-up-number.tsx` | CountUpNumber 未 memo | 加 memo | 无 |
| P8 | MINOR | `index.html:18` | Google Fonts 渲染阻塞 | 加 `media` swap 技巧 | 无 |

已优秀项（无需动作）：WS 环形缓冲限流 500msg/s、rAF 批处理、TagTable 虚拟化、路由懒加载、Monaco 自托管、manualChunks 拆分、图表 memo+窗口封顶、组合层 CSS 动画、prefers-reduced-motion。

## 四、交互体验问题

| # | 严重度 | 位置 | 问题 | 修复 | 行为影响 |
|---|---|---|---|---|---|
| U1 | CRITICAL | `TagTable.tsx:84` + `tagExplorer.ts:10` | 8 列百分比表在 ~360px 手机挤压至不可用，无横向滚动无卡片替代 | 手机端横向滚动（min-width 列 + overflow-x-auto） | 无 |
| U2 | MAJOR | `useSidebarState.ts:8` | 无平板断点，768px 二元切换 | 3 档 isMobile/isTablet/isDesktop，平板自动折叠侧栏 | 无 |
| U3 | MAJOR | `dialog.tsx:38`, `alert-dialog.tsx:36` | 对话框手机端贴边无间距 | `w-[calc(100%-1.5rem)] sm:w-full` | 无 |
| U4 | MAJOR | 多文件 | 触控目标 <40px（h-7/p-1.5 ≈28px） | h-9/p-2 最小 | 无 |
| U5 | MAJOR | `index.css:79` | text-status-error #d8485a 对比度 ~3.9:1 不达 WCAG AA | 加深至 ~5:1 | 视觉微调 |
| U6 | MAJOR | `DriversPage:268`, `TransportsPage:251` | 硬编码 "Loading…" | t('common.loading') | 无 |
| U7 | MAJOR | `RulesPage:199` | 硬编码 aria-label="Dismiss" | i18n | 无 |
| U8 | MAJOR | `InstanceDialog:68-76` | 颜色标签未翻译 | i18n | 无 |
| U9 | MAJOR | `DriverWizard:466` | 固定像素网格手机溢出被裁切 | overflow-x-auto | 无 |
| U10 | MAJOR | 无 toast 系统 | 操作无瞬时确认反馈 | 加 sonner toast | 新功能 |
| U11 | MAJOR | `TagRow.tsx:60` | 每行 tabIndex=0 致巨量 tab stop | roving-tabindex 或移除行 tabIndex | 无 |
| U12 | MAJOR | 无 aria-live | 实时流无屏幕阅读器播报 | 加 aria-live="polite" | 无 |
| U13 | MINOR | `DiagnosticsPage:71` | text-[8px] 直方图标签不可读 | text-[10px] | 无 |
| U14 | MINOR | `select.tsx:17` | whitespace-nowrap 与 line-clamp-1 矛盾 | 移除 whitespace-nowrap | 无 |
| U15 | MINOR | 多文件 | grid-cols-2 无响应式断点 | 加 sm:/lg: 变体 | 无 |
| U16 | MINOR | `InstancePanel:162` vs `SidebarNav:184` | 语言切换标签不一致 | 统一 | 无 |
| U17 | MINOR | `AlertsPage:221` | defaultValue 与 key 实际含义不符 | 修正 | 无 |

已优秀项：Radix 焦点陷阱、aria-label 覆盖、reduced-motion、6 主题全 token 化、错误/空/破坏性确认模式一致、i18n 键完美对齐（1181=1181）。

## 五、代码瘦身

| # | 类别 | 位置 | 问题 | 修复 | 风险 |
|---|---|---|---|---|---|
| S1 | 死代码 | `transformExprValidator.ts:19-20` | ArithValidationResult 重导出别名，注释称"供测试导入"但无测试使用 | 删除导出 + 过时注释 | 无 |
| S2 | 冗余导出 | `ruleYaml.ts:32` 等 | yamlScalar/deepEqual/ConnField/MetricEntry/Histogram 仅文件内使用却 export | 移除 export 关键字 | 无 |
| S3 | 硬编码 | U6/U7/U8 | 见交互项 | i18n | 无 |

瘦身 agent 完成后补充更多项。

## 六、实施计划（分批，单一职责提交）

### 批次 1 — 安全性能修复（无行为变更）
- P1: useTags 移除 refetchInterval
- P3: RulesPage 虚拟化
- P6: closeTrend useCallback
- P7: CountUpNumber memo
- S1: 删除死导出 ArithValidationResult

### 批次 2 — 响应式布局优化
- U1: TagTable 手机横向滚动
- U2: 平板断点 3 档
- U3: 对话框手机边距
- U4: 触控目标尺寸
- U9: DriverWizard 网格溢出
- U15: 响应式网格断点

### 批次 3 — 交互/可访问性/i18n
- U5: status-error 对比度
- U6/U7/U8: 硬编码字符串 i18n
- U11: TagRow tab stop
- U12: aria-live
- U13/U14/U16/U17: 小项

### 批次 4 — 行为变更（显式登记）
- P2: useDeadLetters 4s → 15s

### 批次 5 — 新功能（可选）
- U10: toast 系统（sonner）

### 暂缓项（高风险行为变更）
- P4: recharts → lightweight-charts（视觉变更，需单独评估）

## 七、交叉审计

实施后用多 agent 多方位交叉审计：typecheck + lint + 610 tests 全绿 + build 对比 + 逐项行为对拍。

## 八、验收标准

- tsc -b ✓ · biome check ✓ · vitest run ✓ (≥610) · vite build ✓
- 无新增 lint 错误
- bundle 不增大（除有意新增依赖）
- 每批 Conventional Commits 单一职责
