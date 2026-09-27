import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock localStorage before importing the store
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

// Import after mock is set up
const { useDashboardStore } = await import('./dashboardStore')

describe('useDashboardStore', () => {
  beforeEach(() => {
    localStorageMock.clear()
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
    localStorageMock.removeItem.mockClear()
    // Reset to default layout
    useDashboardStore.getState().resetToDefault()
  })

  it('initializes with default layout containing 6 cards', () => {
    const { currentLayout } = useDashboardStore.getState()
    expect(currentLayout.cards).toHaveLength(6)
    expect(currentLayout.cards.some((c) => c.type === 'kpi-summary')).toBe(true)
    expect(currentLayout.cards.some((c) => c.type === 'traffic-chart')).toBe(true)
    expect(currentLayout.cards.some((c) => c.type === 'memory-chart')).toBe(true)
    expect(currentLayout.cards.some((c) => c.type === 'driver-status-list')).toBe(true)
    expect(currentLayout.cards.some((c) => c.type === 'transport-status-list')).toBe(true)
    expect(currentLayout.cards.some((c) => c.type === 'recent-alerts')).toBe(true)
  })

  it('addCard adds a new card with a unique id', () => {
    const initialCount = useDashboardStore.getState().currentLayout.cards.length
    useDashboardStore.getState().addCard({
      type: 'traffic-chart',
      title: 'Test Chart',
      layout: { x: 0, y: 100, w: 6, h: 5 },
    })
    const { currentLayout } = useDashboardStore.getState()
    expect(currentLayout.cards).toHaveLength(initialCount + 1)
    const newCard = currentLayout.cards[currentLayout.cards.length - 1]
    expect(newCard.id).toBeTruthy()
    expect(newCard.title).toBe('Test Chart')
  })

  it('removeCard removes a card by id', () => {
    const firstCardId = useDashboardStore.getState().currentLayout.cards[0].id
    const initialCount = useDashboardStore.getState().currentLayout.cards.length
    useDashboardStore.getState().removeCard(firstCardId)
    const { currentLayout } = useDashboardStore.getState()
    expect(currentLayout.cards).toHaveLength(initialCount - 1)
    expect(currentLayout.cards.find((c) => c.id === firstCardId)).toBeUndefined()
  })

  it('updateCardLayout updates positions for matched cards', () => {
    const firstCardId = useDashboardStore.getState().currentLayout.cards[0].id
    useDashboardStore.getState().updateCardLayout([{ i: firstCardId, x: 5, y: 10, w: 4, h: 3 }])
    const card = useDashboardStore.getState().currentLayout.cards.find((c) => c.id === firstCardId)
    expect(card?.layout.x).toBe(5)
    expect(card?.layout.y).toBe(10)
    expect(card?.layout.w).toBe(4)
    expect(card?.layout.h).toBe(3)
  })

  it('updateCardLayout preserves minW/minH from original layout', () => {
    const firstCardId = useDashboardStore.getState().currentLayout.cards[0].id
    const originalCard = useDashboardStore
      .getState()
      .currentLayout.cards.find((c) => c.id === firstCardId)
    const originalMinW = originalCard?.layout.minW
    useDashboardStore.getState().updateCardLayout([{ i: firstCardId, x: 0, y: 0, w: 6, h: 3 }])
    const card = useDashboardStore.getState().currentLayout.cards.find((c) => c.id === firstCardId)
    expect(card?.layout.minW).toBe(originalMinW)
  })

  it('resetToDefault restores the default 6-card layout', () => {
    // Add a card first
    useDashboardStore.getState().addCard({
      type: 'traffic-chart',
      title: 'Extra',
      layout: { x: 0, y: 100, w: 6, h: 5 },
    })
    expect(useDashboardStore.getState().currentLayout.cards.length).toBeGreaterThan(6)
    // Reset
    useDashboardStore.getState().resetToDefault()
    expect(useDashboardStore.getState().currentLayout.cards).toHaveLength(6)
  })

  it('resetToDefault removes the localStorage key', () => {
    useDashboardStore.getState().addCard({
      type: 'traffic-chart',
      title: 'Extra',
      layout: { x: 0, y: 100, w: 6, h: 5 },
    })
    useDashboardStore.getState().resetToDefault()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('corec_dashboard_layout')
  })

  it('persisting layout to localStorage on addCard', () => {
    useDashboardStore.getState().addCard({
      type: 'traffic-chart',
      title: 'Persisted',
      layout: { x: 0, y: 100, w: 6, h: 5 },
    })
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'corec_dashboard_layout',
      expect.stringContaining('Persisted'),
    )
  })

  it('updateCardConfig updates a specific card config', () => {
    const firstCardId = useDashboardStore.getState().currentLayout.cards[0].id
    useDashboardStore.getState().updateCardConfig(firstCardId, { title: 'Updated Title' })
    const card = useDashboardStore.getState().currentLayout.cards.find((c) => c.id === firstCardId)
    expect(card?.title).toBe('Updated Title')
  })

  it('setEditing toggles editing state', () => {
    expect(useDashboardStore.getState().isEditing).toBe(false)
    useDashboardStore.getState().setEditing(true)
    expect(useDashboardStore.getState().isEditing).toBe(true)
    useDashboardStore.getState().setEditing(false)
    expect(useDashboardStore.getState().isEditing).toBe(false)
  })
})
