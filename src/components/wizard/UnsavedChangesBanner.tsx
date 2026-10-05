import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DiscardChangesDialog } from '@/components/wizard/DiscardChangesDialog'

interface UnsavedChangesBannerProps {
  dirty: boolean
  unsavedChangesLabel: string
  applyChangesLabel: string
  hasValidationErrors: boolean
  onApply: () => void
  onDiscard: () => void
}

/**
 * Shared unsaved-config-changes banner with Discard + Apply buttons and a
 * built-in discard-confirmation dialog. Replaces ~35 lines of duplicated
 * markup in Drivers/Transports/Rules/ConfigCenter pages.
 */
export const UnsavedChangesBanner: React.FC<UnsavedChangesBannerProps> = ({
  dirty,
  unsavedChangesLabel,
  applyChangesLabel,
  hasValidationErrors,
  onApply,
  onDiscard,
}) => {
  const { t } = useTranslation()
  const [discardOpen, setDiscardOpen] = useState(false)
  return (
    <>
      {dirty && (
        <div className="banner-enter rounded-md border border-status-warning/30 bg-status-warning/10 p-3 text-xs text-status-warning dark:text-status-warning flex items-center justify-between">
          <span>{unsavedChangesLabel}</span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setDiscardOpen(true)}
            >
              {t('common.discardChanges')}
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              disabled={hasValidationErrors}
              onClick={onApply}
            >
              {applyChangesLabel}
            </Button>
          </div>
        </div>
      )}
      <DiscardChangesDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        onConfirm={onDiscard}
      />
    </>
  )
}
