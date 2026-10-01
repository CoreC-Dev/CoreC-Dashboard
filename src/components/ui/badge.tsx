import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground border-border hover:bg-muted/50',
        success: 'border-status-running/20 bg-status-running/10 text-status-running',
        warning: 'border-status-warning/20 bg-status-warning/10 text-status-warning',
        info: 'border-status-queued/20 bg-status-queued/10 text-status-queued',
        running: 'border-status-running/20 bg-status-running/10 text-status-running',
        error: 'border-status-error/20 bg-status-error/10 text-status-error',
        stale: 'border-status-stale/20 bg-status-stale/10 text-status-stale',
        queued: 'border-status-queued/20 bg-status-queued/10 text-status-queued',
        idle: 'border-status-idle/20 bg-status-idle/10 text-status-idle',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
