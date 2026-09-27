# CoreC 工业物联网数据采集与控制核心 — 深度研究报告

## 一、核心定位

**CoreC = Connect · Collect · Control** — 工业自动化 / IIoT / 边缘计算的**高性能、轻量级、配置驱动、插件化数据采集与控制核心**。

- **Headless 纯核心**: 无内置 UI，Go 1.27.1 单二进制，可作为独立 Daemon 或嵌入 MES/SCADA
- **YAML 声明式配置**: 支持 `${ENV_VAR}` 环境变量替换
- **背压丢弃最旧 (Drop-Oldest)**: 采集协程永不阻塞，始终保证最新数据
- **双向数据流**: 上行采集 + 下行控制 + 跨节点透传

## 二、架构全景

```
       ┌────────────────────────────────────────────────────────┐
       │                  CoreC Engine Core                     │
       │                                                        │
[Southbound Drivers]                                   [Northbound Transports]
Modbus TCP/RTU/UDP/TLS  ──┐                      ┌──>  MQTT (Publisher/Inbound)
Siemens S7 (200~1500)   ──┼─> [DataBus] ─> [Rule Engine] ─┼──>  HTTP Push (Batch/Webhook)
OPC UA (Client/Sub)     ──┘      │            │           └──>  (Kafka / gRPC 规划中)
                                 ▼            ▼
                           [LatestCache] [Batcher / Fallback / OfflineBuffer]
                                 │
[Control Plane REST API & WebSocket Stream] (Hub / Route / Executor)
```

## 三、完整 HTTP API

### 公共端点 (无需认证)
| 方法 | 路径 | 说明 |
|:---|:---|:---|
| GET | `/` | 服务基础信息 (name, version, status, time, uptime) |
| GET | `/version` | 版本号 |
| GET | `/healthz/live` | K8s 存活探针 |
| GET | `/healthz/ready` | K8s 就绪探针 (检查驱动/传输连接状态) |

### 需认证端点 (Bearer Token)
| 方法 | 路径 | 说明 |
|:---|:---|:---|
| GET | `/configs` | 获取脱敏配置概要 |
| PUT | `/configs` | 全量热重载配置 |
| PATCH | `/configs` | 运行时微调 (如 log-level) |
| GET | `/drivers` | 所有驱动状态列表 |
| GET | `/drivers/{name}` | 单个驱动状态 |
| GET | `/drivers/{name}/tags` | 指定驱动的标签最新值 |
| GET | `/transports` | 所有传输状态列表 |
| GET | `/transports/{name}` | 单个传输状态 |
| GET | `/tags` | 全局所有标签最新值 |
| POST | `/write` | 控制指令下发写入 |
| GET | `/write/failed` | 死信队列 (写入失败的指令) |
| GET | `/rules` | 规则列表与命中统计 |
| PATCH | `/rules/disable` | 动态启用/禁用规则 |
| GET | `/stats` | 引擎汇总统计 |
| GET | `/metrics` | Prometheus 格式指标 |
| GET | `/debug/pprof/*` | pprof 调试 |

### WebSocket 实时流
| 端点 | 参数 | 说明 |
|:---|:---|:---|
| `/tags/stream` | `?driver={name}` | 实时测点数据推送 |
| `/logs` | 无 | 实时日志事件推送 |
| `/traffic` | `?interval=1s` | 吞吐量监控 (read/publish/dropped) |
| `/memory` | `?interval=1s` | 内存统计 (alloc/sys/gc/goroutines) |

### 认证方式
- Header: `Authorization: Bearer <secret>`
- Query (WebSocket): `?token=<secret>`
- 恒定时间校验 (防时序攻击)
- Secret < 8 字符拒绝启动
- 可配置令牌桶限流

## 四、核心数据模型

```typescript
interface DataPoint {
  driver: string;
  device?: string;
  group?: string;
  tag: string;
  value: any;
  type: DataTypeString;
  quality: number; // 0=Good, 1=Bad, 2=Uncertain
  timestamp: string;
  metadata?: Record<string, string>;
  is_stale?: boolean;
}

interface WriteCommand {
  driver: string;
  device?: string;
  tag: string;
  value: any;
  type: DataTypeString | number;
}

interface DriverStatus {
  name: string;
  type: string;
  state: number; // 0=Disconnected, 1=Connecting, 2=Connected, 3=Error
  last_read: string;
  last_error: string;
  tag_count: number;
  read_count: number;
  error_count: number;
  reconnect_count: number;
}

interface TransportStatus {
  name: string;
  type: string;
  state: number;
  published: number;
  failed: number;
  received: number;
  last_publish: string;
  queue_size: number;
  dropped_commands: number;
}

interface RuleStat {
  index: number;
  name: string;
  type: "simple" | "rule-set" | "sub-rule";
  match: string;
  action: "forward" | "drop" | "alert" | "transform" | "mirror";
  target: string;
  targets: string[];
  priority: number;
  disabled: boolean;
  hit_count: number;
  hit_at: string;
  miss_count: number;
  miss_at: string;
}

interface DeadLetterEntry {
  command: WriteCommand;
  error: string;
  failed_at: string;
  attempts: number;
}
```

## 五、南向驱动协议

### Modbus 家族 (6 种)
- `modbus-tcp`, `modbus-rtu`, `modbus-rtuovertcp`, `modbus-udp`, `modbus-rtuoverudp`, `modbus-tls`
- 地址: 0xxxx (Coils), 1xxxx (DI), 3xxxx (IR), 4xxxx (HR)
- 自动批处理优化 (最大 125 寄存器)
- RTU 串口参数、TLS 双向认证

### Siemens S7
- ISO-on-TCP, 支持 S7-200/300/400/1200/1500
- DB 块、Merker、I/O 地址解析
- 位操作原子保护 (读-改-写)

### OPC UA
- 标准 NodeID 寻址
- 安全策略: None / Basic128Rsa15 / Basic256 / Basic256Sha256
- 双模式: 轮询 + 主动订阅

## 六、北向传输

### MQTT
- Go 模板动态主题
- mTLS 安全传输
- 反向指令 HMAC-SHA256 防重放
- 中继命令透传
- 入站数据接入 (Chained Inbound)

### HTTP Push
- 批量 JSON 聚合推送
- 指数退避重试
- W3C traceparent 分布式追踪
- Webhook 入站接收

### 载荷解析器
- `default`: CoreC DataPoint JSON
- `jsonpath`: gjson 任意字段抽取
- `raw`: 标量数值 + Topic 推导

## 七、规则引擎

### 匹配 DSL (基于 expr-lang/expr)
- 字段: driver, device, group, tag, quality, type, value
- 算子: ==, !=, =~, contains, suffix, prefix, >, <, in 50..100
- 逻辑: &&, ||, !, ()
- 通配: ALL
- 委托: RULE-SET:<name>, SUB-RULE:<name>

### 动作
- `forward`: 转发到单个目标
- `drop`: 丢弃
- `alert`: 转发 + 告警
- `mirror`: 多路转发
- `transform`: 算术变换 (expression + tag-rename)

## 八、生产级容错

- 断网指数退避重连 (2s→30s, ±20% Jitter)
- 断路器 (20 次失败 → 5 分钟冷却)
- 高频日志限频 (10s 窗口聚合)
- 调度器自动降级 (5 次失败 → 10 倍放慢)
- 死区过滤 (Deadband)
- 双通道优先级总线 (≤1s 高优先级)
- 异步批量器 + 备用传输降级
- 落盘离线持久化缓冲 (原子 Rename + fsync)
- 并发信号量控制 + 命令死信队列
- 倒序优雅退出
