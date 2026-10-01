# CoreC-Dashboard UX 动效增强方案

> 审计日期：2025-01 · 当前提交：`e99055a`

---

## 一、现有动效审计

### ✅ 已实现

| 动效 | 位置 | 实现 | 评价 |
|------|------|------|------|
| **页面进入** | `index.css` `.page-enter` | fade + slide-up 0.32s `cubic-bezier(0.22,1,0.36,1)` | 良好，但仅作用于 `<Outlet>` 包裹层 |
| **卡片悬停** | `index.css` `.card-hover` | translateY(-2px) + shadow 0.2s | 良好，已应用于所有卡片 |
| **侧栏折叠** | `index.css` `.sidebar-transition` | width 0.28s | 良好 |
| **按钮按压** | `button.tsx` | `active:scale-[0.97]` duration-200 | 良好 |
| **状态脉冲** | `index.css` `.glow-running/error/primary` | `glow-pulse` 1.6s infinite | 良好 |
| **骨架闪烁** | `index.css` `.shimmer` | `shimmer` 1.5s infinite | CSS 已定义，但无组件使用 |
| **Radix 弹层** | `dialog/dropdown/select` | `animate-in/out` fade+zoom+slide | 良好，shadcn 默认 |
| **开关滑动** | `switch.tsx` | `transition-transform` + `translate-x-4` | 良好 |
| **导航项悬停** | `AppShell.tsx` | `hover:translate-x-0.5` | 微妙，可加强 |
| **移动端抽屉** | `AppShell.tsx` | `transition-transform duration-300` | 良好 |
| **减少动效** | `index.css` `@media (prefers-reduced-motion)` | 全局降级 | 良好 |

### ❌ 已定义但未使用

| 动效 | 位置 | 状态 |
|------|------|------|
| **卡片入场** `card-enter` | `index.css` L388-399 | 定义了 scale+slide 0.4s，但无组件引用 `.card-enter` 类 |
| **导航指示器** `nav-indicator` | `index.css` L419-430 | 定义了，但无组件引用 |
| **弹层入场** `popover-enter` | `index.css` L434-445 | 定义了，但无组件引用（Radix 自带动画） |

### ❌ 缺失的动效

| 类别 | 缺失项 | 影响 |
|------|--------|------|
| **入场动效** | 卡片网格无交错入场（stagger） | 首屏卡片同时出现，缺乏层次感 |
| **数字动效** | KPI 数值无 count-up 动画 | 数据加载后直接显示，无过渡 |
| **路由切换** | 无 View Transition API | 页面切换硬切，仅 content 区域有 fade |
| **列表动效** | 列表项无 enter/exit 动画 | 增删项时突变 |
| **标签切换** | 无 Tabs 组件，无滑动指示器 | 标签切换无动画 |
| **骨架屏** | shimmer CSS 存在但无 Skeleton 组件 | 加载态不统一 |
| **Toast** | 无通知组件 | 操作反馈缺失 |
| **Tooltip** | 无tooltip 组件 | 悬停提示缺失 |
| **折叠面板** | 无 accordion / collapsible 动画 | 展开/折叠突变 |
| **复选框** | 无自定义 check 动画 | 勾选无动效 |
| **加载条** | 无顶部进度条 | 路由切换无加载反馈 |
| **波纹效果** | 按钮无 ripple | 点击反馈较弱 |
| **磁吸效果** | 交互元素无 magnetic hover | 悬停缺乏吸引力 |
| **弹簧动画** | 无 spring easing | 动效偏线性，不够弹性 |

---

## 二、增强方案

按优先级排列，P0 = 立即可做且效果显著。

### P0-1：卡片网格交错入场（Stagger Entrance）

**问题**：DashboardPage 的 KPI 卡片同时出现，缺乏层次感。`card-enter` 动画已定义但未使用。

**方案**：为网格子项添加 `card-enter` 类 + `animation-delay` 交错。

