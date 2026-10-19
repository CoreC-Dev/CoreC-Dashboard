import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface DiscardChangesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

/**
 * Confirmation dialog for discarding unsaved config edits. Wraps the
 * previously-misleading "Cancel" banner button (which silently called
 * `revert()`) in an explicit AlertDialog so users don't accidentally lose
 * in-progress work. Shared by Drivers/Transports/Rules/ConfigCenter pages.
 *
 * D-18: the confirm is a lossy action but used to render as the default
 * primary (lime) button — visually identical to a plain "OK", so
 * habit-clicking the right button discarded the draft. It now uses the
 * destructive variant, the same red family as every delete-class confirm.
 */
export const DiscardChangesDialog: React.FC<DiscardChangesDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
}) => {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('applyDialog.discardTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('applyDialog.discardDesc')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-8 text-xs">{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            className="h-8 text-xs"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {t('common.discard')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
