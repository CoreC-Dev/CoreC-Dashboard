import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useInstanceStore } from '@/stores/instanceStore'

interface InstanceExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Export dialog for CoreC instance configs. By default the export omits API
 * secrets (TD-SEC-003); the operator can opt in to including them with an
 * explicit warning that the file will contain plain-text credentials.
 */
export const InstanceExportDialog: React.FC<InstanceExportDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { t } = useTranslation()
  const exportInstances = useInstanceStore((s) => s.exportInstances)
  const [includeSecrets, setIncludeSecrets] = useState(false)

  const handleExport = () => {
    const json = exportInstances(includeSecrets)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `corec-instances-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setIncludeSecrets(false)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('instances.exportTitle')}</DialogTitle>
          <DialogDescription>{t('instances.exportDesc')}</DialogDescription>
        </DialogHeader>
        <label className="flex items-start gap-3 cursor-pointer py-2">
          <Checkbox
            checked={includeSecrets}
            onCheckedChange={(v) => setIncludeSecrets(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm leading-relaxed">
            <span className="font-medium">{t('instances.includeSecrets')}</span>
            {includeSecrets && (
              <span className="block text-amber-600 dark:text-amber-400 mt-1">
                {t('instances.includeSecretsWarning')}
              </span>
            )}
          </span>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleExport}>{t('instances.exportButton')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
