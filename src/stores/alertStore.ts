import { create } from 'zustand'
import { primeAlertAudio } from '@/lib/alertAudio'
import { safePersist, safeRead } from '@/lib/storage'
import type { LogEvent } from '@/types/models'

/**
 * alertStore — instance-level alert state (audit B02).
 *
 * The /logs subscription moved out of AlertsPage into a global provider
 * (components/layout/AlertStreamProvider, mounted by AppShell), so alerts
 * are heard/shown on EVERY route. This store is the shared state between
 * them:
 *
 *  - `events`: the bounded warn/error feed (cap 50, same merge order and
 *    cap the page's old local buffer used) — AlertsPage renders it, so the
 *    page no longer opens its own /logs socket (subscription dedupe).
 *  - `unreadErrorCount`: error-level (level ≥ 8) events received while the
 *    AlertsPage was NOT open — the sidebar badge's count ("未读告警").
 *    Opening the page marks them seen (reset to 0).
 *  - `deadLetterCount`: DLQ size, polled by the provider via the shared
 *    ['deadLetters'] react-query — the badge shows it as a fallback count
 *    when there are no unread errors ("deadLetters>0 … 显示红色计数").
 *  - sound/notification preferences: persisted under the SAME legacy keys
 *    and '1'/'0' encoding the AlertsPage toggle always used
 *    (corec_alert_sound / corec_alert_notification) — existing users'
 *    settings carry over unchanged (compatible migration by construction).
 */

const SOUND_KEY = 'corec_alert_sound'
const NOTIF_KEY = 'corec_alert_notification'
/** Live-feed cap — unchanged from AlertsPage's old local buffer. */
export const MAX_ALERT_EVENTS = 50

/** Legacy pref encoding: '1' = on, anything else = off. */
const readPref = (key: string): boolean => safeRead(key) === '1'
const writePref = (key: string, value: boolean): void => safePersist(key, value ? '1' : '0')

interface AlertState {
  /** Warn/error events (level ≥ 4), newest first, capped at MAX_ALERT_EVENTS. */
  events: LogEvent[]
  /** Error events received while the AlertsPage was closed (badge count). */
  unreadErrorCount: number
  /** Current dead-letter queue size (badge fallback count). */
  deadLetterCount: number
  /** True while AlertsPage is mounted — events arriving are "being seen". */
  viewing: boolean
  soundEnabled: boolean
  notificationsEnabled: boolean
  /** Merge a flushed batch of events (called once per rAF by the provider). */
  pushEvents: (batch: LogEvent[]) => void
  setDeadLetterCount: (count: number) => void
  /** AlertsPage mount/unmount; opening the page marks unread as seen. */
  setViewing: (viewing: boolean) => void
  toggleSound: () => void
  toggleNotifications: () => Promise<void>
  /** Drop per-instance transient data (provider instance-switch hygiene). */
  resetTransient: () => void
}

export const useAlertStore = create<AlertState>((set, get) => ({
  events: [],
  unreadErrorCount: 0,
  deadLetterCount: 0,
  viewing: false,
  // Read once at store creation — same keys/values the old page-local
  // useState(() => readPref(KEY)) initializers resolved on mount.
  soundEnabled: readPref(SOUND_KEY),
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
    set({ events: [], unreadErrorCount: 0, deadLetterCount: 0 })
  },
}))
