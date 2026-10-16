# 执行计划：通知传输前端（CoreC-Dashboard）

> 状态：已完成 · 依赖后端：`CoreC/docs/exec-plans/completed/notify-transport.md`（N1 完成后前端可联调）
> 业务行为影响：**无**（纯新增传输类型 + 测试按钮）

## 1. 目标

在传输管理中支持 `notify` 类型：channel 字段驱动条件字段（slack→webhook-url、email→SMTP 字段、webhook→url/headers），并提供"发送测试通知"按钮验证通道连通性。notify 传输在 TransportsPage 与其他传输无差别展示。

## 2. 设计

### 2.1 settingsRegistry 注册（`src/lib/settingsRegistryTransport.ts`）

`TRANSPORT_SETTINGS_REGISTRY` 追加 `notify` 条目（镜像 `mqtt`/`http` 结构）：
```ts
notify: {
  channel: { type: 'enum', options: ['slack','teams','email','webhook'], ... },
  'webhook-url': { type: 'string', secret: true, showIf: { channel: ['slack','teams'] }, ... },
  'smtp-host': { type: 'string', showIf: { channel: 'email' }, ... },
  'smtp-port': { type: 'number', showIf: { channel: 'email' }, ... },
  'smtp-user': { type: 'string', showIf: { channel: 'email' }, ... },
  'smtp-pass': { type: 'string', secret: true, showIf: { channel: 'email' }, ... },
  from: { type: 'string', showIf: { channel: 'email' }, ... },
  to: { type: 'string-list', showIf: { channel: 'email' }, ... },
  subject: { type: 'string', showIf: { channel: 'email' }, ... },
  body: { type: 'text', showIf: { channel: 'email' }, ... },
  url: { type: 'string', showIf: { channel: 'webhook' }, ... },
  method: { type: 'enum', options: ['POST','PUT'], showIf: { channel: 'webhook' }, ... },
  headers: { type: 'map', showIf: { channel: 'webhook' }, ... },
  'body-template': { type: 'text', showIf: { channel: 'webhook' }, ... },
  template: { type: 'text', showIf: { channel: ['slack','teams'] }, ... },
  cooldown: { type: 'string', ... },
}
```
- `showIf` 条件显隐：channel 选 email 时只显 SMTP 字段。复用现有 registry 的条件显隐能力（若不存在，登记为前置小改造）。
- 密钥字段标 `secret: true`，复用现有脱敏渲染（输入框 type=password，导出脱敏）。

### 2.2 config schema 校验（`src/lib/configSchema.ts`）

追加 `if (t.type === 'notify')` 分支：
- `channel` 必填且枚举合法。
- channel=slack/teams → `webhook-url` 必填。
- channel=email → `smtp-host`/`from`/`to` 必填。
- channel=webhook → `url` 必填。
- `cooldown` 若提供须为合法 duration。

### 2.3 测试通知按钮（`TransportDetailPage`）

- TransportDetailPage 对 `type === 'notify'` 的传输显示"发送测试通知"按钮。
- 调 `POST /transports/{name}/test`（后端 N4 提供），react-query mutation，成功/失败 toast。
- 复用现有 `useStatusMessage` hook 显示结果。

### 2.4 API endpoint（`src/api/endpoints/index.ts`）

```ts
export const testTransport = (name: string) =>
  apiRequest<{ ok: boolean; message?: string }>(`/transports/${encodeURIComponent(name)}/test`, { method: 'POST' })
```
- `api/hooks` 加 `useTestTransport` mutation。

### 2.5 i18n

- `src/i18n/` 加 `notify.*` 键（channel 选项标签、字段帮助、测试按钮、成功/失败提示）。

## 3. 批次分解

| 批次 | 范围 | 文件 | 验收 |
|---|---|---|---|
| **FN1** | settingsRegistry + schema | `lib/settingsRegistryTransport.ts`、`lib/configSchema.ts` + 测试 | notify 类型字段正确显隐；非法配置被 zod 拒 |
| **FN2** | 测试按钮 + endpoint | `api/endpoints/index.ts`、`api/hooks`、`features/admin/TransportDetailPage.tsx` + 测试 | 按钮仅 notify 显示；点击调 POST /test；toast 显示结果 |
| **FN3** | 模板 + 文档 | `lib/configTemplates.ts` 加 notify 模板；`docs/FRONTEND.md` | 模板可加载；lint 通过 |

## 4. DoD

- [ ] 传输向导/详情页可配置 notify 四种 channel，字段按 channel 条件显隐。
- [ ] 密钥字段脱敏渲染 + 导出脱敏（复用 SEC-003 机制）。
- [ ] 测试通知按钮联调后端成功/失败反馈。
- [ ] zod 校验拦截缺字段配置。
- [ ] `npm run lint` + `npm test` 通过；新文件 <300 行；结构测试依赖方向通过。
- [ ] i18n 中英齐全。

## 5. 约束

- notify 传输经现有 TransportsPage/wizard 渲染，**不新建 feature**（复用 admin 域），避免跨域直引。
- 边界校验：notify 配置经 zod 校验后才进 configStore（core-belief #15）。
- 密钥不落明文持久层（core-belief #18）：secret 字段复用 sessionStorage + 导出脱敏。
