# CoreC-Dashboard 信息完整性审计报告

> 审计日期: 2025-09-30
> 审计范围: CoreC-Dashboard 全部页面 + CoreC 后端 API
> 状态: **待用户确认** — 确认后按优先级修改

---

## 背景

CoreC 后端 API 提供以下关键端点：

| 端点 | 返回内容 | 包含连接详情? |
|------|---------|:---:|
| `GET /drivers` | 驱动运行状态 + 计数器 | ❌ |
| `GET /transports` | 传输运行状态 + 计数器 | ❌ |
| `GET /rules` | 规则逻辑 + 命中统计 | ✅ (match/action/target) |
| `GET /stats` | 聚合统计 | ❌ |
| `GET /configs` | 配置摘要 (仅名称+类型) | ❌ |
| **`GET /configs/raw`** | **完整 YAML 配置 (密钥脱敏为 `***`)** | **✅** |
| `GET /configs/raw` 包含 | broker, host, port, slave-id, url, webhook-addr, topic-template, data-topic, qos, ... | ✅ |

**核心发现**: `GET /configs/raw` 已验证可用，返回完整 YAML（含所有连接参数，仅密码脱敏）。但 Dashboard 的驱动/传输列表和详情页**从未调用此端点来展示连接信息**，只在 Config Center 的 YAML 编辑器和折叠的编辑表单中使用。

---

## 一、传输 (Transports) — 信息缺失最严重

### 1.1 传输列表页 (`TransportsPage.tsx`)

**当前显示**: name, type, state, published, failed, received, queue_size, dropped_commands, last_publish

**缺失**:
- ❌ MQTT broker 地址 (如 `tcp://127.0.0.1:1883`)
- ❌ MQTT topic-template / data-topic / command-topic
- ❌ MQTT qos, client-id
- ❌ HTTP 发布 URL (如 `http://127.0.0.1:9095/data`)
- ❌ HTTP webhook-addr / webhook-path (订阅地址)
- ❌ HTTP method, headers
- ❌ batch-size, flush-interval, retry-count, buffer-size, fallback

### 1.2 传输详情页 (`TransportDetailPage.tsx`)

**当前显示**: name, type, state, published, failed, received, dropped_commands, last_publish, queue_size

**缺失**:
- ❌ **当前 YAML 配置未展示** — 详情页应显示此传输的完整 YAML 片段
- ❌ 连接目标 (broker/URL) 未作为只读信息展示 — 仅在折叠的"编辑配置"表单中
- ❌ HTTP webhook-addr / webhook-path / webhook-secret 完全未展示且不可编辑
- ❌ MQTT data-topic / command-topic / command-secret 未展示且不可编辑
- ❌ MQTT retained, clean-session, keep-alive, connect-timeout, publish-timeout
- ❌ MQTT TLS 文件 (tls-ca/tls-cert/tls-key-file)
- ❌ HTTP timeout, TLS 文件, max-idle-conns, idle-conn-timeout
- ❌ parser 配置 (type, driver, tag, value, group, timestamp-format, tag-from-topic)
- ❌ 顶层 retry-count, buffer-size 未展示

### 1.3 🔴 BUG: MQTT 编辑表单字段名错误

`TransportDetailPage.tsx` 第 57 行使用 `'topic'` 作为配置键，但 CoreC 实际字段名是 `'topic-template'`。导致：
- 编辑后写入的配置不生效
- 从 `/configs/raw` 预填时 topic 字段为空

---

## 二、驱动 (Drivers) — 详情页不可达

### 2.1 驱动列表页 (`DriversPage.tsx`)

**当前显示**: name, type, state, tag_count, read_count, error_count, reconnect_count, last_read, last_error

**缺失**:
- ❌ Modbus: host, port, slave-id
- ❌ S7: host, rack, slot
- ❌ OPC UA: endpoint
- ❌ Modbus RTU: serial-device, baud-rate

### 2.2 🔴 BUG: 驱动详情页不可达

