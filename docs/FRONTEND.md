# FRONTEND.md

> 前端约定：写"为什么"和"边界"。架构总览见 `ARCHITECTURE.md`。

## 分层（feature-sliced）
`types ← lib ← api ← stores ← hooks/contexts ← components ← features ← App`。每层只依赖更底层。`features/*` 间禁止直接互引——跨域共享经 `api/hooks`/`stores`/`components`/`lib`。理由：域边界是可测的第一道防线，防止演化时拉线成网。

## 状态管理边界
- **服务端状态** → @tanstack/react-query。`api/hooks` 统一封装；`staleTime` 3s；按 hook 设 `refetchInterval`（4–30s）；mutation 成功失效对应 query key。**禁止把服务端数据复制进 Zustand 长期保存。**
- **后端响应校验**：新端点在 `api/endpoints` 层用 zod parse 后端响应（如 /write/history、/version、/healthz/*——503 未就绪体被归一化为 `{ready:false,…}`、/drivers/test——连通与不通都是 200，400 拒绝归一化为 `{outcome:'rejected'}`、/rules/preview——400 编译错误/501 不支持原样透传为 `{outcome:'error'}`、/configs/backups*——列表/备份原文 zod 解析，恢复 204 归一化为 `{outcome:'restored'}`，400 校验失败/404 未找到/503 无配置路径归一化为 `{outcome:'rejected'}` 携服务器原文）；存量端点暂保持 TS 类型断言，后续批次统一收敛到 zod。WS 推送帧同理：`/traffic`、`/memory` 帧经 `types/api` 的 zod schema 逐帧校验，坏帧丢弃不渲染。
- **本地 UI/领域状态** → Zustand。`configStore`（工作配置/保存/脏标记，阶段 4 拆 slice）、`instanceStore`（实例+密钥隔离存储）、`configHistory`（快照栈封顶 10）。
- **连接状态** → `contexts/ConnectionContext`（探测生命周期 + abort + unmount 清理）。
- 选窄 selector，避免订阅整个数组致宽重渲（TD-PERF-009）。

## 表单
react-hook-form + zodResolver。schema 与组件同域定义；校验分支必须有测试（TD-TEST-007）。边界输入（URL/密钥）经 zod 校验，不信任默认值。

## i18n
i18next。**i18n 是 lib 的 peer 层而非 lib 的内部依赖**——`cn` 已抽离到 `lib/cn.ts`，`lib/utils` 不再引 `@/i18n`。格式化器接受 `t` 显式传入或隔离到 `lib/i18nFormatters.ts`。

## UI 原语
`components/ui` 保持纯展示：不引 `hooks`/`stores`/`features`/`api`。`cn`（className 合并）应零 src 依赖。

## 实时流
WebSocket 经 `api/websocket.ts`（退避+抖动+重连上限 10+环形缓冲限流 500msg/s）。**消费者应经 `useCoreCWebSocket` hook**（TD-ARCH-007，阶段 4 批次 B 引入），不裸用 `CoreCWebSocket`。流式数据必须有界：图表窗口封顶、rAF 批处理、缓冲/列表/快照封顶（core-beliefs #17）。

## 路由与性能
全路由懒加载（`App.tsx`）；`vite.config.ts` manualChunks 充分拆分。大列表用 `@tanstack/react-virtual` 虚拟化 + `memo` 行 + `useDeferredValue` 搜索（参考 `TagExplorerPage`）。未虚拟化的列表/dialog 需封顶 `.slice`（TD-PERF-001/004/005）。

## 提交
Conventional Commits；单一职责；重构与行为变更不混提；改造仅落 `harnessing`。

## 测试
- 框架：Vitest 5 + jsdom（全局，`src/test/setup.ts`）；组件测试用 @testing-library/react + jest-dom。
- **⚠️ cleanup 必须手动**：`vitest.config.ts` 未设 `globals: true`，导致 @testing-library/react 的自动 cleanup 静默失效。**所有渲染组件/Context/hook 的测试文件必须在 `afterEach` 中显式调用 `cleanup()`**：
  ```ts
  import { cleanup } from '@testing-library/react'
  import { afterEach } from 'vitest'
  afterEach(() => cleanup())
  ```
  遗漏会导致 DOM 残留、后续测试断言串扰。纯函数测试（无 DOM 渲染）不需要 cleanup。
- Mock 约定：`globalThis.fetch` 用 `vi.fn()` mock；无 msw、无 user-event。Biome 强制单引号。
- 覆盖率门禁：`npm run test:coverage`（v8 provider），阈值在 `vitest.config.ts` 中配置（ratchet，只升不降）。CI（`ci.yml`）已接入。


## UX 修复波（2026-10-18）：行为变更登记

本批按 UX 审计（ux-audit A/B/C/D 四组报告）落地的可观察行为变更，登记如下：

- **连接探测改打带鉴权的 `GET /stats`**：密钥错误现在显示为明确的"密钥无效 (401)"，不再假装已连接；`ConnectionContext` 每 15s 周期复核（后端掉线一周期内可见）。
- **401 全局拦截**：任何查询/变更收到 401 即切换到全屏"认证已失效"遮罩，提供重输密钥与返回实例列表两条出路。
- **WS 断线可见**：`/tags/stream`、`/logs`、`/traffic`、`/memory` 四条流的状态汇入 `wsStatusStore`；监控三页顶部横幅在断线/放弃重连时可见；侧栏"实时流"徽标绑定真实 socket 状态；`rejected` 状态提供"重新连接"按钮。
- **告警全局触达**：`/logs` 订阅由 AppShell 级 `AlertStreamProvider` 独占持有，告警页只是消费者；侧栏"告警事件"显示未读 error 计数徽标（死信计数兜底）；声音/浏览器通知在任何路由下生效。
- **危险操作归一**：`PUT /configs` 仅有一个门——所有入口经 `ConfigApplyConfirmationDialog`（diff+变更摘要+暂停警告）确认后触发；`RuleEditDialog` 直发路径已删除（规则运行区编辑并入向导，延迟应用）。
- **死信单条重放加两步确认**（对齐批量重放与手动写入标杆），列出上次失败时间/次数/错误原文。
- **向导取消守卫**：三个向导的取消/关闭/遮罩点击在脏草稿时先弹放弃确认。
- **配置中心**：YAML 重载不再把未应用的表单编辑标成已保存（蒸发修复）；模式切换分歧时三选一桥接；播种失败红色横幅+创建/应用守卫；`POST /configs/validate` 接入两条应用确认流；变更历史按钮改名"载入到编辑器"（"恢复"仅指服务端备份真恢复）。
- **诚实性**：`GET /configs/raw` 明文（无脱敏/无 sentinel-merge）在注释与提示文案中如实标注；`settings.subtitle`/`secretsRedactedNote` 等死键与失实文案清除。
- **门禁收紧**：`SIZE_EXEMPTIONS` 移除 RulesPage/RuleParts 两项（C-B1 死代码删除后回到 500 行内）。
- **总览页第 5 行卡片诚实化（B03）**：标题由名不副实的「近期告警事件」改为「死信队列 (写入失败)」，空态不再凭死信为空就宣称"系统健康"；卡片头新增全局告警流的当前 error 级事件计数徽标（消费 `alertStore.events`），点击直达告警页。
- **总览页数据降级契约（B04）**：stats 轮询失败不再把整页坍缩成一行红字——保留已渲染数据，顶部显示琥珀色横幅「数据刷新失败，正在显示 {{time}} 的快照」并附手动重试按钮；仅首次加载且无数据时才整页回退。
- **设备列贯通监控链路（B06）**：测点表新增「设备」列（列宽自 tag/driver/group/type 各挪 2%），多设备同名测点不再无法分辨；写入确认框与死信条目/重放确认单补「设备: {{device}}」行，重放确认与结果列表改用 `[driver/device]` 复合前缀——写往物理 PLC 前能看到目标子设备。
- **在线率动态着色（B05）**：驱动/传输 KPI 的在线百分比不再恒绿——100% 绿（「100% 在线」）、1–99% 琥珀（「{{n}}% 在线」）、0% 红（「全部离线」/「全部断开」）；未配置驱动/传输时显示中性灰 N/A 而非绿色断言。死键 dashboard.onlineSuffix/dashboard.connected 移除。
- **连接失败屏不再是死胡同（D-15/D-05）**：探测失败页升级为带实例名的标题（「无法连接到 {{name}}」）+ 已翻译的失败原因（消费 A-01 的结构化探测错误），原始技术细节（`GET {baseUrl}/stats`）折叠进「技术详情」不当主文案；提供三条出路——重试、「编辑此实例」（跳首页 `?edit=<id>` 打开编辑框）、「返回实例列表」。ConnectionGate 自 App.tsx 抽至 components/layout/ 并配 8 用例测试。
- **导入实例结果四分类（D-08）**：设置页导入弹窗消费 `importInstances` 新返回形状 `{added, skipped, invalid, parseError}`——坏 JSON 明确报「解析失败」、纯重复报「全部跳过」、混合结果给三项明细、干净成功显示绿色确认后 1.5s 自动关闭；不再有「已添加 0 个，跳过 0 个」式谎言与无声关闭。
- **「清除所有数据」改用 AlertDialog（D-07）**：全库最狠的删除动作从普通 Dialog（点外部即误关、确认键与触发键同文）对齐为 AlertDialog 纪律——外部点击不再误关，确认键换为红色 destructive 变体的「确认清空（不可恢复）」。
- **驱动编辑表单 help 指错命名空间（D-23）**：「测点文件/测点轮询间隔」的 help 由不存在的 `settings.tagsFileHelp`/`tagsIntervalHelp` 改指两包齐全的 `driverWizard.*`（表单不再显示原始 key 串）；RegistryFieldGrid 对缺 help 键加 DEV console.warn，settingsRegistry 测试遍历全部 registry 字段断言每个 label/help 键在两包可解析。
- **主路径页面缺键补齐（D-24）**：审计点名的 12 个只存在于代码 `defaultValue` 的键（`dashboard.realtimeMonitor`、`tags.explorerDesc`、`alerts.filterPlaceholder/levelAll/levelWarning/levelError/noMatchingEvents`、`diagnostics.autoRefresh`、`topology.received/queueSize/droppedCmds/failed`）补进两语言包——中文主路径不再常年显示英文兜底句；新增 i18nKeys 测试钉住这些键与相关命名空间的 zh/en 对称性。
- **深色主题刷新白闪（D-10）**：index.html `<head>` 加同步内联主题引导脚本（读 `corec_theme` → 立即设 `data-theme` 与 `.dark`，显式变体保留自身名，system/无效值走 `prefers-color-scheme`，与 themeStore 首跑幂等）；CSP `script-src` 以该脚本 sha256 哈希钉住（仍禁任意内联）；themeBoot 测试执行真实脚本逐一断言各主题变体并校验哈希同步。
- **实时流徽标与断线横幅覆盖 admin 路由（D-04）**：原 monitor 专属的「实时流」徽标与断线/放弃重连横幅改为所有实例路由可见——admin 七页（配置中心/写入控制）由 AppShell 级 `/logs` 告警流提供真实状态，不再全盲；AppShell 新增测试覆盖 admin/monitor 双路由的徽标与横幅状态。
- **测点问题点过滤（B07）**：TagToolbar 新增质量筛选（质量: 全部/良好/坏/不确定，复用 common.good/bad/uncertain）与「仅显示陈旧测点」开关（复活死键 tags.staleOnly）；过滤谓词抽为 lib/tagExplorer.matchesQualityFilter 纯函数，页面 memo 与单测共用同一规则。
- **连接模式说明激活（A-05）**：添加/编辑弹窗的连接模式 Select 从三个裸标签变为带说明——激活两包中的死键 `proxyModeHint` 渲染为 FormDescription，写明三种模式各自何时适用；选项文案去内部化（「自动（推荐）/Auto (recommended)」「代理转发/Proxy forwarding」），不再向用户暴露 server.mjs 内部文件名。
- **密钥明文存储披露（A-10）**：密钥字段在保存前（而非导出时才发现）披露「密钥将以明文保存在此浏览器的本地存储中，请勿在公用电脑上保存生产密钥」；instanceStore 中名不副实的 sessionStorage 注释已在 A-11 波修正。
- **首页帮助入口（A-06）**：全仓原先零外链零帮助出口——首页 header 新增 HelpCircle ghost 按钮与空态「如何获取地址与 API 密钥？见帮助」链接，均以 `noopener/noreferrer` 新标签打开仓库文档。
- **后台重探不再集体闪黄（A-07）**：15s 周期探测不再把所有卡片瞬间翻成黄点——「连接中」黄点+雷达动画只保留给首次探测（尚无任何结果的实例）；已有结论（绿/红）的实例在后台重探期间保持原状态，新结论落地才翻转。死实例不再黄红交替闪烁。
- **失败卡片刷新按钮改真重试（A-08/D-12）**：错误卡片右下的 RefreshCw 图标原先点击竟是「进入实例」（与重试预期相反）且无任何标签——现在调用 probeOneInstance 真重探，aria-label/title 为「重试连接」，重探进行中禁用并旋转，读屏不再只听到"按钮"。
- **删除实例改 AlertDialog（D-07 卡片半边）**：与 D 域设置页「清空全部」对齐——InstanceCard 删除确认从普通 Dialog 换为 AlertDialog（外部点击不误关），确认键为红色 destructive 变体的「确认删除（不可恢复）」，与触发它的菜单项文案不同。
- **添加/编辑弹窗「测试连接」（D-13）**：保存前即可验证地址+密钥——次级按钮跑与首页卡片完全相同的带鉴权探测（GET / + Bearer /stats），成功显示「连接成功 v{{version}}」，失败按 401/超时/网络分类显示与卡片一致的原因文案；改动地址/密钥/模式即失效旧结论；不阻塞保存。
- **色板与密钥显隐可读（D-22/D-25）**：颜色选择器 aria-label/title 从硬编码英文（'Blue'…）改走 i18n（instances.colorDefault…colorPink）；密钥小眼睛按钮由引用两包皆无的 `common.show/hide`（读屏听到原始 key 名）改为 `instances.showSecret/hideSecret`。
- **实例未找到文案本地化（D-05 半边）**：ConnectionProvider 缺实例分支的裸英文 'Instance not found' 改走 `connection.errInstance`（「未找到实例，请返回首页重新选择」）——探测错误路径再无英文原文。
- **html lang 随语言切换（D-11）**：setLocale 同步写 `document.documentElement.lang`（i18next 的 languageChange 事件在资源加载后才触发，故显式同步一次）+ languageChange 监听兜底启动场景；英文界面不再被读屏用中文语音引擎朗读。
- **首页消费 ?edit 深链（D-15 A 域半边）**：InstancePanel 挂载时读取 `?edit=<id>`（D 域 ConnectionGate 失败屏的「编辑此实例」出口），自动打开对应实例的编辑弹窗并立即清除参数（残留参数会在每次回首页时重开弹窗）；未知 id 静默丢弃。
- **趋势暂停留空不连线（B08）**：恢复趋势时在最后采样后插入无值 whitespace 采样（lib/tagExplorer.insertPauseGap），lightweight-charts 于该点断线——暂停时段留空，不再伪造连续数据；暂停指示改为「已暂停 — 恢复后暂停时段将留空，不连线」（tags.pausedGapNote 替换 tags.paused）；统计条/采样计数/CSV 导出跳过 gap 标记。

- **种子守卫可见化（C 域 X4 接线）**：服务器配置未加载（auto-seed 进行中/失败且无基线）时，驱动/传输/规则三列表页的「创建」按钮显式禁用并显示共享 SeedBlockedBanner（进行中/失败两态 + verbatim 错误 + Retry，与配置中心同源）——不再是无声死按钮。
- **删除驱动列出受影响规则（C-A3）**：驱动删除确认对齐传输页模板——列出将失去数据来源的规则；规则与驱动仅靠 match DSL 关联，故按子句扫描（driver ==/contains/=~；!=与裸 driver 排除；无 driver 子句时回退「测点唯一归属」判定；SUB-RULE 组解析一层），扫描范围取工作 ∪ 已保存配置（未应用的规则同样告警）。
- **密码字段不再明文回显（C-A4）**：详情页快编辑表单的密码类字段（MQTT password、Notify smtp-pass、OPC UA password）改为 masked 输入 + 显隐切换；已存密码不再进入表单状态/预览/应用 YAML（占位符「已保存 — 留空保持不变」）；连带修复传输页应用合并浅覆 settings、空字段会清空已存值的数据丢失 bug（settings 深合并，对齐驱动页既有实现）。
- **向导 gate 说出缺什么（C-A5）**：连接步骤校验失败不再只说「请先修正错误再继续」——按必填字段已翻译标签具体列出（Intl.ListFormat 本地化连接：「必填字段未填：驱动名称、主机地址」），重名给 nameExists 原因，测点步骤给出具体要求。
- **列表页搜索提升到页头并覆盖双区（C-A6）**：驱动/传输页搜索条在配置+运行合计 >6 时显示于页头；运行区卡片按名称/类型/连接摘要过滤，空匹配渲染 no-results 卡片而非空白。
- **驱动双区角标与互跳（C-A7）**：配置卡带「运行中」（可点跳运行卡）或「仅配置，未运行」角标 +「有未应用修改」；运行卡带「有未应用修改」（跳回配置卡，含已从工作配置删除的待应用场景）；跳转用 scrollIntoView（HashRouter 下不可用 hash 链接）。
- **驱动空态指向创建（C-A8）**：空态文案改为指出两条真实路径（右上角创建 / 配置中心粘贴 YAML），空态卡内直接放置受种子守卫约束的创建按钮，不再指使用户去手改 YAML。
- **传输「发送测试点」（C-A15）**：传输详情页头部接线 POST /transports/{name}/test（后端早已实现、endpoints 层已有 testTransport 但 UI 从未调用）：单次点击单次请求、ok/message 原文渲染（ok:false 为警告态非崩溃）、进行中禁用；向导连接步骤说明测试需先保存应用。
- **规则试算补 device/group（C-B2）**：向导 Playground 样例数据点新增 device/group 输入（默认空，参与 stale 键）——`device == "meter-01"` 类表达式终于可以试算命中。
- **运行区测试改服务端引擎（C-B3）**：RuleTestDialog 弃用客户端粗算器（lib/ruleMatchEvaluator 连测试整体删除），改调 POST /rules/preview——与向导 Playground 同一 scratch 引擎，两处「测试」结论不再可能打架；编译错误原文透传，样例点变更后旧结论隐藏。
- **诊断页信息架构（C-E1）**：页头下新增锚点跳转 chips（健康/实时流/事件终端/指标/写历史/高级调试，scrollIntoView）；pprof 归入默认折叠的「高级调试 (pprof)」区块（抽出为 PprofDownloads 组件，页面回到 476 行）；副标题如实覆盖全部六类内容。
- **死信搜索与过滤（B10）**：死信队列头部新增搜索框（搜索死信（驱动/测点）…）与驱动过滤（驱动: 全部），全选提示与「显示 X/Y」底部计数对齐可见（过滤后）集合；无匹配时显示「没有匹配的死信」。过滤规则抽为纯函数 filterDeadLetters 并配单测；死信重放确认对话框拆出 DeadLetterReplayDialogs（主文件 443 行/对话框 212 行，回到 500 行门禁内）。
- **死信「查看测点」深链（B11）**：每条死信新增「查看测点」链接（alerts.viewTag），直达 #/corec/{{id}}/monitor/tags?driver={{driver}}&tag={{tag}}；TagExplorerPage 挂载时经 useSearchParams 预填驱动过滤与搜索词（driver/tag 参数驱动 WS 订阅与搜索框）。重放前核对当前实时值不再需要抄测点名、切页、粘贴。
- **趋势「回到最新」按钮（B 域待验证-1，已验证落地）**：验证确认 lightweight-charts 仅在最新 bar 位于可视右缘时自动跟随（全库原无任何 scrollToRealTime/fitContent 调用），拖拽/缩放回历史后无回跳手段；TagTrendPanel 头部与全屏对话框新增「回到最新」（tags.backToLive，回到最新/Back to live），经 useTrendChart.scrollToLive 调 timeScale().scrollToRealTime()。
- **冷启动白屏期有话说（A-12）**：main.tsx 等待 detectProxyMode（最长约 3s）期间 #root 原先是纯白一片——分不清在加载还是挂了；index.html 现在内置静态双语 splash（内联样式 logo +「正在加载 CoreC Dashboard…」/"Loading CoreC Dashboard…"，不依赖未加载的 CSS、不引入第二段内联脚本），createRoot().render 挂载即自动替换；splashBoot 测试对真实 react-dom 钉住"挂载替换 splash"与双语文案。
- **实例状态点对色弱/读屏可读（A-13）**：灰/黄/绿/红状态点原先无文字、无 title、无 aria-label——每态 dot 现带 title+aria-label（复用 common.connected/connecting/error/unknown），错误/未知态额外在点旁渲染文字徽标（健康态靠 title 即可，避免满屏徽标噪音）。
- **密钥输入不再被当登录密码（A-17）**：InstanceDialog 的 API 密钥字段补 autoComplete="off" + name="corec-api-secret" + data-1p-ignore——浏览器/密码管理器不再把 CoreC token 当本站登录密码弹保存/回填。
- **实例可排序（A-18）**：instanceStore.reorderInstances 自诞生起无任何 UI 调用——实例多了一直无法排序；卡片 ⋮ 菜单新增「上移/下移」两项（首/末位对应禁用），与相邻实例交换位置并持久化 sortOrder。为守住 500 行门禁，卡片拓扑面板先行抽为 InstanceCardTopology 组件（纯重构、单独提交）。
- **高对话框可滚动（A-19）**：DialogContent 原先无 max-h/overflow 约束——矮屏/横屏平板上七字段实例表单超出视口且滚不到底部按钮；类名追加 max-h-[calc(100vh-2rem)] overflow-y-auto（对所有弹窗普惠，短内容不出滚动条）。
- **语言切换按钮表意（A-22）**：按钮由显示当前语言（中文界面显示「中」）改为显示目标语言（当前 zh → "EN"），并补 title/aria-label=「切换到 {{language}}」（新增 common.switchToLanguage）——点它会怎样不再靠猜。
- **导入对话框二合一（A-14）**：同一操作两个入口两副面孔——首页有拖拽+选文件+粘贴三件套，设置页只有光秃秃 textarea；抽 components/home/InstanceImportDialog 单一实现，两处同一套 UI 与同一套结果语义（partial/allSkipped 不再自动关闭，对齐设置页 D-08 的"明细保持可读"，首页原 1.5s 关闭行为随之统一）；设置页测试新增 drop zone 可达断言。
- **侧栏「断开连接」合并（D-06）**：底部功能区「断开连接」按钮与上方「返回首页」逐字节同源（都只 navigate('/')），标签却承诺独立动作——撒谎的重复按钮删除；离开实例路由树本就经 ConnectionProvider 卸载清理真实断开（清活动连接、驱逐按实例 QueryClient、停探测）。唯一出口改名「返回实例列表 / Back to instances」（instances.backHome，与 ConnectionGate D-15 文案统一）；connection.disconnect/aria.disconnect 死键两包同删，SidebarNav.back.test 钉住"唯一出口+折叠态可达+死键清除"。
- **后台管理导航分组（D-21）**：admin 七项扁平堆（改配置的与看运行状态的混堆、折叠态七个裸图标）拆为两段小标签：「配置管理 / Configuration」（驱动/传输/规则/配置中心）与「运行与诊断 / Operations & Diagnostics」（控制下发/拓扑/诊断）（nav.adminConfig/adminOps 两包）；折叠态以两道发丝分隔线划界。buildAdminItems→buildAdminGroups，navItems.test 钉住分组、七路由全覆盖与双渲染态。
- **实例切换器诚实化（D-20）**：下拉项绿点不再"曾经连上过就绿"（lastConnectedAt 单一信号），改读与首页卡片同一套实时探测状态（probeErrors→红、首次探测 probing→黄、lastConnectedAt→绿、无结论→灰，A-07 优先级）；切换实例保留当前子路由段（switchInstanceTarget：/corec/a/monitor/alerts→/corec/b/monitor/alerts，不再被扔回总览大屏），实体详情段（drivers/:name 属旧实例）回落到对应列表页。
- **危险确认统一 destructive 变体（D-18/D-19）**：AlertDialogAction 支持 variant 属性（buttonVariants 透传），「放弃未保存更改」确认（D-18）从主色"确定"变红——习惯性点右侧按钮不再丢草稿；备份恢复确认（D-19）从 bg-status-error 系红改 destructive 系红（status-error 从此只留状态指示），DeleteEntityConfirm/设置页清空确认迁移到同一 variant 拼法。WriteControlPage 清死信确认一处经移交由 C 域对齐（ce164fe）——全库危险确认至此统一完毕。
- **统一反馈条 OperationResult（D-17）**：应用配置并热重载的结果不再是各页各说、永不清除的文字条——共享组件（成功绿/失败红 + 操作上下文标签 + 5s 自动淡出 + 手动关闭；可见性按 status 对象身份键控，重复操作重现提示）；驱动/传输详情编辑卡（DetailPageParts）与配置中心 StatusMessageView 均改采用（后者保留 useStatusMessage 4s 清理，禁用组件内淡出仅加手动关闭）。config.reloadSuccess 收敛为统一文案「配置已应用并热重载成功。/ Config applied and hot-reloaded.」；drivers/transports 两处 editConfig.reloadSuccess 旧措辞连同钉住它的 DetailPageReloadConfirm.test.tsx:144 断言一并移交 C 域收敛（features/admin+hooks 禁触）。
- **采集速率如实显示（B12）**：CountUpNumber 的取整移进默认 format——自定义 format（速率卡一位小数）吃到原始动画值，12.4 点/秒不再整段动画期间显示 12.0；整数计数卡（累计读取/丢弃）在各自的 formatNumber 包装内自行取整，动画中途不再出现小数计数。
- **缺失引擎状态渲染为未知（B13）**：stats.status 缺失/为空不再判绿——显示「未知」（common.unknown）+ 琥珀点；仅实际 running/ok 才绿。"不知道"不再被画成"健康"。
- **Row5 卡片链接改名（B14）**：死信队列卡头部链接由误用的 dashboard.manage（渲染「管理」，与驱动/传输两个「管理」同貌异指）改为 dashboard.viewAll（「查看全部 / View All」），如实指向告警页。
- **相对时间戳（B15）**：测点行与告警流时间戳改为「刚刚 / X分钟前 / X小时前 / X天前」（激活存量键 common.justNow/minutesAgo/hoursAgo/daysAgo），超过 5 分钟整格降低透明度，hover 显示完整日期时间；缺失时间戳视为最可疑（'-' + 置灰）——昨天的冻结值不再与刚刷新的值一样新鲜。
- **英文复数硬伤清除（B16）**：dashboard.retries/tags.total/alerts.attemptsExhausted 改写为中英都不需要复数的形式（「重试次数：{{count}}」/「Retries: {{count}}」、「Points: {{count}}」、「Attempts exhausted: {{count}}」）——"1 retries"/"Total: 1 points" 语法错误消失；审计点名的死键 tags.fresh、alerts.noAlerts 两包同删（write.attemptsExhausted 同类问题属 write/admin 命名空间，移交对应域）。
- **错误流 KPI 口径诚实（B18）**：「系统错误流」大数字是封顶 50 的缓冲区水位（MAX_ALERT_EVENTS），副文案改为「最近 {{max}} 条中的 {{count}} 条」/「{{count}} of the last {{max}} events」——不再冒充总量或速率。
- **图表空态/断线浮层（B20）**：流量/内存图经 useCoreCWebSocket 的 onStatus 形参镜像 socket 状态（B01 的 wsStatusStore 接线不动）：无数据时浮「等待实时数据…」，断线后浮「连接中断，图表已暂停更新」（dashboard.chartWaiting/chartDisconnected）——空白坐标轴与静默定格不再是仅有的两种形态。
- **同秒样本合并（B21）**：同一秒内多条 WS 更新合并为一点（取最后值），乱序样本丢弃而非 +1s 改期——时间轴不再漂移、导出 CSV 不再携带编造时间戳；CSV 表头注释披露聚合策略（tags.csvMergedNote「同秒多条记录已合并为最后一条 / Same-second records merged (last value kept)」）。
- **测点表两种空态（B22）**：无筛选且零测点 → 「当前实例暂无测点。请确认驱动已连接并已配置测点。」；有筛选无结果 → 「没有匹配的测点 · [清除筛选]」一键重置五项筛选；误导性的 tags.noPoints（"未找到匹配当前筛选条件的测点"）死键移除。
- **快照对账（B23）**：每 60s（TAG_SNAPSHOT_POLL_MS）重取 /tags 快照并与实时表对账——后端新增测点一分钟内自动补入（从不覆盖更新鲜的 WS 值）、删除的测点随之离表，发现新增时显示「发现 {{count}} 个新测点」（tags.newTagsDiscovered，8s 自动消失）；useTags 保持零轮询（api 层未动，页Own interval），resetSeed 退役（手动刷新=普通 refetch）。
- **窄屏列收敛（B24）**：<md 隐藏分组/类型列（表头与行单元格同步 hidden md:block），860px 最小宽降为 md+，测点列 max-md:flex-1 吸收余宽——手机上测点/数值/质量/时间四列可见，值班应急不再横滑 800+px。
- **方向与告警语义解耦（B25）**：行级闪变升降同用中性 primary 色（液位下降不再整行闪红——工业界面红=报警/坏点），数值方向改由行内 ▲/▼ 小箭头（primary）承载，保留至下次更新；红色回归本职（坏质量/错误）。
- **B 域移交（B17/B19）**：通知正文携带真实事件（`notify(title, \`${log.type||'ERROR'}: ${log.payload.slice(0,120)}\`)`）与警告级声音独立开关（默认关，错误级改三连音≈0.8s）——实现点在 components/layout/AlertStreamProvider.tsx（B02 后通知/声音唯一持有者）与 stores/alertStore.ts、lib/alertAudio.ts，均在 B 域文件所有权之外，未动。
- **B 域待验证结案**：待验证-2（/tags/stream 逼近 500 msg/s 限流的丢点提示）已随 B01 落地——wsStatusStore.reportDropped 记账、StreamStatusBanner 消费 deriveRateLimited 展示限流提示，标已覆盖；待验证-3（慢测点趋势无历史回填）经判定为产品决策，无需行动。
