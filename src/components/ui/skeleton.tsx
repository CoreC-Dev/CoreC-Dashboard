import type React from 'react'
import { cn } from '@/lib/cn'

/**
 * Shimmering content placeholder. Use in place of `animate-pulse` blocks for
 * a directional sweep that reads as "content loading". The shimmer is a
 * composited transform:translateX animation（::after 伪元素，无布局重绘）.
 */
export function Skeleton({ className }: { className?: string }): React.ReactElement {
  return <div className={cn('skeleton-shimmer rounded-md', className)} aria-hidden />
}
