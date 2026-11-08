import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import type React from 'react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'
import { type ToastItem, type ToastKind, useToastStore } from '@/stores/toastStore'

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const

const ICON_TONE: Record<ToastKind, string> = {
  success: 'text-status-running',
  error: 'text-status-error',
  info: 'text-primary',
}

const BORDER_TONE: Record<ToastKind, string> = {
  success: 'border-status-running/25',
  error: 'border-status-error/30',
  info: 'border-border',
}

const ToastRow: React.FC<{ item: ToastItem }> = ({ item }) => {
  const { t } = useTranslation()
  const dismiss = useToastStore((s) => s.dismiss)
  const Icon = ICONS[item.kind]

  useEffect(() => {
    const id = window.setTimeout(() => dismiss(item.id), item.kind === 'error' ? 8000 : 4000)
    return () => window.clearTimeout(id)
  }, [item.id, item.kind, dismiss])

  return (
    <div
      role={item.kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'toast-in pointer-events-auto flex w-[22rem] max-w-[calc(100vw-2rem)] items-start gap-3 rounded-2xl border bg-card p-3.5 shadow-[var(--shadow-panel)]',
        BORDER_TONE[item.kind],
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ICON_TONE[item.kind])} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold leading-snug">{item.title}</div>
        {item.description && (
          <div className="mt-0.5 break-words text-xs text-muted-foreground">{item.description}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(item.id)}
        aria-label={t('common.close')}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/** Fixed toast stack — mounted once at the app root. */
export const Toaster: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[120] flex flex-col gap-2">
      {toasts.map((item) => (
        <ToastRow key={item.id} item={item} />
      ))}
    </div>
  )
}
