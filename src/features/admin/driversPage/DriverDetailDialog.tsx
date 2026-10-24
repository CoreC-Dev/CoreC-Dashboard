// Driver detail dialog (runtime zone): a quick glance card for one
// connected driver — last-read stats, staleness, jump-to-detail.
// Pure/presentational: data arrives via hooks, callbacks via props.
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { useDriverTags } from '@/api/hooks'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { QualityLabel } from '@/lib/constants'
import type { DriverStatus } from '@/types/models'

export const DriverDetailDialog: React.FC<{
  driver: DriverStatus
  onClose: () => void
}> = ({ driver, onClose }) => {
  const { t } = useTranslation()
  const { data: tagsData, isLoading } = useDriverTags(driver.name)
  const tags = tagsData?.tags ? Object.values(tagsData.tags) : []
  // Cap rendered tags to prevent DOM overload (001, aligns with DriverDetailPage).
  const MAX_TAGS = 200
  const visibleTags = tags.slice(0, MAX_TAGS)

  return (
    <Dialog open={true} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <div>
              <DialogTitle className="text-base font-bold flex items-center space-x-2">
                <span>{driver.name}</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {driver.type}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs">{t('drivers.detailTitle')}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pt-2">
          {isLoading ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {t('drivers.loadingTags')}
            </div>
          ) : tags.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {t('drivers.noTags', { driver: driver.name })}
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/60 border-b border-border text-xs uppercase font-semibold text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">{t('drivers.colTag')}</th>
                    <th className="px-3 py-2">{t('drivers.colGroup')}</th>
                    <th className="px-3 py-2">{t('drivers.colValue')}</th>
                    <th className="px-3 py-2">{t('drivers.colType')}</th>
                    <th className="px-3 py-2">{t('drivers.colQuality')}</th>
                    <th className="px-3 py-2">{t('drivers.colLastPolled')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visibleTags.map((tag) => {
                    const q = QualityLabel[tag.quality] || QualityLabel[0]
                    return (
                      <tr key={tag.tag} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-mono font-semibold">{tag.tag}</td>
                        <td className="px-3 py-2 text-muted-foreground">{tag.group || '-'}</td>
                        <td className="px-3 py-2 font-mono font-bold text-foreground">
                          {String(tag.value)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{tag.type}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={`text-xs py-0 h-4 ${q.color}`}>
                            {t(q.key)}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground font-mono text-xs">
                          {tag.timestamp ? new Date(tag.timestamp).toLocaleTimeString() : '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {tags.length > MAX_TAGS && (
            <p className="text-xs text-muted-foreground text-center py-2">
              {t('common.showing', { shown: MAX_TAGS, total: tags.length })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
