import type { LucideIcon } from 'lucide-react'
import type React from 'react'
import { cn } from '@/lib/cn'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  /** Optional primary action (button/link). */
  action?: React.ReactNode
  /** Tighter spacing for an empty panel inside a card. */
  compact?: boolean
  className?: string
}

/**
 * One empty-state shape for the whole app: icon medallion, one-line title,
 * optional explanation, optional action. Pure presentational — pages pass
 * their own copy and CTA.
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}) => (
  <div
    className={cn(
      'flex flex-col items-center justify-center text-center',
      compact ? 'gap-2 py-8' : 'gap-3 py-14',
      className,
    )}
  >
    <span
      className={cn(
        'grid place-items-center rounded-full bg-muted text-muted-foreground',
        compact ? 'h-10 w-10' : 'h-12 w-12',
      )}
    >
      <Icon className={compact ? 'h-4 w-4' : 'h-5 w-5'} aria-hidden />
    </span>
    <div className="space-y-1">
      <div className="text-sm font-medium">{title}</div>
      {description && (
        <p className="mx-auto max-w-sm text-xs text-muted-foreground">{description}</p>
      )}
    </div>
    {action}
  </div>
)