```tsx
// DashboardPage.tsx — KPI 卡片网格
<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
  {kpis.map((kpi, i) => (
    <div
      key={kpi.label}
      className="card-enter"
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <KPICard {...kpi} />
    </div>
  ))}
</div>
```

**适用页面**：`DashboardPage`、`InstancePanel`、`TransportsPage`、`DriversPage`、`AlertsPage`

---

### P0-2：KPI 数字 Count-Up 动画

**问题**：KPI 数值加载后直接显示终值，无过渡。

**方案**：自定义 `useCountUp` hook，用 `requestAnimationFrame` 做缓动数字递增。

```tsx
// hooks/useCountUp.ts
import { useEffect, useRef, useState } from 'react'

export function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number>()

  useEffect(() => {
    const start = performance.now()
    const from = 0
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      setValue(from + (target - from) * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => rafRef.current && cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return value
}

// DashboardPage.tsx — KPI 卡片
function KPICard({ value, ...rest }) {
  const animated = useCountUp(value)
  return <span>{Math.round(animated).toLocaleString()}</span>
}
```

---

### P0-3：导航项 Active 指示器滑动

**问题**：当前 active 导航项用 `bg-foreground text-background` 硬切，无滑动过渡。`nav-indicator` 动画已定义但未使用。

**方案**：使用 `layoutId` (Framer Motion) 或 CSS transform 实现滑动指示器。

**纯 CSS 方案（推荐，零依赖）**：

```tsx
// AppShell.tsx — renderItem
<NavLink
  to={item.path}
  className={({ isActive }) => cn(
    'relative ...',
    isActive && 'text-foreground',
  )}
>
  {({ isActive }) => (
    <>
      {isActive && (
        <span className="nav-indicator absolute inset-0 rounded-lg bg-foreground -z-10" />
      )}
      <Icon className="w-[18px] h-[18px] shrink-0" />
      {!eff && <span>{item.label}</span>}
    </>
  )}
</NavLink>
```

---

### P0-4：按钮波纹效果（Ripple）

**问题**：按钮仅有 `active:scale-[0.97]`，点击反馈较弱。

**方案**：CSS-only ripple，通过 `::after` 伪元素 + `active` 状态触发。

```css
/* index.css */
.btn-ripple {
  position: relative;
  overflow: hidden;
}
.btn-ripple::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at center, currentColor 0%, transparent 60%);
  opacity: 0;
  transform: scale(0);
  transition: transform 0.5s ease-out, opacity 0.4s ease-out;
  pointer-events: none;
}
.btn-ripple:active::after {
  opacity: 0.15;
  transform: scale(2);
  transition: 0s;
}
```

```tsx
// button.tsx — 在 base 类中添加
'btn-ripple'
```

---

### P1-1：路由切换 View Transition API

**问题**：路由切换仅 content 区域有 fade，整体无过渡。

**方案**：使用浏览器原生 View Transition API（Chrome 111+，Safari 18+）。

```tsx
// 在路由切换时触发
import { useLocation } from 'react-router-dom'

function useViewTransition() {
  const location = useLocation()
  useEffect(() => {
    if (!document.startViewTransition) return
    // 已由浏览器自动捕获
  }, [location.pathname])
}

// AppShell.tsx — 包裹 Outlet
<main>
  <div
    style={{ viewTransitionName: 'page-content' }}
    key={location.pathname}
    className="page-enter"
  >
    <Outlet />
  </div>
</main>
```

```css
/* index.css */
::view-transition-old(page-content) {
  animation: fade-out 0.2s ease forwards;
}
::view-transition-new(page-content) {
  animation: page-enter 0.3s cubic-bezier(0.22,1,0.36,1) forwards;
}
```

---

### P1-2：骨架屏组件（Skeleton）

**问题**：`shimmer` CSS 已定义但无组件封装，加载态不统一。

**方案**：

```tsx
// components/ui/skeleton.tsx
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md bg-muted/50', className)} />
}

// DashboardPage.tsx — 加载态
{loading ? (
  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
    {Array.from({ length: 6 }).map((_, i) => (
      <Skeleton key={i} className="h-24 rounded-lg" />
    ))}
  </div>
) : (
  <KPIGrid />
)}
```

