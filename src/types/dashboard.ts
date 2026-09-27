export type CardType =
  | 'kpi-summary'
  | 'traffic-chart'
  | 'memory-chart'
  | 'driver-status-list'
  | 'transport-status-list'
  | 'recent-alerts'
  | 'tag-value'
  | 'tag-table'

export interface DashboardCard {
  id: string
  type: CardType
  title: string
  layout: {
    x: number
    y: number
    w: number
    h: number
    minW?: number
    minH?: number
  }
  config?: {
    driver?: string
    tag?: string
    refreshInterval?: number // ms
    unit?: string
    precision?: number
  }
}

export interface DashboardLayout {
  id: string
  name: string
  description?: string
  cards: DashboardCard[]
  createdAt: number
  updatedAt: number
}
