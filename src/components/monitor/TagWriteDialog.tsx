import { AlertCircle, Send } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { DataPoint } from '@/types/models'

interface TagWriteDialogProps {
  selectedTagForWrite: DataPoint | null
  writeValue: string
  writeError: string | null
  isPending: boolean
  onValueChange: (value: string) => void
  onClose: () => void
  onSubmit: (e: React.FormEvent) => void
}

/** Write-command confirmation dialog with industrial-safety validation.
 *  Extracted verbatim from TagExplorerPage — same classes & i18n keys. */
export function TagWriteDialog({
  selectedTagForWrite,
  writeValue,
  writeError,
  isPending,
  onValueChange,
  onClose,
  onSubmit,
}: TagWriteDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={!!selectedTagForWrite} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Send className="w-4 h-4 text-primary" />
            <span>{t('tags.writeToTag')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs">{t('tags.writeToTagDesc')}</DialogDescription>
        </DialogHeader>

        {selectedTagForWrite && (
          <form onSubmit={onSubmit} className="space-y-4 pt-2">
            {writeError && (
              <div className="p-3 rounded-lg bg-status-error/10 border border-status-error/20 text-status-error text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{writeError}</span>
              </div>
            )}

            <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs space-y-1 font-mono">
              <div>
                <span className="text-muted-foreground">{t('common.driver')}: </span>
                <span className="font-semibold text-foreground">{selectedTagForWrite.driver}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('common.tag')}: </span>
                <span className="font-semibold text-primary">{selectedTagForWrite.tag}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('common.type')}: </span>
                <span className="text-foreground">{selectedTagForWrite.type}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                {t('tags.newTargetValue')}
              </label>
              <Input
                type="text"
                value={writeValue}
                onChange={(e) => onValueChange(e.target.value)}
                placeholder={t('tags.enterValue')}
                required
                className="font-mono text-xs"
              />
            </div>

            <div className="p-3 rounded bg-status-warning/10 border border-status-warning/20 text-xs text-status-warning">
              {t('write.confirmWarning')}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" size="sm" disabled={isPending} className="glow-primary">
                {isPending ? t('common.loading') : t('write.submit')}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