---

### P1-3：Toast 通知组件

**问题**：操作成功/失败无全局反馈。

**方案**：安装 `sonner`（轻量、零配置、自带动画）。

```bash
npm install sonner
```

```tsx
// main.tsx
import { Toaster } from 'sonner'
// 在根组件添加
<Toaster
  position="top-right"
  toastOptions={{
    classNames: { toast: 'rounded-xl border border-border bg-card' }
  }}
/>

// 使用
import { toast } from 'sonner'
toast.success('实例已连接')
toast.error('连接失败', { description: error.message })
```

---

### P1-4：Tooltip 组件

**问题**：图标按钮无悬停提示（仅靠 `title` 属性，延迟长、无样式）。

**方案**：使用 Radix Tooltip（已有 Radix 依赖）。

```bash
npx shadcn@latest add tooltip
```

```tsx
// AppShell.tsx — 折叠态导航项
<Tooltip>
  <TooltipTrigger asChild>
    <NavLink to={item.path}>...</NavLink>
  </TooltipTrigger>
  <TooltipContent side="right">{item.label}</TooltipContent>
</Tooltip>
```

---

### P1-5：顶部加载进度条

**问题**：路由切换无加载反馈。

**方案**：`nprogress` 或自定义 CSS 进度条。

```tsx
// hooks/useRouteProgress.ts
import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

export function useRouteProgress() {
  const location = useLocation()
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setProgress(20)
    const t1 = setTimeout(() => setProgress(60), 100)
    const t2 = setTimeout(() => setProgress(100), 300)
    const t3 = setTimeout(() => setProgress(0), 600)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [location.pathname])

  return progress
}

// AppShell.tsx — 顶栏顶部
{progress > 0 && (
  <div className="fixed top-0 left-0 right-0 h-0.5 z-[100]">
    <div
      className="h-full bg-primary transition-all duration-300"
      style={{ width: `${progress}%` }}
    />
  </div>
)}
```

---

### P2-1：弹簧缓动函数（Spring Easing）

**问题**：所有动画使用 `cubic-bezier(0.22,1,0.36,1)`（ease-out-expo），偏线性，缺乏弹性。

**方案**：定义 spring 变体 CSS 变量。

```css
/* index.css — 在 :root 中添加 */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);  /* 弹性回弹 */
--ease-smooth: cubic-bezier(0.22, 1, 0.36, 1);      /* 当前：平滑减速 */
--ease-snappy: cubic-bezier(0.16, 1, 0.3, 1);       /* 快速减速 */
```

```css
/* 应用到关键动效 */
.card-hover {
  transition: transform 0.25s var(--ease-spring), ...;
}
.sidebar-transition {
  transition: width 0.3s var(--ease-spring);
}
```

---

### P2-2：列表项增删动画（FLIP）

**问题**：列表增删项时突变，无位移动画。

**方案**：使用 `framer-motion` 的 `AnimatePresence` + `layout`。

```bash
npm install framer-motion
```

```tsx
import { AnimatePresence, motion } from 'framer-motion'

// 列表渲染
<AnimatePresence mode="popLayout">
  {items.map((item) => (
    <motion.div
      key={item.id}
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.2 }}
    >
      <ItemCard {...item} />
    </motion.div>
  ))}
</AnimatePresence>
```

---

### P2-3：折叠面板动画（Accordion）

**问题**：无 accordion 组件，展开/折叠突变。

**方案**：CSS grid-template-rows 动画（无需 JS 测量高度）。

```css
/* index.css */
.accordion-content {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 0.3s var(--ease-smooth);
}
.accordion-content.open {
  grid-template-rows: 1fr;
}
.accordion-content > div {
  overflow: hidden;
}
```

---

### P2-4：复选框勾选动画

**问题**：勾选无动效。

**方案**：SVG path `stroke-dashoffset` 动画。

