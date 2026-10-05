import type React from 'react'
import { useCallback, useDeferredValue, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useDrivers, useTags } from '@/api/hooks'
import { TagTable } from '@/components/monitor/TagTable'
import { TagToolbar } from '@/components/monitor/TagToolbar'
import { TagTrendPanel } from '@/components/monitor/TagTrendPanel'
import { TagWriteDialog } from '@/components/monitor/TagWriteDialog'
import { useTagExplorerStream } from '@/hooks/useTagExplorerStream'
import { useTagWrite } from '@/hooks/useTagWrite'
import { isNumericType, tagKey, toSeconds } from '@/lib/tagExplorer'
import type { DataPoint } from '@/types/models'

export const TagExplorerPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: initialTagsData, refetch, isFetching, isLoading, isError, error } = useTags()
  const { data: driversData } = useDrivers()

  const [selectedDriver, setSelectedDriver] = useState<string>('all')

  const {
    tagMap,
    flashTick,
    trendSamples,
    setTrendSamples,
    discardPendingTrend,
    resetSeed,
    trendTag,
    setTrendTag,
    trendPaused,
    setTrendPaused,
  } = useTagExplorerStream({
    initialTags: initialTagsData?.tags,
    selectedDriver,
  })

  // Search/filter/sort state.
  const [searchTerm, setSearchTerm] = useState('')
  // Defer the search term so the expensive filter+sort in filteredTags runs at
  // a lower priority than the input's keystroke rendering. The <Input> below
  // keeps using the immediate `searchTerm` for responsive typing, while the
  // heavy filteredTags memo recomputes on the deferred value — preventing the
  // rAF-flushed tag map from cascading into a 60×/sec filter+sort per keystroke.
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  const [sortKey, setSortKey] = useState<'tag' | 'timestamp' | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const drivers = driversData?.drivers || []
  // Defer the tagMap so the expensive Object.values + filter + sort
  // recomputation runs at lower priority. Without this, every WS flush
  // (up to 60x/sec) creates a new tagMap reference, causing tagsList
  // and filteredTags to recompute every frame and re-render all visible
  // virtual rows. useDeferredValue coalesces rapid successive updates
  // so the list only recomputes when the browser is idle, keeping the
  // UI responsive under high-frequency /tags/stream traffic.
  const deferredTagMap = useDeferredValue(tagMap)
  const tagsList = useMemo(() => Object.values(deferredTagMap), [deferredTagMap])

  // Extract unique non-empty group names for the group filter dropdown.
  const uniqueGroups = useMemo(() => {
    const groups = new Set<string>()
    for (const pt of tagsList) {
      if (pt.group) groups.add(pt.group)
    }
    return Array.from(groups).sort()
  }, [tagsList])

  const toggleSort = useCallback((key: 'tag' | 'timestamp') => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir('asc')
        return key
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return prev
    })
  }, [])

  const filteredTags = useMemo(() => {
    const term = deferredSearchTerm.toLowerCase()
    const filtered = tagsList.filter((pt) => {
      if (selectedDriver !== 'all' && pt.driver !== selectedDriver) return false
      if (selectedGroup !== 'all' && pt.group !== selectedGroup) return false
      if (term) {
        const match =
          pt.tag.toLowerCase().includes(term) ||
          pt.driver.toLowerCase().includes(term) ||
          pt.group?.toLowerCase().includes(term)
        if (!match) return false
      }
      return true
    })
    if (!sortKey) return filtered
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'tag') {
        cmp = a.tag.localeCompare(b.tag)
      } else {
        cmp = toSeconds(a.timestamp) - toSeconds(b.timestamp)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [tagsList, deferredSearchTerm, selectedDriver, selectedGroup, sortKey, sortDir])

  const openTrend = useCallback(
    (point: DataPoint) => {
      // Discard samples staged for the previous tag so a pending RAF does
      // not flush them into the new tag's chart (stale-sample leak). [H-8]
      discardPendingTrend()
      // setTrendTag updates the internal ref synchronously so the WS
      // onmessage callback sees the new tag on the very next message. [H-8]
      setTrendTag(point)
      if (isNumericType(point.type)) {
        const num = Number(point.value)
        setTrendSamples(Number.isNaN(num) ? [] : [{ time: toSeconds(point.timestamp), value: num }])
      } else {
        setTrendSamples([])
      }
    },
    [
      discardPendingTrend,
      setTrendSamples, // setTrendTag updates the internal ref synchronously so the WS
      // onmessage callback sees the new tag on the very next message. [H-8]
      setTrendTag,
    ],
  )

  const closeTrend = useCallback(() => {
    // Discard staged samples so a pending RAF doesn't flush them into a chart
    // that's about to unmount / already cleared. [H-8]
    discardPendingTrend()
    // setTrendTag clears the internal ref synchronously so the WS callback
    // stops staging samples immediately. [H-8]
    setTrendTag(null)
    setTrendSamples([])
  }, [discardPendingTrend, setTrendTag, setTrendSamples])

  const handleRefresh = () => {
    // Allow a single re-seed from the next REST snapshot to pick up new tags.
    resetSeed()
    refetch()
  }

  const write = useTagWrite()
  // Stable row-action handler so memoized TagRow rows whose `point`/`start`/
  // `flashTick` haven't changed can skip re-rendering. `write.openWrite` is a
  // useCallback with stable identity, so passing it directly preserves the
  // memo guarantee (an inline arrow would hand every row a new reference).
  const handleWriteClick = useCallback(
    (point: DataPoint) => write.openWrite(point),
    [write.openWrite],
  )

  // Live-updating point for the trend detail panel. tagMap is updated by the
  // WS stream (rAF-batched), so looking up the selected tag here gives the
  // freshest value/quality/timestamp without extra state. Falls back to the
  // snapshot captured at open-time if the tag isn't in the live map yet.
  const trendLivePoint = trendTag ? (tagMap[tagKey(trendTag)] ?? trendTag) : null

  // The WS subscription may already be streaming points before the REST
  // snapshot resolves. Only show the loading/error placeholder when we have
  // nothing to render yet — once tagMap has entries (from either source) the
  // live table takes over.
  const showLoading = isLoading && filteredTags.length === 0
  const showError = isError && filteredTags.length === 0

  return (
    <div className={trendTag ? 'flex flex-col md:flex-row gap-4 md:items-stretch' : 'space-y-5'}>
      <div className={trendTag ? 'flex-1 min-w-0 space-y-4' : 'space-y-5'}>
        {/* Greeting */}
        <div className="pt-1">
          <h1 className="text-2xl font-bold tracking-tight">{t('nav.tags')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('tags.explorerDesc', { defaultValue: 'Browse & write tags in real time' })}
          </p>
        </div>

        <TagToolbar
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          selectedDriver={selectedDriver}
          onDriverChange={setSelectedDriver}
          selectedGroup={selectedGroup}
          onGroupChange={setSelectedGroup}
          drivers={drivers}
          uniqueGroups={uniqueGroups}
          filteredCount={filteredTags.length}
          isFetching={isFetching}
          onRefresh={handleRefresh}
        />

        <TagTable
          filteredTags={filteredTags}
          flashTick={flashTick}
          onOpen={openTrend}
          onWrite={handleWriteClick}
          sortKey={sortKey}
          sortDir={sortDir}
          onToggleSort={toggleSort}
          showLoading={showLoading}
          showError={showError}
          error={error}
          isFetching={isFetching}
          onRetry={() => refetch()}
        />
      </div>

      {/*
       * Trend panel — right column on desktop, bottom sheet on mobile.
       * Clicking a tag row splits the page: tag list on the left,
       * live trend chart + details on the right. No fixed overlay.
       */}
      {trendTag && (
        <>
          {/* Mobile backdrop — tap to close the bottom sheet. */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/30"
            onClick={closeTrend}
            aria-hidden
          />
          <TagTrendPanel
            trendTag={trendTag}
            trendLivePoint={trendLivePoint}
            trendSamples={trendSamples}
            trendPaused={trendPaused}
            onTogglePause={() => setTrendPaused((p) => !p)}
            onClose={closeTrend}
          />
        </>
      )}

      <TagWriteDialog
        selectedTagForWrite={write.selectedTagForWrite}
        writeValue={write.writeValue}
        writeError={write.writeError}
        isPending={write.isPending}
        onValueChange={write.setWriteValue}
        onClose={write.closeWrite}
        onSubmit={write.submitWrite}
      />
    </div>
  )
}
