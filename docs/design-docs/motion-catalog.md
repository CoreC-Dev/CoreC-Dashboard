# 前端动效目录（Motion Catalog）

> 前端可增加/已增加的动效清单。每条标注**状态**（✅ 已实现 / 🟡 待实施）、落地组件、技术与缓动、一句话理由。
> 缓动令牌见 `src/index.css`：`--ease-spring`（back-out 回弹）、`--ease-smooth`、`--ease-snap`。全部动效尊重 `prefers-reduced-motion`（全局守护已在 `index.css` 末尾）。

## 已有基线（已实现并接入）

| 动效 | 落地 | 技术 |
|---|---|---|
| 路由淡入上移 | `AppShell`（keyed by pathname） | `page-enter` 0.32s `--ease-smooth` |
| 卡片错峰入场 | Dashboard/Alerts/Instance/Drivers/Transports 页 | `card-enter`+`card-stagger` 60ms 间隔 |
| 卡片悬浮抬起 | stat 卡片、InstanceCard、详情卡、`ui/card` | `card-hover` translateY(-3px) `--ease-spring` |
| 状态脉冲 | 连接徽章、Dashboard 引擎状态 | `glow-running` opacity 脉冲 |
| 数字滚动 | Dashboard KPI | `CountUpNumber` ease-out |
| 按钮涟漪+按压 | `ui/button` | `btn-ripple` + `active:scale-[0.97]` |
| 主题圆形扩散 | `ThemeSelector` | View Transitions API `theme-circle-reveal` |
| 侧边栏滑动高亮 | `SidebarNav` | `useNavIndicator` 测量+`--ease-spring` 滑动 |
| 实时行刷新高亮 | `TagRow` | WAAPI opacity 闪烁（`flashTick`） |
| 刷新图标旋转 | `TagToolbar`/`TagTable` | `animate-spin`（fetching 时） |

## 本次新增（✅ 已实现）

| # | 动效 | 落地 | 技术 |
|---|---|---|---|
| 1 | **模式切换滑动指示器** | `ModeSwitcher`（配置中心 Form⇄YAML） | `useSlidingIndicator` 测量活动按钮，overlay 用 `--ease-spring` 在两按钮间滑动 |
| 11 | **横幅下滑入场** | `ValidationBanner`/`UnsavedChangesBanner`/`WizardContextValidationBanner` | `banner-enter` 自 translateY(-6px) 淡入 `--ease-spring` |
| 18 | **骨架屏 shimmer** | `App.tsx` Suspense fallback | `Skeleton` 组件 + `skeleton-shimmer` 方向性扫光 |
| 25 | **Switch 拨杆回弹** | `ui/switch` | thumb `transition-transform duration-300 ease-[var(--ease-spring)]` 过冲 |

## 待实施（🟡，按收益/风险排序）

### 一、同源：共享指示器 / FLIP（最"类似"侧边栏滑动高亮）

1. ~~模式切换滑动指示器~~ ✅
2. **Tab 下划线/胶囊滑动** — 任何 `TabList`（监控子页签等）：单条 underline 用 `--ease-spring` 在 tab 间滑动，复用 `useSlidingIndicator`。
3. **排序 FLIP 行重排** — `TagTable`：点列头改排序时行用 FLIP（测旧位→DOM 更新→invert→play `--ease-spring`）滑到新位置。
4. **向导进度指示器滑动** — `Wizard.tsx`：步骤点间活动环/填充条 spring 滑动并缩放。
5. **筛选/搜索结果集进出** — `TagTable`/`TagExplorerPage`：行集合变化时新增行错峰淡入、移除行淡出收缩（FLIP 或 stagger）。

### 二、数据实时（监控域）

6. **数值方向性闪烁** — `TagRow` 数值格：变化时按升/降短暂染绿/染红（现仅通用 primary 闪烁），叠加轻微数字 roll。
7. **Sparkline 描线入场** — `TagRow`/`TagTrendPanel` 迷你曲线：`stroke-dashoffset` 由满到空描出。
8. **图表路径形变** — `MemoryChart`/`TrafficChart`：切换时间范围时插值/交叉淡化旧→新路径。
9. **实时点脉冲环** — `TagTrendPanel` 最新数据点：恒定扩散+淡出的脉冲环。

### 三、表单与向导（admin 域）

10. **向导步骤横向滑动** — `Wizard.tsx`：next/back 时步骤内容方向感知地横滑+淡入。
11. ~~横幅下滑入场~~ ✅
12. **校验失败抖动** — `ExprValidationMessages`/表单：提交非法时字段/卡片横向往复抖动（spring）。
13. **成功对勾描线** — `ConfigApplyConfirmationDialog`：应用成功时 SVG 对勾 `stroke-dashoffset` 描出 + 圆 scale。
14. **YAML diff 行进出** — `ConfigCenterYaml`：新增行绿色右滑入、删除行红色左滑出。

### 四、浮层与菜单

15. **Dialog 从触发点缩放** — `dialog`/`sheet`/`alert-dialog`：以触发元素位置为 `transform-origin`，scale+淡入（spring）。
16. **菜单项错峰入场** — `dropdown-menu`/`select`：展开时每项 ~20ms 间隔淡入+上移。
17. **危险操作红色脉冲** — 写控制/删除类 `alert-dialog`：外圈红色 ring 缓慢脉冲。
18. **Toast 体系** — 当前无 toast：新增自边缘滑入 + 自动消失进度条，用于异步反馈。

### 五、状态与加载

19. **连接态图标形变** — `InstanceSelector`/`AppShell` 徽章：离线→在线时图标旋转/淡出淡入 + 颜色交叉淡化。
20. **按钮成功态形变** — 异步动作按钮（应用配置、写入）：成功瞬间 label 形变为对勾再恢复。
21. **顶栏进度条拖尾光** — `TopProgressBar`：填充段带 trailing shimmer/glow（NProgress 风格）。

### 六、首页卡片与微交互

22. **实例增删 FLIP** — `InstancePanel` 网格：新增/删除实例时周围卡片 FLIP 滑入新位。
23. **探测雷达 ping** — `InstanceCard` 探测中：自卡片中心向外扩散的声纳环。
24. **光标视差倾斜** — `InstanceCard` 悬浮：随光标的轻微 3D tilt。
25. ~~Switch 拨杆回弹~~ ✅
26. **折叠区高度自适** — `ConfigCenterParts` 可折叠区：`grid-template-rows 0fr→1fr` + 内容淡入 + chevron spring 旋转。
27. **复制对勾弹出** — 复制按钮：成功时对勾 scale-pop。
28. **主题图标形变** — `ThemeSelector`：sun⇔moon SVG path 形变（与圆形扩散互补）。

## 实现约定

- **优先复用** `--ease-spring/--ease-smooth/--ease-snap` 与现有 CSS 类；不引入 framer-motion 等新动画依赖（`core-beliefs`：依赖最小化）。
- **共享指示器**统一走 `useSlidingIndicator`（`components/layout/`）：测量活动项相对容器的 box，返回绝对定位 overlay 样式，切换时 spring 滑动。
- **FLIP** 模式：测旧位 → DOM 更新 → invert(transform) → play(transition)。用于排序/增删重排。
- **可访问性**：所有装饰性动效 `aria-hidden` 或 `pointer-events:none`；不得用动效传达非装饰信息；`prefers-reduced-motion` 下全部降级为瞬切（已由全局守护覆盖）。
- **性能**：优先变换 `transform`/`opacity`（合成层），避免动画 `width/height/top/left` 引发重排；`glow-running` 已用 opacity 而非 box-shadow 规避连续重绘，新动效照此约束。
