import type React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/cn'

/**
 * Layout-shaped loading placeholders. A centered logo + spinner tells the
 * operator "something is loading"; a skeleton that mirrors the final grid
 * also tells them WHAT is loading and prevents the page from jumping when
 * data lands. These are pure presentational blocks (no hooks/i18n), matching
 * the components/ui contract.
 */

/** Table body placeholder — used inside an existing Card. */
export function TableSkeleton({
  rows = 8,
  className,
}: {
  rows?: number
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('p-4', className)} aria-busy="true" aria-hidden>
      <div className="mb-3 grid grid-cols-12 items-center gap-3">
        <Skeleton className="col-span-3 h-3" />
        <Skeleton className="col-span-2 h-3" />
        <Skeleton className="col-span-2 h-3" />
        <Skeleton className="col-span-2 h-3" />
        <Skeleton className="col-span-3 h-3" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="grid grid-cols-12 items-center gap-3">
            <Skeleton className="col-span-3 h-3" />
            <Skeleton className="col-span-2 h-3" />
            <Skeleton className="col-span-2 h-3" />
            <Skeleton className="col-span-2 h-3" />
            <Skeleton className="col-span-3 h-3" />
          </div>
        ))}
      </div>
    </div>
  )
}

/** Card-grid list placeholder (drivers, transports, rule groups). */
export function ListCardsSkeleton({
  cards = 6,
  withHeader = true,
  className,
}: {
  cards?: number
  withHeader?: boolean
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('space-y-5', className)} aria-busy="true" aria-hidden>
      {withHeader && (
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: cards }, (_, i) => (
          <div key={i} className="rounded-3xl squircle border border-border bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-3 w-24" />
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Detail page placeholder: header + two stacked panels. */
export function DetailSkeleton({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('space-y-6', className)} aria-busy="true" aria-hidden>
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="rounded-3xl squircle border border-border bg-card p-5">
        <Skeleton className="h-4 w-32" />
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-3xl squircle border border-border bg-card p-5">
        <Skeleton className="h-4 w-40" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Inline panel placeholder (backups, dead letters, write results). */
export function InlinePanelSkeleton({
  rows = 4,
  className,
}: {
  rows?: number
  className?: string
}): React.ReactElement {
  return (
    <div className={cn('space-y-3 p-4', className)} aria-busy="true" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-3 w-28 shrink-0" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16 shrink-0" />
        </div>
      ))}
    </div>
  )
}
