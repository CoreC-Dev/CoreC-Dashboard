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
 * Confirmation dialog for discarding unsaved config edits: the "Cancel"
 * banner button opens an explicit AlertDialog before `revert()` runs.
 * Shared by Drivers/Transports/Rules/ConfigCenter pages.
 *
 * The confirm is a lossy action and uses the destructive variant, the same
 * red family as every delete-class confirm.
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
