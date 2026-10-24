import { create } from 'zustand'
import { primeAlertAudio } from '@/lib/alertAudio'
import { safePersist, safeRead } from '@/lib/storage'
import type { Alert, AlertEvent, LogEvent } from '@/types/models'

/**
 * alertStore — instance-level alert state.
 *
 * The /logs subscription moved out of AlertsPage into a global provider
 * (components/layout/AlertStreamProvider, mounted by AppShell), so alerts
 * are heard/shown on EVERY route. This store is the shared state between
 * them:
 *
 * - `events`: the bounded warn/error feed (cap 50, same merge order and
 * cap the page's old local buffer used) — AlertsPage renders it, so the
 * page no longer opens its own /logs socket (subscription dedupe).
 * - `unreadErrorCount`: error-level (level ≥ 8) events received while the
 * AlertsPage was NOT open — the sidebar badge's count ("未读告警").
 * Opening the page marks them seen (reset to 0).
 * - `deadLetterCount`: DLQ size, polled by the provider via the shared
 * ['deadLetters'] react-query — the badge shows it as a fallback count
 * when there are no unread errors ("deadLetters>0 … 显示红色计数").
 * - sound/notification preferences: persisted under the SAME legacy keys
 * and '1'/'0' encoding the AlertsPage toggle always used
 * (corec_alert_sound / corec_alert_notification) — existing users'
 * settings carry over unchanged (compatible migration by construction).
 */

const SOUND_KEY = 'corec_alert_sound'
const WARN_SOUND_KEY = 'corec_alert_warning_sound'
const NOTIF_KEY = 'corec_alert_notification'
/** Live-feed cap — unchanged from AlertsPage's old local buffer. */
export const MAX_ALERT_EVENTS = 50

/** Legacy pref encoding: '1' = on, anything else = off. */
const readPref = (key: string): boolean => safeRead(key) === '1'
const writePref = (key: string, value: boolean): boolean => safePersist(key, value ? '1' : '0')

interface AlertState {
  /** Warn/error events (level ≥ 4), newest first, capped at MAX_ALERT_EVENTS. */
  events: LogEvent[]
  /**
   * Active rule alerts from the engine registry,
   * hydrated by GET /alerts and kept current by WS /alerts/stream.
   * Oldest-first, mirroring the backend's order.
   */
  ruleAlerts: Alert[]
  /** Error events received while the AlertsPage was closed (badge count). */
  unreadErrorCount: number
  /** Current dead-letter queue size (badge fallback count). */
  deadLetterCount: number
  /** True while AlertsPage is mounted — events arriving are "being seen". */
  viewing: boolean
  soundEnabled: boolean
  /** Warning-level (4–7) events get their own audible layer. */
  warningSoundEnabled: boolean
  notificationsEnabled: boolean
  /** Merge a flushed batch of events (called once per rAF by the provider). */
  pushEvents: (batch: LogEvent[]) => void
  /** Replace the active rule-alert set (GET /alerts hydration). */
  setRuleAlerts: (alerts: Alert[]) => void
  /** Apply one stream lifecycle event (fired/acked/cleared). */
  applyAlertEvent: (ev: AlertEvent) => void
  setDeadLetterCount: (count: number) => void
  /** AlertsPage mount/unmount; opening the page marks unread as seen. */
  setViewing: (viewing: boolean) => void
  toggleSound: () => void
  toggleWarningSound: () => void
  toggleNotifications: () => Promise<void>
  /** Drop per-instance transient data (provider instance-switch hygiene). */
  resetTransient: () => void
}

export const useAlertStore = create<AlertState>((set, get) => ({
  events: [],
  ruleAlerts: [],
  unreadErrorCount: 0,
  deadLetterCount: 0,
  viewing: false,
  // Read once at store creation — same keys/values the old page-local
  // useState(() => readPref(KEY)) initializers resolved on mount.
  soundEnabled: readPref(SOUND_KEY),
  warningSoundEnabled: readPref(WARN_SOUND_KEY),
  notificationsEnabled: readPref(NOTIF_KEY),

  pushEvents: (batch) => {
    if (batch.length === 0) return
    set((state) => {
      // Same merge as the old AlertsPage flush: the freshly arrived batch
      // goes in front of the previous buffer, capped at 50.
      const merged = [...batch, ...state.events]
      const events = merged.length > MAX_ALERT_EVENTS ? merged.slice(0, MAX_ALERT_EVENTS) : merged
      const newErrors = batch.filter((evt) => evt.level >= 8).length
      const unreadErrorCount =
        newErrors > 0 && !state.viewing
          ? state.unreadErrorCount + newErrors
          : state.unreadErrorCount
      return { events, unreadErrorCount }
    })
  },

  setRuleAlerts: (alerts) => {
    // Oldest-first from the backend; keep the order stable for render.
    set({ ruleAlerts: alerts })
  },

  applyAlertEvent: (ev) => {
    set((state) => {
      const key = ev.alert.key
      // fired/acked → upsert (acked events carry the acked flag; fired
      // replaces or inserts by identity); cleared → drop.
      if (ev.type === 'cleared') {
        return { ruleAlerts: state.ruleAlerts.filter((a) => a.key !== key) }
      }
      const alerts = state.ruleAlerts.filter((a) => a.key !== key)
      const idx = alerts.findIndex((a) => a.first_fired > ev.alert.first_fired)
      if (idx === -1) {
        return { ruleAlerts: [...alerts, ev.alert] }
      }
      alerts.splice(idx, 0, ev.alert)
      return { ruleAlerts: alerts }
    })
  },

  setDeadLetterCount: (count) => {
    if (get().deadLetterCount === count) return
    set({ deadLetterCount: count })
  },

  setViewing: (viewing) => {
    // Arriving on the alerts page = the unread backlog is now seen.
    set(viewing ? { viewing: true, unreadErrorCount: 0 } : { viewing })
  },

  toggleSound: () => {
    const next = !get().soundEnabled
    set({ soundEnabled: next })
    writePref(SOUND_KEY, next)
    // Prime the AudioContext inside the click gesture (browser autoplay
    // policy) and play the preview beep — same as the old toggle.
    if (next) primeAlertAudio()
  },

  toggleWarningSound: () => {
    const next = !get().warningSoundEnabled
    set({ warningSoundEnabled: next })
    writePref(WARN_SOUND_KEY, next)
    if (next) primeAlertAudio()
  },

  toggleNotifications: async () => {
    const next = !get().notificationsEnabled
    set({ notificationsEnabled: next })
    writePref(NOTIF_KEY, next)
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch {
        // requestPermission rejected — preference stored; notifications
        // skipped while permission is not 'granted' (same as before).
      }
    }
  },

  resetTransient: () => {
    set({ events: [], ruleAlerts: [], unreadErrorCount: 0, deadLetterCount: 0 })
  },
}))
