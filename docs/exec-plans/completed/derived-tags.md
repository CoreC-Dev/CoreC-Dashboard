# 执行计划：派生标签前端（CoreC-Dashboard）

> 状态：已完成 · 依赖后端：`CoreC/docs/exec-plans/completed/derived-tags.md`（D1 完成后前端可联调）
> 业务行为影响：**无**（纯新增页面/表单，不改现有行为）

## 1. 目标

在配置中心新增"派生标签"管理页：列表 / 新增 / 编辑 / 删除 / expr 实时试算器。派生 tag 在 TagExplorer 与实时流中与真实 tag 无差别展示（后端产出正常 DataPoint），**无需特殊查看 UI**。

## 2. 设计

### 2.1 类型与 schema（`src/types/` + `src/lib/configSchema.ts`）

```ts
// types/config.ts 追加
export interface DerivedTagConfig {
  name: string
  expr: string
  type: DataType
  group?: string
  interval: string
  unit?: string
  'on-missing'?: 'skip' | 'bad-quality' | 'zero'
  'stale-guard'?: string
}
```
- `configSchema.ts` 加 `derivedTagsSchema = z.array(z.object({...}))`，含 name 唯一校验、expr 非空、interval 正则、on-missing 枚举。
- 顶层 config schema 追加 `'derived-tags': derivedTagsSchema.optional()`。

### 2.2 管理页（`src/features/admin/DerivedTagsPage.tsx`）

平行于 `RulesPage.tsx` 结构（列表 + 行内编辑/删除 + 新增弹窗）：
- 列表列：name / expr（截断 + tooltip）/ type / interval / group。
- 编辑用 `EntityEditConfigCard` + settingsRegistry 风格的声明式字段（复用批次 D 已落地的 registry 模式）。
- **expr 试算器**：编辑面板内嵌一个输入框，用户输入若干 `tag=value` 样例，前端用 `expr-lang/expr`（或经后端 `POST /configs/validate` 代算）实时预览结果。MVP 走后端 validate 代算（避免前端引入 expr 编译器）。

### 2.3 路由与导航

- `App.tsx` 加懒加载路由 `/admin/derived-tags` → `DerivedTagsPage`。
- `AppShell` 侧栏 admin 组下加"派生标签"项（复用现有 nav 配置）。

### 2.4 API hooks（`src/api/endpoints/` + `src/api/hooks/`）

派生标签经 `PUT /configs` 整体配置保存（与规则同模式，无独立 CRUD 端点）。复用现有 `useUpdateConfig` mutation，失效 `['configs']` query key。
- 若后端后续提供独立端点，再加 `useDerivedTags` hook；MVP 不需要。

### 2.5 i18n

- `src/i18n/` zh-CN/en 资源加 `derivedTags.*` 键（页面标题、字段标签、试算器提示）。

## 3. 批次分解

| 批次 | 范围 | 文件 | 验收 |
|---|---|---|---|
| **FD1** | 类型 + zod schema | `types/config.ts`、`lib/configSchema.ts` + 测试 | 非法 derived-tags 配置被 zod 拒；合法通过 |
| **FD2** | 管理页 + 路由 + 导航 | `features/admin/DerivedTagsPage.tsx`、`App.tsx`、AppShell nav、i18n | 页面渲染测试通过；列表/编辑/删除可用；文件 <300 行 |
| **FD3** | expr 试算器 | 试算器子组件（经 `POST /configs/validate` 代算）+ 测试 | 样例输入 → 预览结果；缺 tag 显示提示 |
| **FD4** | 配置模板 + 文档 | `lib/configTemplates.ts` 加派生标签模板；`docs/FRONTEND.md` 更新 | 模板可加载；lint 通过 |

## 4. DoD

- [ ] 派生标签页可增删改查，保存后后端 `/configs` 含 `derived-tags` 段。
- [ ] zod 校验拦截非法配置（重复 name、空 expr、非法 interval）。
- [ ] expr 试算器可预览（联调后端 validate）。
- [ ] `npm run lint` + `npm test` 通过；新文件 <300 行；结构测试依赖方向通过（features 不跨域直引）。
- [ ] i18n 中英齐全；无硬编码字符串。

## 5. 约束

- 遵守分层：`types ← lib ← api ← stores ← hooks ← components ← features`。DerivedTagsPage 只经 `api/hooks`/`stores`/`components`/`lib` 共享，不直引其他 feature。
- 边界校验：用户输入的 derived-tags 经 zod 校验后才进 configStore（core-belief #15）。
