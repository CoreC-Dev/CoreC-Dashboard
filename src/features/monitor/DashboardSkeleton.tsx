import type React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import i18n from '@/i18n'

/**
 * First-load placeholder that mirrors the real dashboard layout. A spinner
 * in the middle of an empty page tells the operator "something is loading";
 * this keeps the eventual card grid in place so the page settles instead of
 * jumping when the first stats snapshot lands.
 */
export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6" role="status" aria-busy="true" aria-label={i18n.t('common.loading')}>
    <div className="space-y-2">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-4 w-64" />
    </div>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          className="rounded-3xl squircle border border-border bg-card p-4"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className="flex items-start justify-between gap-2">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
          <Skeleton className="mt-3.5 h-6 w-20" />
          <Skeleton className="mt-2.5 h-3 w-14" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Skeleton className="h-[292px] rounded-3xl" />
      <Skeleton className="h-[292px] rounded-3xl" />
    </div>
    <Skeleton className="h-44 rounded-3xl" />
  </div>
)
