import { RefreshCw, Search } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { QualityFilter } from '@/lib/tagExplorer'
import type { DriverStatus } from '@/types/models'

interface TagToolbarProps {
  searchTerm: string
  onSearchChange: (value: string) => void
  selectedDriver: string
  onDriverChange: (value: string) => void
  selectedGroup: string
  onGroupChange: (value: string) => void
  /** Active quality filter ('all' | 'good' | 'bad' | 'uncertain'). */
  selectedQuality: QualityFilter
  onQualityChange: (value: QualityFilter) => void
  /** "stale tags only" toggle (revives the dead tags.staleOnly key). */
  staleOnly: boolean
  onStaleOnlyChange: (value: boolean) => void
  drivers: DriverStatus[]
  uniqueGroups: string[]
  filteredCount: number
  isFetching: boolean
  onRefresh: () => void
}

/** Search input + driver/group/quality filter dropdowns + stale-only toggle
 *  + result count + refresh. */
export function TagToolbar({
  searchTerm,
  onSearchChange,
  selectedDriver,
  onDriverChange,
  selectedGroup,
  onGroupChange,
  selectedQuality,
  onQualityChange,
  staleOnly,
  onStaleOnlyChange,
  drivers,
  uniqueGroups,
  filteredCount,
  isFetching,
  onRefresh,
}: TagToolbarProps) {
  const { t } = useTranslation()
  const staleId = useId()

  return (
    <Card className="border-border bg-card">
      <CardContent className="p-4 flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="flex flex-1 flex-wrap items-center gap-2 w-full">
          <div className="relative flex-1 min-w-[10rem]">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <Input
              placeholder={t('common.search')}
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Driver Filter */}
          <Select value={selectedDriver} onValueChange={onDriverChange}>
            <SelectTrigger className="h-9 w-auto text-xs" aria-label={t('tags.allDrivers')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tags.allDrivers')}</SelectItem>
              {drivers.map((d) => (
                <SelectItem key={d.name} value={d.name}>
                  {d.name} ({d.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Group Filter */}
          <Select value={selectedGroup} onValueChange={onGroupChange}>
            <SelectTrigger
              className="h-9 w-auto text-xs"
              aria-label={t('tags.allGroups', { defaultValue: 'All groups' })}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">
                {t('tags.allGroups', { defaultValue: 'All groups' })}
              </SelectItem>
              {uniqueGroups.map((g) => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Quality Filter — the problem-point hunt: bad/uncertain
           * quality tags no longer hide among hundreds of rows. */}
          <Select
            value={selectedQuality}
            onValueChange={(v) => onQualityChange(v as QualityFilter)}
          >
            <SelectTrigger className="h-9 w-auto text-xs" aria-label={t('tags.qualityFilter')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('tags.allQualities')}</SelectItem>
              <SelectItem value="good">{t('common.good')}</SelectItem>
              <SelectItem value="bad">{t('common.bad')}</SelectItem>
              <SelectItem value="uncertain">{t('common.uncertain')}</SelectItem>
            </SelectContent>
          </Select>

          {/* Stale-only toggle — 复用存量键 tags.staleOnly. */}
          <div className="flex items-center gap-1.5 shrink-0">
            <Checkbox
              id={staleId}
              checked={staleOnly}
              onCheckedChange={(v) => onStaleOnlyChange(v === true)}
              aria-label={t('tags.staleOnly')}
            />
            <label htmlFor={staleId} className="text-xs text-muted-foreground cursor-pointer">
              {t('tags.staleOnly')}
            </label>
          </div>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <div className="text-xs text-muted-foreground font-mono">
            {t('tags.total', { count: filteredCount })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isFetching}
            className="h-9 text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span>{t('common.refresh')}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
