import { create } from 'zustand'
import { safePersist } from '@/lib/storage'
import type { DashboardCard, DashboardLayout } from '@/types/dashboard'

const DEFAULT_CARDS: DashboardCard[] = [
  {
    id: 'kpi-1',
    type: 'kpi-summary',
    title: 'Core Engine Metrics',
    layout: { x: 0, y: 0, w: 12, h: 3, minW: 6, minH: 3 },
  },
  {
    id: 'traffic-1',
    type: 'traffic-chart',
    title: 'Realtime Data Bus Traffic (Read / Publish)',
    layout: { x: 0, y: 3, w: 6, h: 5, minW: 4, minH: 4 },
  },
  {
    id: 'memory-1',
    type: 'memory-chart',
    title: 'Memory & Goroutines (Zero STW)',
    layout: { x: 6, y: 3, w: 6, h: 5, minW: 4, minH: 4 },
  },
  {
    id: 'drivers-1',
    type: 'driver-status-list',
    title: 'Southbound Drivers (Modbus / S7 / OPC UA)',
    layout: { x: 0, y: 8, w: 6, h: 6, minW: 4, minH: 4 },
  },
  {
    id: 'transports-1',
    type: 'transport-status-list',
    title: 'Northbound Transports (MQTT / HTTP Push)',
    layout: { x: 6, y: 8, w: 6, h: 6, minW: 4, minH: 4 },
  },
  {
    id: 'alerts-1',
    type: 'recent-alerts',
    title: 'Rule Triggered Alerts & Dead Letters',
    layout: { x: 0, y: 14, w: 12, h: 5, minW: 6, minH: 3 },
  },
]

const DEFAULT_LAYOUT: DashboardLayout = {
  id: 'default-industrial-overview',
  name: 'Industrial Gateway Overview',
  description: 'Standard plant-floor overview with real-time bus throughput and status indicators',
  cards: DEFAULT_CARDS,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const STORAGE_KEY = 'corec_dashboard_layout'

/** Debounced persistence — avoids writing on every drag pixel (M5).
 *  Takes a value *getter* and reads it at fire time, so an interleaved
 *  immediate safePersist (addCard/removeCard/updateCardConfig) is not
 *  clobbered by a stale snapshot captured when the debounce was scheduled. */
let persistTimer: ReturnType<typeof setTimeout> | null = null
const debouncedPersist = (key: string, getValue: () => string): void => {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => safePersist(key, getValue()), 300)
}

interface DashboardState {
  currentLayout: DashboardLayout
  isEditing: boolean
  updateCardLayout: (
    newLayouts: { i: string; x: number; y: number; w: number; h: number }[],
  ) => void
  addCard: (card: Omit<DashboardCard, 'id'>) => void
  removeCard: (id: string) => void
  updateCardConfig: (id: string, config: Partial<DashboardCard>) => void
  resetToDefault: () => void
  setEditing: (editing: boolean) => void
}

const getInitialLayout = (): DashboardLayout => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      if (parsed && Array.isArray(parsed.cards)) {
        return parsed
      }
    }
  } catch (e) {
    console.error('Failed to load dashboard layout', e)
  }
  return DEFAULT_LAYOUT
}

export const useDashboardStore = create<DashboardState>((set, get) => {
  // Persist a new layout immediately (non-debounced path). addCard /
  // removeCard / updateCardConfig share this; updateCardLayout deliberately
  // uses debouncedPersist with a getter instead — see H-2 stale-snapshot guard.
  const commitLayout = (newLayout: DashboardLayout): void => {
    safePersist(STORAGE_KEY, JSON.stringify(newLayout))
    set({ currentLayout: newLayout })
  }

  return {
    currentLayout: getInitialLayout(),
    isEditing: false,

    setEditing: (editing) => set({ isEditing: editing }),

    updateCardLayout: (newLayouts) => {
      const layout = get().currentLayout
      const updatedCards = layout.cards.map((card) => {
        const match = newLayouts.find((item) => item.i === card.id)
        if (match) {
          return {
            ...card,
            layout: {
              ...card.layout,
              x: match.x,
              y: match.y,
              w: match.w,
              h: match.h,
            },
          }
        }
        return card
      })

      const newLayout: DashboardLayout = {
        ...layout,
        cards: updatedCards,
        updatedAt: Date.now(),
      }
      // Debounce — react-grid-layout fires onLayoutChange on every drag pixel.
      // Pass a getter so the timer persists the freshest currentLayout at fire
      // time, not this (possibly stale) snapshot — see H-2.
      debouncedPersist(STORAGE_KEY, () => JSON.stringify(get().currentLayout))
      set({ currentLayout: newLayout })
    },

    addCard: (card) => {
      const layout = get().currentLayout
      const newCard: DashboardCard = {
        ...card,
        id: `card-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      }
      const newLayout = {
        ...layout,
        cards: [...layout.cards, newCard],
        updatedAt: Date.now(),
      }
      commitLayout(newLayout)
    },

    removeCard: (id) => {
      const layout = get().currentLayout
      const newLayout = {
        ...layout,
        cards: layout.cards.filter((c) => c.id !== id),
        updatedAt: Date.now(),
      }
      commitLayout(newLayout)
    },

    updateCardConfig: (id, partial) => {
      const layout = get().currentLayout
      const newLayout = {
        ...layout,
        cards: layout.cards.map((c) => (c.id === id ? { ...c, ...partial } : c)),
        updatedAt: Date.now(),
      }
      commitLayout(newLayout)
    },

    resetToDefault: () => {
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* best-effort */
      }
      set({ currentLayout: DEFAULT_LAYOUT })
    },
  }
})
