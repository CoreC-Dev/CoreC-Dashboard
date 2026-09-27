# CoreC Dashboard — 工业物联网控制与数据采集控制台

> **Connect · Collect · Control**
> 
> 基于 React 19 + TypeScript + Vite 6 + Tailwind CSS v4 + shadcn/ui 的高性能、前沿优雅的工业物联网 Web 监控与控制中台，专为 **CoreC** 采集核心量身打造。

---

## 🌟 核心特性与设计亮点

### 1. 架构与连接
- **纯前端 SPA 直连**: 零中间依赖，通过标准 REST API 与 WebSocket 直接与 CoreC 守护进程通信。
- **Fail-Closed 安全认证**: 严格遵循 CoreC 恒定时间防时序攻击验证（Bearer Token 长度 $\ge$ 8 字符）。
- **指数退避弹性流**: 针对 4 路下行 WebSocket (`/tags/stream`, `/logs`, `/traffic`, `/memory`) 实现具备 $\pm 20\%$ 随机抖动的指数退避自动重连。

### 2. 双空间划分 (Front-Monitor & Back-Admin)
- **前台监控空间 (`/monitor`)**:
  - **总览大屏 (`/monitor/dashboard`)**: KPI 卡片行、数据总线吞吐面积图（读/发/丢弃）、非 STW 内存监控图、南向驱动矩阵、北向传输通道状态、实时告警面板。
  - **实时测点看板 (`/monitor/tags`)**: 虚拟化点位表，WebSocket 驱动的测点毫秒级高亮跳变、按驱动/分组筛选、就地反向控制指令下发。
  - **告警与事件 (`/monitor/alerts`)**: 规则告警过滤器、死信队列（Dead Letter Queue）审计与一键重试。
- **后台管理空间 (`/admin`)**:
  - **南向驱动管理 (`/admin/drivers`)**: Modbus TCP/RTU/TLS、Siemens S7 (200~1500)、OPC UA 状态卡片与点位寄存器抽屉。
  - **北向传输管理 (`/admin/transports`)**: MQTT 动态主题发布者、HTTP Push Webhook 通道、离线落盘缓冲状态。
  - **规则编排引擎 (`/admin/rules`)**: First-match-wins 规则优先级列表、匹配 DSL 展示、运行时一键启用/禁用 (`PATCH /rules/disable`)。
  - **控制下发与死信 (`/admin/write`)**: 16 并发信号量受控的 PLC 寄存器/线圈下发表单，死信重试队列重发。
  - **大屏可视化编排器 (`/admin/dashboard-editor`)**: 针对工控大屏/投屏的可视化卡片编排与配置，自动持久化至本地存储。
  - **配置中心 (`/admin/config`)**: 表单微调 + Monaco YAML 编辑器双模式，秒级调整运行时日志级别 (`PATCH /configs`) 与全量差量热重载 (`PUT /configs`)。
  - **拓扑架构图 (`/admin/topology`)**: CoreC 六边形端口与适配器交互、节点身份与中继透传路径。
  - **系统诊断终端 (`/admin/diagnostics`)**: xterm.js 虚拟终端原生渲染 CoreC 实时事件日志流、Prometheus 指标即时抓取分析、pprof 快捷跳转。
  - **系统设置 (`/admin/settings`)**: 连接端点切换、中英双语国际化切换 (react-i18next)、跟随系统主题 (prefers-color-scheme) / 手动切换。

---

## 🛠️ 技术栈总览

| 模块 | 选用技术 |
|:---|:---|
| **框架与语言** | React 19, TypeScript 5.x (Strict Mode), Vite 8 |
| **样式与组件** | Tailwind CSS v4, Radix UI Primitives, Lucide Icons, clsx, tailwind-merge |
| **状态与数据请求** | TanStack Query v5 (React Query), Zustand (LocalStorage 持久化) |
| **可视化图表** | Recharts (声明式吞吐/内存走势), TradingView lightweight-charts (时序 Canvas) |
| **编辑器与终端** | Monaco Editor (@monaco-editor/react), xterm.js (@xterm/xterm, addon-fit) |
| **国际化与质量** | react-i18next (zh-CN / en), Biome 2.5 (Rust 驱动 Lint/Format), Vitest |

---

## 🚀 快速启动

### 1. 运行依赖
确保本地环境已安装 Node.js ($\ge$ 20.0.0)。

### 2. 启动开发服务器
```bash
npm run dev
```
开发服务器将运行在 `http://localhost:3000`。打开浏览器访问，并输入 CoreC 服务的 API 地址（如 `http://127.0.0.1:9090`）与 API Secret 即可自动进入系统。

### 3. 代码检查与测试
```bash
# 运行 Biome 代码质量检查
npm run lint

# 运行 Biome 自动修复与格式化
npm run lint:fix

# 运行 Vitest 单元测试
npm test

# 生产环境打包构建
npm run build
```

---

## 📦 生产部署

执行 `npm run build` 生成的 `dist/` 目录为纯静态资源，可直接部署在任意 Web 服务器或工业网关上：

### Nginx 静态文件托管配置示例
```nginx
server {
    listen 80;
    server_name corec-dashboard.local;

    root /var/www/corec-dashboard/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```
