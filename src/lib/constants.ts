import type { DataType } from '@/types/config'

// Unified with the canonical DataType from @/types/config (derived from
// DATA_TYPES) so the two can never drift.
export type DataTypeString = DataType

export const Quality = {
  Good: 0,
  Bad: 1,
  Uncertain: 2,
} as const

export const QualityLabel: Record<number, { key: string; color: string }> = {
  [Quality.Good]: {
    key: 'common.good',
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
  },
  [Quality.Bad]: { key: 'common.bad', color: 'text-rose-500 bg-rose-500/10 border-rose-500/30' },
  [Quality.Uncertain]: {
    key: 'common.uncertain',
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
  },
}

export const ConnState = {
  Disconnected: 0,
  Connecting: 1,
  Connected: 2,
  Error: 3,
} as const

export const ConnStateLabel: Record<number, { key: string; dotColor: string; badgeColor: string }> =
  {
    [ConnState.Disconnected]: {
      key: 'common.disconnected',
      dotColor: 'bg-zinc-500',
      badgeColor: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20',
    },
    [ConnState.Connecting]: {
      key: 'common.connecting',
      dotColor: 'bg-amber-400 animate-pulse',
      badgeColor: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    },
    [ConnState.Connected]: {
      key: 'common.connected',
      dotColor: 'bg-emerald-400 glow-running',
      badgeColor: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    },
    [ConnState.Error]: {
      key: 'common.error',
      dotColor: 'bg-rose-500 glow-error',
      badgeColor: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    },
  }

export const DEFAULT_COREC_URL = 'http://127.0.0.1:9090'
