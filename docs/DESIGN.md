# DESIGN.md

> 设计理据：写"为什么这样选"，不写"是什么"。架构总览见 `ARCHITECTURE.md`。

## 为什么 feature-sliced 而非按技术类型分
按业务域（admin/monitor/home/settings）切分，使每个域内的高内聚变更只动一个目录。跨域共享强制下沉到 `lib`/`api/hooks`/`stores`/`components`，边界可被结构测试锁定。按技术类型分（所有组件一堆、所有 store 一堆）会让域边界消失，演化时随意拉线。

## 为什么服务端状态用 react-query 而非 Zustand
服务端数据有 stale/invalidation/refetch 语义，react-query 内建缓存键失效、轮询、乐观更新、retry。Zustand 适合纯本地 UI 状态（工作配置副本、UI 开关）。混用会导致两份缓存源、失效逻辑分散。`configStore` 例外：配置需可编辑/回退/脏标记，工作副本放 Zustand 合理。

## 为什么 WebSocket 自封装而非用现成库
CoreC WS 协议需限流（PLC 高频推送）、退避重连、升级拒绝检测、token 鉴权。自封装 `CoreCWebSocket` 把这些集中可测；`useCoreCWebSocket` hook 统一常规消费者生命周期（自动接线 `wsStatusStore`，unmount 即销毁）。

## 为什么 Monaco 而非 CodeMirror / textarea
配置中心编辑 YAML 需语法高亮 + diff + 大文件性能。Monaco 成熟且 `@monaco-editor/react` 集成简单。代价是包体积大——故运行时惰性加载 + manualChunks 拆分 + 自托管 `min/vs` 资产（ADR-008：`main.tsx` `loader.config` 指向 `/monaco/min/vs`，构建期复制进 `dist/`）解 CDN/气隙依赖。

## 为什么 zod 而非手写校验
配置 schema 复杂（嵌套 driver/transport/rule + 跨实体引用 + 环检测）。zod 给类型推导 + 可组合 + 错误路径。`lib/configSchema/`（`schema.ts` + `validators.ts`）是配置**校验**的单一真相源；字段**元数据**的单一真相源是 `lib/settingsRegistry*`（ADR-010：详情页编辑字段经 `registryAdapter.registryToEditFields` 从 registry 派生），两者职责不重叠。

## 为什么同源代理而非浏览器直连后端（ADR-004）
浏览器直连用户输入的任意后端 + CSP `*` → 凭证可被外泄。同源代理（`server.mjs` `/corec-proxy/*`）让浏览器把请求发往同源、由服务端转发到真实后端，凭证不出同源。多实例能力保留（代理按实例路由），UX 无损。静态托管（GitHub Pages）无 server.mjs——启动探测 `/corec-proxy/` 404 即回退直连模式（ADR-004a），实际下发的 CSP 因此保持 `connect-src * ws: wss:`（`index.html`），代理形态下浏览器仍只发同源请求。

## 为什么行为变更单独提交
重构与行为变更混提则无法单独回滚、无法在 review 时聚焦语义变化、无法对拍守恒（core-beliefs #12，契约 C4）。台账中"变更行为"项必须显式标注并独立提交。

## 为什么内容在窗口内固定的大卡内部滚动
大 bg-card（AppShell 主内容卡）适配窗口且不滚动，页面内容在卡内的 `page-enter` 滚动窗格里滚（`scrollbar-gutter:stable` 防内容增长时的宽度跳动）。理由：卡片是"面板"而非"纸张"——整卡滚动时卡的边界、24px 连续圆角与分层阴影会随内容滚出视口；卡内滚动则卡界恒定，内容在其下滑动（macOS 设置面板 / iOS 表单的形态）。「实时流」状态徽章因此不放在卡上而放**侧栏品牌 logo 正下方**（`StreamStatusBadge`）：连接状态属于应用级 chrome，不该属于任何页面；折叠轨道放不下文本，退化为中心圆点、label 走 title/aria（与移动端顶栏圆点同一形态），tone 映射单一真相源供侧栏徽章与移动端圆点共用。副作用受控：TagTable/终端本就自带内部滚动容器；`scrollIntoView`（诊断页锚点 chips、驱动页互跳、`?section=` 深链）自动落到最近的滚动祖先即卡内窗格；横向溢出被卡的 `overflow-hidden` 裁掉，不会压坏圆角。间距节拍随之单一化：页面级 `space-y-5`（20px）是全站卡片间距的唯一节拍——诊断页 metrics section 曾因容器缺间距类导致三对卡片 0 间距贴叠、配置中心曾整页 16px（`space-y-4`），均收敛到 20；小磁贴网格统一 `gap-3`、大卡网格 `gap-4`。

## 为什么卡片圆角用 corner-shape: squircle（渐进增强）
iOS 的"连续圆角"不是更大的圆弧，而是曲率连续过渡的超椭圆（`squircle` = `superellipse(2)`）。CSS `corner-shape`（css-borders-4）只重绘圆角的弯曲方式、不改 `border-radius` 的尺寸语义，边框/阴影/overflow 裁剪自动跟随新曲线，布局与点击命中零影响——因此它是 Tailwind v4 设计系统下的最小实现：`index.css` 一个 `@utility squircle`，卡面在半径类旁追加该类（`ui/card` 原语覆盖全部 `<Card>` 用点，另有总览 KPI 磁贴、实例卡、侧栏/主内容容器、设置分节、弹窗等自带 `bg-card` 的卡面）。两个备选被否决：SVG clip-path 会把 `--shadow-card` 分层阴影切掉、边框不再跟随轮廓；单纯调大 `border-radius` 改变的只是圆弧半径，直边与圆弧的切点过渡依旧生硬，达不到目的。

半径尺寸取 24px，落在 Tailwind 默认刻度的 `rounded-3xl` 档（`@theme` 显式钉住 `--radius-3xl: 24px`），而非新造 `--radius-card` 令牌或调大 `--radius-lg`。苹果观感 = 大半径 + 连续曲率：24px 在 KPI 磁贴（短边 ~100px）上约 22%，正对齐 iOS 图标圆角占比。不调大 `--radius-lg` 的原因：它同时供导航行/芯片/pre 等小件使用，全局调大会让 44px 高的导航行近乎胶囊。不造自定义令牌的原因：`rounded-card` 不在 tailwind-merge 的冲突组里，调用方 `rounded-sm`/`rounded-t-*` 覆盖半径时会合并不掉、退化成"看 CSS 生成顺序"的隐性行为；留在默认刻度内则去重语义原生成立（`card.test.tsx` 钉住）。曲率（squircle）与尺寸（rounded-3xl）保持两个独立旋钮。支持面：Chromium/Edge 139+ 渲染 squircle；Firefox/Safari 尚在 preview——不支持的引擎忽略该声明，自然回落到现行圆形圆角，现有观感即兜底，无需 `@supports` 分支；`border-radius` 为 0 处（如 Sheet）属性本就无效果，挂类安全。
