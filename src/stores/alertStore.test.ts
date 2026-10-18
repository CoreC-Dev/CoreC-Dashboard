import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ALERT_EVENTS, useAlertStore } from '@/stores/alertStore'
import type { LogEvent } from '@/types/models'

/**
 * alertStore — the state behind the instance-level alert subscription
 * (audit B02): the bounded warn/error feed the AlertsPage renders, the
 * unread error count that drives the sidebar badge, the DLQ fallback
 * count, and the sound/notification preferences (which must keep using the
 * legacy localStorage keys so existing users' settings survive).
 */

const evt = (level: number, payload: string): LogEvent => ({
  level,
  type: level >= 8 ? 'ERROR' : 'WARN',
  payload,
  timestamp: `2026-01-01T00:00:0${payload.length % 10}Z`,
})

const store = () => useAlertStore.getState()

beforeEach(() => {
  localStorage.clear()
  useAlertStore.setState({
    events: [],
    unreadErrorCount: 0,
    deadLetterCount: 0,
    viewing: false,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('pushEvents — bounded live feed', () => {
  it('prepends the flushed batch in arrival order and caps at MAX_ALERT_EVENTS', () => {
    store().pushEvents([evt(4, 'w1'), evt(8, 'e1')])
    store().pushEvents([evt(0, 'i1'), evt(4, 'w2')])

    const events = useAlertStore.getState().events
    expect(events.map((e) => e.payload)).toEqual(['i1', 'w2', 'w1', 'e1'])
    expect(events).toHaveLength(4)
  })

  it('keeps only the newest MAX_ALERT_EVENTS entries when flooded', () => {
    // 12 batches × 5 events = 60 total → the oldest 10 fall off the cap.
    for (let i = 0; i < 12; i++) {
      store().pushEvents([0, 1, 2, 3, 4].map((j) => evt(4, `w${i * 5 + j}`)))
    }
    const events = useAlertStore.getState().events
    expect(events).toHaveLength(MAX_ALERT_EVENTS)
    expect(events[0]?.payload).toBe('w55') // newest batch still intact
    expect(events[MAX_ALERT_EVENTS - 1]?.payload).toBe('w14') // oldest kept event
  })

  it('ignores empty batches without churning state', () => {
    const before = useAlertStore.getState().events
    store().pushEvents([])
    expect(useAlertStore.getState().events).toBe(before)
  })
})

describe('unreadErrorCount — the sidebar badge source', () => {
  it('counts error-level events (>= 8) received while not viewing', () => {
    store().pushEvents([evt(4, 'w'), evt(8, 'e'), evt(8, 'e')])
    expect(useAlertStore.getState().unreadErrorCount).toBe(2)
  })

  it('does not count while the AlertsPage is open (viewing)', () => {
    store().setViewing(true)
    store().pushEvents([evt(8, 'e')])
    expect(useAlertStore.getState().unreadErrorCount).toBe(0)
  })

  it('opening the page marks the unread backlog as seen', () => {
    store().pushEvents([evt(8, 'e'), evt(8, 'e')])
    expect(useAlertStore.getState().unreadErrorCount).toBe(2)

    store().setViewing(true)
    expect(useAlertStore.getState().unreadErrorCount).toBe(0)
    expect(useAlertStore.getState().viewing).toBe(true)

    store().setViewing(false)
    expect(useAlertStore.getState().viewing).toBe(false)
  })
})

describe('deadLetterCount — badge fallback', () => {
  it('stores the polled DLQ size and de-dupes identical updates', () => {
    store().setDeadLetterCount(7)
    expect(useAlertStore.getState().deadLetterCount).toBe(7)

    const before = useAlertStore.getState()
    store().setDeadLetterCount(7)
    expect(useAlertStore.getState()).toBe(before) // no churn for same value
  })
})

describe('preferences — legacy storage compatibility (B02)', () => {
  it('toggling sound persists the same corec_alert_sound key and 1/0 encoding', () => {
    localStorage.setItem('corec_alert_sound', '0')
    useAlertStore.setState({ soundEnabled: false })

    store().toggleSound()
    expect(useAlertStore.getState().soundEnabled).toBe(true)
    expect(localStorage.getItem('corec_alert_sound')).toBe('1')

    store().toggleSound()
    expect(useAlertStore.getState().soundEnabled).toBe(false)
    expect(localStorage.getItem('corec_alert_sound')).toBe('0')
  })

  it('toggling notifications persists corec_alert_notification', async () => {
    useAlertStore.setState({ notificationsEnabled: false })

    await store().toggleNotifications()
    expect(useAlertStore.getState().notificationsEnabled).toBe(true)
    expect(localStorage.getItem('corec_alert_notification')).toBe('1')
  })

  it('requests browser permission only when enabling from the default state', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted')
    vi.stubGlobal('Notification', { permission: 'default', requestPermission })
    try {
      useAlertStore.setState({ notificationsEnabled: true })

      // Disabling never asks for permission.
      await store().toggleNotifications()
      expect(requestPermission).not.toHaveBeenCalled()

      // Enabling with permission 'default' asks exactly once.
      await store().toggleNotifications()
      expect(requestPermission).toHaveBeenCalledTimes(1)
      expect(useAlertStore.getState().notificationsEnabled).toBe(true)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('initializes preferences from the legacy keys (existing users carry over)', async () => {
    localStorage.setItem('corec_alert_sound', '1')
    localStorage.setItem('corec_alert_notification', '0')
    vi.resetModules()
    const { useAlertStore: fresh } = await import('@/stores/alertStore')
    expect(fresh.getState().soundEnabled).toBe(true)
    expect(fresh.getState().notificationsEnabled).toBe(false)
  })
})

describe('resetTransient — instance-switch hygiene', () => {
  it('clears feed, unread, and DLQ count but keeps preferences', () => {
    localStorage.setItem('corec_alert_sound', '1')
    useAlertStore.setState({
      soundEnabled: true,
      events: [evt(4, 'w')],
      unreadErrorCount: 3,
      deadLetterCount: 5,
      viewing: true,
    })

    store().resetTransient()

    const s = useAlertStore.getState()
    expect(s.events).toEqual([])
    expect(s.unreadErrorCount).toBe(0)
    expect(s.deadLetterCount).toBe(0)
    expect(s.soundEnabled).toBe(true) // persisted pref survives
  })
})
