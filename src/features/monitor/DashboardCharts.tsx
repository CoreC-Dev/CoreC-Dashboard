import type React from 'react'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

// The two live charts pull in recharts — by far the heaviest part of this
// route. Defer them so the KPI row paints first and the charts stream in.
const TrafficChart = lazy(() =>
  import('@/components/charts/TrafficChart').then((m) => ({ default: m.TrafficChart })),
)
const MemoryChart = lazy(() =>
  import('@/components/charts/MemoryChart').then((m) => ({ default: m.MemoryChart })),
)

/** Row 2 of the dashboard: traffic + memory, side by side. */
export const DashboardCharts: React.FC = () => {
  const { t } = useTranslation()

  return (
    <div className="grid grid-cols-1 gap-4 card-stagger lg:grid-cols-2">
      <Card className="border-border bg-card card-enter">
        <CardHeader className="space-y-0 px-5 pb-1 pt-4">
          <CardTitle className="text-sm font-semibold">{t('dashboard.trafficChart')}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-1">
          <Suspense fallback={<Skeleton className="h-56 w-full rounded-2xl" />}>
            <TrafficChart />
          </Suspense>
        </CardContent>
      </Card>
      <Card className="border-border bg-card card-enter">
        <CardHeader className="space-y-0 px-5 pb-1 pt-4">
          <CardTitle className="text-sm font-semibold">{t('dashboard.memoryChart')}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-1">
          <Suspense fallback={<Skeleton className="h-56 w-full rounded-2xl" />}>
            <MemoryChart />
          </Suspense>
        </CardContent>
      </Card>
    </div>
  )
}
