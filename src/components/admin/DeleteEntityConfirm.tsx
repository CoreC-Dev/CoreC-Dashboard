/**
 * DeleteEntityConfirm — the shared delete-confirmation AlertDialog for the
 * entity list pages (drivers / transports / rules), extracted from three
 * byte-similar copies (TD-DUP; also keeps RulesPage under the 500-line
 * custom-lint ceiling). The `children` slot carries entity-specific
 * warning blocks — e.g. the dependent-rules scan TransportsPage shows and
 * DriversPage shows for rules consuming the driver (C-A3).
 */
import type React from 'react'
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

export const DeleteEntityConfirm: React.FC<{
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => void
  /** Extra warning block rendered between the description and the footer. */
  children?: React.ReactNode
}> = ({ open, onOpenChange, title, description, onConfirm, children }) => {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel className="h-8 text-xs">{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            variant="destructive"
            className="h-8 text-xs danger-pulse"
          >
            {t('common.delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