```tsx
// checkbox.tsx
<svg className="w-3.5 h-3.5">
  <path
    d="M3 7L7 11L13 4"
    stroke="currentColor"
    strokeWidth={2}
    fill="none"
    className="check-path"
  />
</svg>

/* index.css */
.check-path {
  stroke-dasharray: 16;
  stroke-dashoffset: 16;
  transition: stroke-dashoffset 0.2s ease;
}
[data-state="checked"] .check-path {
  stroke-dashoffset: 0;
}
```

---

### P2-5：磁吸悬停效果（Magnetic Hover）

**问题**：按钮悬停缺乏吸引力。

**方案**：鼠标接近时元素轻微偏移。

```tsx
// hooks/useMagnetic.ts
export function useMagnetic(strength = 0.3) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left - rect.width / 2
      const y = e.clientY - rect.top - rect.height / 2
      el.style.transform = `translate(${x * strength}px, ${y * strength}px)`
    }
    const reset = () => { el.style.transform = '' }
    el.addEventListener('mousemove', handler)
    el.addEventListener('mouseleave', reset)
    return () => {
      el.removeEventListener('mousemove', handler)
      el.removeEventListener('mouseleave', reset)
    }
  }, [strength])
  return ref
}
```

---

## 三、实施路线图

### 第一阶段（零依赖，立即生效）

| 项 | 改动文件 | 预计工时 |
|----|----------|----------|
| P0-1 卡片交错入场 | `DashboardPage.tsx` 等 5 页 | 30min |
| P0-3 导航 active 指示器 | `AppShell.tsx` | 20min |
| P0-4 按钮波纹 | `index.css` + `button.tsx` | 15min |
| P1-2 骨架屏组件 | 新建 `skeleton.tsx` | 15min |
| P1-5 加载进度条 | `AppShell.tsx` | 20min |
| P2-1 弹簧缓动 | `index.css` | 10min |
| P2-3 折叠面板 | `index.css` | 15min |

### 第二阶段（新增依赖）

| 项 | 依赖 | 预计工时 |
|----|------|----------|
| P0-2 数字 count-up | 无（自定义 hook） | 30min |
| P1-3 Toast | `sonner` | 30min |
| P1-4 Tooltip | Radix tooltip | 20min |
| P2-2 列表 FLIP | `framer-motion` | 1h |
| P2-5 磁吸效果 | 无（自定义 hook） | 30min |

### 第三阶段（渐进增强）

| 项 | 说明 |
|----|------|
| P1-1 View Transition API | 浏览器原生，不支持则降级为当前 `page-enter` |
| P2-4 复选框勾选 | 需重构 checkbox.tsx 为 SVG |

---

## 四、设计原则

1. **60fps 原则**：只动画 `transform` 和 `opacity`，避免 `width/height/top/left`
2. **300ms 上限**：交互反馈 ≤ 300ms，入场动效 ≤ 500ms
3. **交错间隔 50-80ms**：卡片网格 stagger 间隔
4. **尊重 `prefers-reduced-motion`**：所有新增动效必须在媒体查询中降级
5. **零阻塞**：动画不阻塞交互，`pointer-events: none` 在动画元素上
6. **渐进增强**：View Transition API 等新特性做特性检测，不支持则降级

---

## 五、当前技术栈兼容性

| 技术 | 当前状态 | 备注 |
|------|----------|------|
| React 19 | ✅ | 支持 `useTransition`、`useDeferredValue` |
| Tailwind v4 | ✅ | `@theme inline` + CSS 变量 |
| Radix UI | ✅ | 自带 `data-[state]` 动画 |
| `tailwindcss-animate` | ❌ 未安装 | Radix 用的是内联 `animate-in/out` 类 |
| `framer-motion` | ❌ 未安装 | P2-2 需要 |
| `sonner` | ❌ 未安装 | P1-3 需要 |
| View Transition API | 浏览器原生 | Chrome 111+, Safari 18+, Firefox 不支持 |