`DriversPage` 点击驱动卡片时打开一个**仅显示 tag 值表格的弹窗**，而不是导航到 `DriverDetailPage`。而 `DriverDetailPage`（包含连接参数、编辑表单、完整 tag 表）只能通过手动输入 URL 访问。

**对比**: TransportsPage 正确导航到 TransportDetailPage，DriversPage 不一致。

### 2.3 驱动详情页 (`DriverDetailPage.tsx`)

**当前显示**: name, type, state, error_count, reconnect_count, read_count, last_read, tag_count, last_error + tag 值表

**缺失**:
- ❌ **当前 YAML 配置未展示**
- ❌ 连接参数 (host:port, endpoint, serial-device) 未作为只读信息展示 — 仅在折叠的编辑表单中
- ❌ Modbus: timeout, retry, reconnect-interval, reconnect-max-interval, max-reconnect-failures
- ❌ Modbus TLS: cert-file, key-file, ca-file
- ❌ S7: port, idle-timeout
- ❌ OPC UA: mode, username, password, subscription-interval, subscription-buffer, max-batch-size, cert-file, key-file, security-policy, security-mode
- ❌ tags-interval
- ❌ tag 详细配置: address, scale, offset, deadband, read-timeout (仅显示 value/type/quality)

---

## 三、规则 (Rules)

### 3.1 规则列表页 (`RulesPage.tsx`)

**当前显示**: priority, name, type, match, action, target(s), hit_count, miss_count, hit_at, disabled

**缺失**:
- ❌ `miss_at` (上次未命中时间) — API 返回但未展示
- ❌ transform 配置 (expression, tag-rename) — transform 类型规则的核心逻辑未展示

### 3.2 规则编辑弹窗

**缺失**:
- ❌ transform 类型规则: expression 和 tag-rename 不可编辑
- ❌ mirror 类型规则: 多目标 `targets[]` 不可编辑 (仅有单 target 字段)
- ❌ 规则类型 (simple/rule-set/sub-rule) 不可编辑
- ❌ disabled 状态不在编辑弹窗中 (仅在列表表格的开关)

---

## 四、首页实例卡片 (`InstanceCard.tsx`)

**当前显示**: name, url, version, uptime, status dot, points/sec, total_read, 拓扑流 (驱动→规则→传输), tag_count, total_errors

**缺失**:
- ❌ `total_publish` (总发布数) — 在 stats 中有但未展示
- ❌ `total_dropped` (总丢弃数) — 在 stats 中有但未展示
- ❌ 拓扑流中不显示连接目标 (broker 地址、host:port、URL)
- ❌ 每个驱动的 reconnect_count, last_error, last_read
- ❌ 每个传输的 failed, queue_size, dropped_commands, last_publish
- ❌ 每个规则的 miss_count, miss_at, priority

---

## 五、拓扑页 (`TopologyPage.tsx`)

**当前显示**: 3 列架构图 (驱动 → 引擎 → 传输) + 规则管线

**缺失**:
- ❌ 驱动/传输的连接详情 (broker, host, URL) — 仅显示 name + type + state
- ❌ 驱动: last_error, reconnect_count
- ❌ 传输: failed, received, queue_size, dropped_commands
- ❌ 无实际连接线/箭头 — 仅靠布局暗示数据流方向

---

## 六、监控仪表盘 (`DashboardPage.tsx`)

**当前显示**: 6 个 KPI 卡 + 流量/内存图表 + 驱动矩阵 + 传输矩阵 + 最近告警

**缺失/问题**:
- ❌ 驱动/传输卡片无连接详情
- ❌ 驱动卡片: 缺 reconnect_count, last_error, last_read
- ❌ 传输卡片: 缺 failed, received, dropped_commands, last_publish
- 🔴 KPI "引擎状态" 绿点硬编码 — 不随实际 status 变化
- 🔴 空系统显示 "100% online" — 误导

---

## 七、其他页面

### 7.1 诊断页 (`DiagnosticsPage.tsx`)
- ❌ 指标无自动刷新 (仅手动按钮)
- ❌ `/metrics` 获取失败时静默显示 0
- ❌ 直方图仅 avg/count/sum，无 p50/p95/p99
- ⚠️ pprof 下载失败用 `alert()` 阻断式弹窗

