/**
 * GlobalConfigEditor
 *
 * Structured form editor for the `global` section of CoreCConfig.
 * Covers: log-level, log-format, api.*, engine.*, buffer.*
 *
 * Integration: edits go through configStore.updateGlobalField(), which
 * updates the working config and sets dirty=true. The parent page
 * (ConfigCenterPage) handles the Apply/Revert flow via PUT /configs.
 *
 * Hot-reload semantics (from CoreC config.go):
 *   - log-level: hot-updatable (also via PATCH /configs)
 *   - log-format: requires restart
 *   - api.*: requires restart (listen address, TLS, timeouts)
 *   - engine.*: requires restart (workers, bus size, thresholds)
 *   - buffer.*: requires restart (buffer path, max-size)
 *
 * Fields requiring restart are marked with a warning badge.
 */
import { Sliders } from 'lucide-react'
import type React from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BufferSection, LoggingSection } from '@/components/admin/GlobalConfigParts'
import { ApiSection, EngineSection } from '@/components/admin/GlobalConfigSections'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useConfigStore } from '@/stores/configStore'
import type { GlobalConfig } from '@/types/config'

export const GlobalConfigEditor: React.FC = () => {
  const { t } = useTranslation()
  const workingConfig = useConfigStore((s) => s.workingConfig)
  const updateGlobalField = useConfigStore((s) => s.updateGlobalField)
  const resetToEmpty = useConfigStore((s) => s.resetToEmpty)
  const dirty = useConfigStore((s) => s.dirty)

  const [expanded, setExpanded] = useState(true)

  if (!workingConfig) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            <span>{t('globalConfig.title')}</span>
          </CardTitle>
          <CardDescription className="text-xs">{t('globalConfig.noConfigDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetToEmpty()}
            className="h-8 text-xs"
          >
            <Sliders className="w-3.5 h-3.5 mr-1.5" />
            {t('globalConfig.initConfig')}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const global: GlobalConfig = workingConfig.global ?? {}
  const api = global.api ?? {}
  const engine = global.engine ?? {}
  const buffer = global.buffer ?? {}

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            <span>{t('globalConfig.title')}</span>
            {dirty && (
              <Badge
                variant="outline"
                className="text-xs border-status-warning/40 text-status-warning"
              >
                {t('globalConfig.unsaved')}
              </Badge>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? t('common.collapse') : t('common.expand')}
          </Button>
        </div>
        <CardDescription className="text-xs">{t('globalConfig.desc')}</CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="p-4 pt-0 space-y-4">
          <LoggingSection global={global} update={updateGlobalField} />
          <ApiSection api={api} update={updateGlobalField} />
          <EngineSection engine={engine} update={updateGlobalField} />
          <BufferSection buffer={buffer} update={updateGlobalField} />
        </CardContent>
      )}
    </Card>
  )
}
