import type React from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { deriveAggregate, useWsStatusStore, type WsAggregate } from '@/stores/wsStatusStore'

/**
 * Visual mapping for the "实时流" indicator — bound to the AGGREGATED state of
 * the live WebSocket streams (wsStatusStore), not the one-shot HTTP probe:
 * a probe-driven badge would stay green while every stream was frozen.
 * 'idle' (no stream mounted yet) reads as "connecting".
 *
 * Single source of truth for every stream-status rendering: the sidebar
 * badge (below the brand mark) and the mobile topbar dot.
 */
export const streamBadgeTone = (
  aggregate: WsAggregate,
): { dot: string; text: string; labelKey: string } => {
  switch (aggregate) {
    case 'open':
      return {
        dot: 'bg-status-running glow-running',
        text: 'text-status-running',
        labelKey: 'monitor.realtimeStreamConnected',
      }
    case 'down':
      return {
        dot: 'bg-status-error glow-error',
        text: 'text-status-error',
        labelKey: 'monitor.realtimeStreamDisconnected',
      }
    case 'rejected':
      return {
        dot: 'bg-status-error glow-error',
        text: 'text-status-error',
        labelKey: 'monitor.realtimeStreamRejected',
      }
    default:
      // 'connecting' | 'idle'
      return {
        dot: 'bg-status-warning',
        text: 'text-status-warning',
        labelKey: 'monitor.realtimeStreamConnecting',
      }
  }
}

/**
 * Live-stream status badge, rendered directly below the sidebar brand
 * mark so the connection state is part of the app chrome — not of any
 * page. Expanded sidebar: centered pill with dot + label (mirrors the
 * mobile sheet). Collapsed rail: dot only — the 56px rail cannot carry
 * the text, so the label travels in title + aria-label, exactly like
 * the mobile topbar dot.
 */
export const StreamStatusBadge: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const { t } = useTranslation()
  const aggregate = useWsStatusStore((s) => deriveAggregate(s.streams))
  const tone = streamBadgeTone(aggregate)

  if (collapsed) {
    return (
      <span
        role="status"
        title={t(tone.labelKey)}
        aria-label={t(tone.labelKey)}
        className={cn('w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300', tone.dot)}
      />
    )
  }

  return (
    <div
      role="status"
      aria-label={t(tone.labelKey)}
      className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/60"
    >
      <span
        className={cn('w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-300', tone.dot)}
        aria-hidden="true"
      />
      <span className={cn('text-sm font-semibold', tone.text)}>{t(tone.labelKey)}</span>
    </div>
  )
}
