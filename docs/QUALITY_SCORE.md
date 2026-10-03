# QUALITY_SCORE.md

> 按业务域与架构层打分，追踪与目标的差距。分数有可复算依据（见各行"依据"）。
> 阶段 1 扫描基线（2026-10-02）。随阶段 4/5 改造更新。

## 评分维度
| 维度 | 满分 | 说明 |
|---|---|---|---|
| 测试覆盖 | 10 | 关键路径有测试 + 边界/异常 + 注入缺陷可失败 |
| 文档完备 | 10 | 该域/层有行为说明与边界，非"是什么"复述 |
| 复杂度 | 10 | 无 God 组件/函数；单文件 <300 行；圈复杂度 <10 |
| 依赖合规 | 10 | 无层反转/跨域直连；符合 ARCHITECTURE.md 方向 |
| 重复 | 10 | 无跨模块复制粘贴；公共逻辑已收敛 |

## 按业务域
| 域 | 测试 | 文档 | 复杂度 | 依赖 | 重复 | 综合 | 主要差距（→ 台账 ID） |
|---|---|---|---|---|---|---|---|
| admin | 6 | 4 | 3 | 6 | 4 | **4.6** | 3 God 组件（CPLX-001/003/007）、CRUD/apply 重复（DUP-003/005）；ARCH-011/DUP-001 已结清（单源派生，commit 17c722c）；TEST-008 全 18 端点已测 |
| monitor | 6 | 4 | 4 | 7 | 5 | **5.2** | TagExplorer God 组件（CPLX-002）、AlertsPage 死信未封顶（PERF-004）；TEST-004 WS 已测 |
| home | 7 | 4 | 6 | 7 | 6 | **6.0** | TEST-002/006/007 已测（instanceStore/probe/dialog） |
| settings | 6 | 4 | 7 | 8 | 7 | **6.4** | 导出泄密（SEC-003 P0）、导入未校验（SEC-011） |

## 按架构层
| 层 | 测试 | 文档 | 复杂度 | 依赖 | 重复 | 综合 | 主要差距（→ 台账 ID） |
|---|---|---|---|---|---|---|---|
| types | 5 | 5 | 8 | **6** | 9 | **6.6** | types→lib 反向（ARCH-001）、CoreCInstance 在 store（ARCH-006） |
| lib | 8 | 5 | 6 | **6** | 7 | **6.4** | lib/utils 耦合 i18n（ARCH-004/009）、configSchema 165 行（CPLX-004）、settingsRegistry 878 行（ARCH-013）；TEST-010/011/012/013/016 已测 |
| api | 7 | 5 | 7 | **6** | 8 | **6.6** | api↔contexts 环（ARCH-002）、无 WS hook（ARCH-007）；TEST-003/004/008/009 已测 |
| stores | 8 | 5 | **5** | 8 | 8 | **6.8** | configStore 29 方法 God Object（ARCH-003）；TEST-002 已测 |
| hooks/contexts | 7 | 4 | 7 | 7 | 8 | **6.6** | TEST-005/009 已测（ConnectionContext/api-hooks） |
| components | 6 | 5 | 5 | 8 | 7 | **6.2** | AppShell 537 行（CPLX-005）、count-up 引 hooks（ARCH-005）、EntityEditConfig 17 props（ARCH-012）；wizard 渲染测试已补；InstanceSelector #185 回归测试已补 |
| features | 6 | 4 | **3** | 8 | **5** | **5.2** | 6 God 组件（CPLX-001/002/003/005/006/007）、重复 DUP-002..006（DUP-001 已结清，单源派生）；TEST-006/007/014 已测 |

## 横切
| 维度 | 分 | 依据 |
|---|---|---|
| 安全 | **5/10** | 1 P0（SEC-003）+ 3 P1 + 8 P2；已确认无 XSS/SSRF/路径穿越；7 项决策已确认（见 architecture-decisions.md） |
| 性能/可靠性 | **7.5/10** | 流式/超时/拆分已加固；2 P1（PERF-001/002）+ 10 P2（memo/虚拟化/防抖缺口）；已修复 InstanceSelector `useShallow` 致 React #185 无限循环（全实例路由崩溃，回归守卫 `InstanceSelector.test.tsx`）；arch-perf-slim 轮：移除 useTags 冗余 5s 轮询、useDeadLetters 4s→15s、closeTrend/CountUpNumber memo、6 测试文件补 cleanup() 消除 unhandled error |
| 门禁/CI | **3/10** | 仅 deploy.yml push-main；无 PR 门禁/覆盖率/hook/结构测试（GATE-001..004） |
| 文档 | **4/10** | 阶段 2 前无 AGENTS/ARCHITECTURE/docs 结构（DOC-001..003）；本阶段补齐后预期 → 8 |

## 目标与差距
- **阶段 5 DoD 目标**：每域/层综合 ≥ 7.0；安全 8+；门禁 8+；文档 8+。
- **当前最大短板**：features 层复杂度（3.0，God 组件）、门禁/CI（3.0）、admin 域重复（4.0）。测试覆盖已大幅提升（610 tests，TD-TEST-002..016 全结清）。
- **复算方式**：`npm run test:coverage`（阶段 3 接入）+ 结构测试（依赖方向/文件大小）+ 本台账计数。每次阶段 4 批次完成后重算本文件。
