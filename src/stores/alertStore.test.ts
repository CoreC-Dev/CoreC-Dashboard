import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MAX_ALERT_EVENTS, useAlertStore } from '@/stores/alertStore'
import type { Alert, LogEvent } from '@/types/models'

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

// --- First-class rule alerts (audit OBS-4/HUB-6) ---

const mkAlert = (key: string, first: string, over: Partial<Alert> = {}): Alert => ({
  key,
  rule: key.split('|')[0],
  driver: 'plc1',
  tag: 'temp',
  quality: 0,
  first_fired: first,
  last_fired: first,
  count: 1,
  acked: false,
  ...over,
})

describe('ruleAlerts — stream event reducer', () => {
  it('fired inserts new alerts oldest-first', () => {
    useAlertStore.setState({ ruleAlerts: [] })
    const store2 = useAlertStore.getState()

    // Fire the NEWER alert first, then the older one: insertion must
    // order by first_fired (oldest first), matching GET /alerts.
    store2.applyAlertEvent({
      type: 'fired',
      at: '2026-10-20T10:01:00Z',
      alert: mkAlert('hot|plc1|temp', '2026-10-20T10:01:00Z'),
    })
    store2.applyAlertEvent({
      type: 'fired',
      at: '2026-10-20T10:02:00Z',
      alert: mkAlert('old|plc2|hum', '2026-10-20T09:00:00Z'),
    })

    const alerts = useAlertStore.getState().ruleAlerts
    expect(alerts.map((a) => a.key)).toEqual(['old|plc2|hum', 'hot|plc1|temp'])
  })

  it('fired on an existing key replaces by identity (count merge lives server-side)', () => {
    useAlertStore.setState({ ruleAlerts: [mkAlert('hot|plc1|temp', '2026-10-20T10:00:00Z')] })
    useAlertStore.getState().applyAlertEvent({
      type: 'fired',
      at: '2026-10-20T10:05:00Z',
      alert: mkAlert('hot|plc1|temp', '2026-10-20T10:00:00Z', { count: 7 }),
    })
    const alerts = useAlertStore.getState().ruleAlerts
    expect(alerts).toHaveLength(1)
    expect(alerts[0].count).toBe(7)
  })

  it('acked carries the acked flag through the reducer', () => {
    useAlertStore.setState({ ruleAlerts: [mkAlert('hot|plc1|temp', '2026-10-20T10:00:00Z')] })
    useAlertStore.getState().applyAlertEvent({
      type: 'acked',
      at: '2026-10-20T10:06:00Z',
      alert: mkAlert('hot|plc1|temp', '2026-10-20T10:00:00Z', {
        acked: true,
        acked_at: '2026-10-20T10:06:00Z',
      }),
    })
    expect(useAlertStore.getState().ruleAlerts[0].acked).toBe(true)
  })

  it('cleared drops the alert by key', () => {
    useAlertStore.setState({
      ruleAlerts: [
        mkAlert('a|d|t', '2026-10-20T10:00:00Z'),
        mkAlert('b|d|t', '2026-10-20T10:01:00Z'),
      ],
    })
    useAlertStore.getState().applyAlertEvent({
      type: 'cleared',
      at: '2026-10-20T10:30:00Z',
      alert: mkAlert('a|d|t', '2026-10-20T10:00:00Z'),
    })
    expect(useAlertStore.getState().ruleAlerts.map((a) => a.key)).toEqual(['b|d|t'])
  })

  it('setRuleAlerts replaces the whole set (GET /alerts hydration)', () => {
    useAlertStore.setState({ ruleAlerts: [mkAlert('stale|d|t', '2026-10-20T09:00:00Z')] })
    useAlertStore.getState().setRuleAlerts([mkAlert('fresh|d|t', '2026-10-20T10:00:00Z')])
    expect(useAlertStore.getState().ruleAlerts.map((a) => a.key)).toEqual(['fresh|d|t'])
  })

  it('resetTransient clears rule alerts on instance switch', () => {
    useAlertStore.setState({ ruleAlerts: [mkAlert('x|d|t', '2026-10-20T10:00:00Z')] })
    useAlertStore.getState().resetTransient()
    expect(useAlertStore.getState().ruleAlerts).toEqual([])
  })
})