### 7.2 写入控制页 (`WriteControlPage.tsx`)
- ❌ 无写入历史/审计日志
- ❌ 无批量写入
- ⚠️ "Clear All" 仅客户端清除 (刷新后恢复)
- ⚠️ DLQ 重试无确认弹窗 (直接重发到物理设备)

### 7.3 标签浏览器 (`TagExplorerPage.tsx`)
- ❌ 无列排序
- ❌ 无 group 筛选器
- ❌ 无导出/CSV 下载
- ❌ 无 quality 筛选
- ❌ 趋势图仅数值类型，仅实时 WS 采样 (无历史查询)

### 7.4 告警页 (`AlertsPage.tsx`)
- ❌ 无告警历史持久化 (刷新丢失)
- ❌ 无告警确认/静音/按规则过滤
- ❌ 无实时错误流过滤
- ⚠️ "系统错误流"计数仅反映内存中 ≤50 条，非服务端总数

---

## 八、Config Center (`ConfigCenterPage.tsx`)

**已实现**: ✅ YAML 编辑器 (Monaco) + 表单编辑器 + 模板 + 上传下载 + diff + 热重载 + 验证

**缺失**:
- ❌ 表单模式下驱动/传输的 per-entity 设置不可编辑 (仅全局/节点/规则提供者/规则组)
- ❌ 活动配置摘要仅显示 name + type，不显示连接参数
- ⚠️ 如果 `/configs/raw` 失败，回退到示例 YAML (`DEFAULT_SAMPLE_YAML`)，无明确提示

---

## 修改优先级建议

### P0 — 严重 (影响核心可用性)
1. **MQTT 编辑表单字段名 bug** (`'topic'` → `'topic-template'`)
2. **驱动详情页不可达** — 列表点击应导航到详情页 (与传输一致)

### P1 — 高 (用户直接抱怨的问题)
3. **传输详情页**: 添加只读"连接信息"卡片，从 `/configs/raw` 解析并展示 broker/URL/webhook-addr/topic 等
4. **传输详情页**: 添加"当前 YAML"展示区
5. **驱动详情页**: 添加只读"连接信息"卡片 (host:port/endpoint/serial-device)
6. **驱动详情页**: 添加"当前 YAML"展示区
7. **传输列表页**: 每个传输卡片显示连接目标摘要 (broker 地址 / URL)
8. **驱动列表页**: 每个驱动卡片显示连接目标摘要 (host:port / endpoint)

### P2 — 中 (信息完整性)
9. **首页卡片**: 显示 total_publish, total_dropped
10. **首页拓扑流**: 显示连接目标摘要
11. **规则编辑**: 支持 transform 和多目标 mirror 编辑
12. **规则列表**: 显示 miss_at
13. **传输/驱动编辑表单**: 补全缺失字段 (timeout, retry, reconnect, TLS, parser, OPC UA 参数等)
14. **HTTP webhook-addr/path 和 MQTT data-topic/command-topic**: 在详情页展示且可编辑

### P3 — 低 (体验优化)
15. **拓扑页**: 添加连接线/箭头，显示连接详情
16. **监控仪表盘**: 修复 KPI 状态点硬编码 bug，修复空系统 100% 显示
17. **诊断页**: 指标自动刷新，pprof 用 toast 替代 alert
18. **告警页**: 告警历史持久化，过滤功能
19. **标签浏览器**: 列排序，group 筛选，导出
20. **写入控制**: 写入历史，批量写入

---

## 待确认

请确认以下问题后我再开始修改：

1. **优先级是否同意?** P0/P1 是否先做?
2. **连接信息展示方式**: 只读卡片 + 可折叠 YAML? 还是直接在现有卡片中增加字段?
3. **是否需要为驱动/传输列表页也显示连接摘要?** (如 `host:502` / `tcp://broker:1883`) 还是只在详情页显示?
4. **P2/P3 中哪些需要包含在本次修改?** 还是先做 P0+P1?
5. **是否有其他你觉得不合理但审计未覆盖的地方?**
