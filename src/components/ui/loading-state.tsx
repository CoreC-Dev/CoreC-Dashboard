import { Loader2 } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Full loading transition state: animated logo + spinner + text.
 * Use for page-level or section-level loading placeholders.
 */
export function LoadingState({
  text,
  className,
}: {
  text?: string
  className?: string
}): React.ReactElement {
  const { t } = useTranslation()
  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className ?? 'py-16'}`}>
      <img src="/logo-animated.svg" alt="CoreC" className="w-10 h-10" />
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{text ?? t('common.loading')}</span>
      </div>
    </div>
  )
}
