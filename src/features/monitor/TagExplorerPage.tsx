import { Sparkles } from 'lucide-react'
import type React from 'react'
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useDrivers, useTags } from '@/api/hooks'
import { TagTable } from '@/components/monitor/TagTable'
import { TagToolbar } from '@/components/monitor/TagToolbar'
import { TagTrendPanel } from '@/components/monitor/TagTrendPanel'
import { TagWriteDialog } from '@/components/monitor/TagWriteDialog'
import { useTagExplorerStream } from '@/hooks/useTagExplorerStream'
import { useTagWrite } from '@/hooks/useTagWrite'
import {
  isNumericType,
  matchesQualityFilter,
  type QualityFilter,
  TAG_SNAPSHOT_POLL_MS,
  tagKey,
  toSeconds,
} from '@/lib/tagExplorer'
import type { DataPoint } from '@/types/models'

export const TagExplorerPage: React.FC = () => {
  const { t } = useTranslation()
  const { data: initialTagsData, refetch, isFetching, isLoading, isError, error } = useTags()
  const { data: driversData } = useDrivers()

  // Deep-link prefill — the dead-letter "View tag" link lands here with
  // ?driver=…&tag=… so the operator checks the current live value without
  // re-typing the tag they were just staring at. Read once at mount; the link
  // always navigates cross-route, so a fresh mount is the only entry path.
  const [searchParams] = useSearchParams()
  const [selectedDriver, setSelectedDriver] = useState<string>(
    () => searchParams.get('driver') || 'all',
  )

  // Transient "new tags discovered" notice — set by the stream's
  // snapshot reconcile, auto-dismisses after a few seconds.
  const [discoveryNotice, setDiscoveryNotice] = useState<number | null>(null)
  const handleTagsDiscovered = useCallback((count: number) => {
    setDiscoveryNotice(count)
  }, [])
  useEffect(() => {
    if (discoveryNotice === null) return
    const id = window.setTimeout(() => setDiscoveryNotice(null), 8000)
    return () => window.clearTimeout(id)
  }, [discoveryNotice])

  const {
    tagMap,
    flashTick,
    trendSamples,
    setTrendSamples,
    discardPendingTrend,
    trendTag,
    setTrendTag,
    trendPaused,
    setTrendPaused,
  } = useTagExplorerStream({
    initialTags: initialTagsData?.tags,
    selectedDriver,
    // The stream's snapshot reconcile reports discovered tags so the
    // page can surface the transient notice below.
    onTagsDiscovered: handleTagsDiscovered,
  })

  // Low-frequency snapshot poll — backend-added tags appear within a
  // minute without the hidden "manual refresh" knowledge; removed tags
  // leave the table on the same cadence. useTags itself stays unpolled
  // (api/hooks is off-limits by design); the page owns this interval.
  useEffect(() => {
    const iv = setInterval(() => {
      void refetch()
    }, TAG_SNAPSHOT_POLL_MS)
    return () => clearInterval(iv)
  }, [refetch])

  // Search/filter/sort state. The tag URL param prefills the search box.
  const [searchTerm, setSearchTerm] = useState(() => searchParams.get('tag') ?? '')
  // Defer the search term so the expensive filter+sort in filteredTags runs at
  // a lower priority than the input's keystroke rendering. The <Input> below
  // keeps using the immediate `searchTerm` for responsive typing, while the
  // heavy filteredTags memo recomputes on the deferred value — preventing the
  // rAF-flushed tag map from cascading into a 60×/sec filter+sort per keystroke.
  const deferredSearchTerm = useDeferredValue(searchTerm)
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  // Quality filter + stale-only toggle — the "problem points" hunt.
  const [selectedQuality, setSelectedQuality] = useState<QualityFilter>('all')
  const [staleOnly, setStaleOnly] = useState(false)
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
      // Shared quality/staleness predicate (unit-tested in lib).
      if (!matchesQualityFilter(pt, selectedQuality, staleOnly)) return false
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
  }, [
    tagsList,
    deferredSearchTerm,
    selectedDriver,
    selectedGroup,
    selectedQuality,
    staleOnly,
    sortKey,
    sortDir,
  ])

  const openTrend = useCallback(
    (point: DataPoint) => {
      // Discard samples staged for the previous tag so a pending RAF does
      // not flush them into the new tag's chart (stale-sample leak).
      discardPendingTrend()
      // setTrendTag updates the internal ref synchronously so the WS
      // onmessage callback sees the new tag on the very next message.
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
      // onmessage callback sees the new tag on the very next message.
      setTrendTag,
    ],
  )

  const closeTrend = useCallback(() => {
    // Discard staged samples so a pending RAF doesn't flush them into a chart
    // that's about to unmount / already cleared.
    discardPendingTrend()
    // setTrendTag clears the internal ref synchronously so the WS callback
    // stops staging samples immediately.
    setTrendTag(null)
    setTrendSamples([])
  }, [discardPendingTrend, setTrendTag, setTrendSamples])

  const handleRefresh = () => {
    // A plain refetch is enough — every new snapshot object
    // reconciles the live map (the seed-once guard is gone).
    refetch()
  }

  // Whether ANY filter is active — the table's empty state tells an
  // unfiltered zero-tag instance apart from a filter that matched nothing.
  const hasActiveFilters =
    searchTerm !== '' ||
    selectedDriver !== 'all' ||
    selectedGroup !== 'all' ||
    selectedQuality !== 'all' ||
    staleOnly
  const clearFilters = useCallback(() => {
    setSearchTerm('')
    setSelectedDriver('all')
    setSelectedGroup('all')
    setSelectedQuality('all')
    setStaleOnly(false)
  }, [])

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
        <div>
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
          selectedQuality={selectedQuality}
          onQualityChange={setSelectedQuality}
          staleOnly={staleOnly}
          onStaleOnlyChange={setStaleOnly}
          drivers={drivers}
          uniqueGroups={uniqueGroups}
          filteredCount={filteredTags.length}
          isFetching={isFetching}
          onRefresh={handleRefresh}
        />

        {/* Backend-added tags surface within a snapshot cycle — the
         * operator no longer needs the hidden "manual refresh" knowledge. */}
        {discoveryNotice !== null && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl border border-status-running/30 bg-status-running/10 px-4 py-2 text-sm text-status-running"
          >
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
            <span>{t('tags.newTagsDiscovered', { count: discoveryNotice })}</span>
          </div>
        )}

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
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearFilters}
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
