import { cn } from '@/lib/utils'

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md bg-muted/50', className)} />
}

export { Skeleton }
