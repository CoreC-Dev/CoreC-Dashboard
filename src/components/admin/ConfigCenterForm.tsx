/**
 * Form-mode sub-components for the Config Center page.
 *
 * Extracted from ConfigCenterPage.tsx (TD-CPLX-001). Pure/presentational —
 * props in, no business state. No behavior changes: identical CSS classes,
 * i18n keys, and structure. Companion to ConfigCenterParts.tsx (toolbar) and
 * ConfigCenterYaml.tsx (YAML-mode cards).
 */
import { AlertCircle, Cpu, KeyRound, ListChecks, Network, RefreshCw, Sliders } from 'lucide-react'
import type React from 'react'
import { useTranslation } from 'react-i18next'
import { ComponentList } from '@/components/admin/ConfigCenterParts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { ConfigSummaryResponse } from '@/types/api'
import { LOG_LEVELS } from '@/types/config'

/** Runtime parameter patch card (global log-level selector). */
export const RuntimeParamsCard: React.FC<{
  currentLogLevel: string
  onLogLevelChange: (level: string) => void
  isPatchPending: boolean
}> = ({ currentLogLevel, onLogLevelChange, isPatchPending }) => {
  const { t } = useTranslation()
  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center space-x-2">
          <Sliders className="w-4 h-4 text-primary" />
          <span>{t('config.runtimeParams')}</span>
        </CardTitle>
        <CardDescription className="text-xs">{t('config.runtimeParamsDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-muted/40 border border-border">
          <div>
            <div className="text-xs font-semibold text-foreground">
              {t('config.globalLogLevel')}
            </div>
            <div className="text-xs text-muted-foreground">{t('config.globalLogLevelDesc')}</div>
          </div>

          <div className="flex items-center space-x-2">
            {LOG_LEVELS.map((lvl) => (
              <Button
                key={lvl}
                variant={currentLogLevel === lvl ? 'default' : 'outline'}
                size="sm"
                onClick={() => onLogLevelChange(lvl)}
                disabled={isPatchPending}
                className="h-7 px-3 text-xs uppercase font-mono"
              >
                {lvl}
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/** Active configuration overview synced from GET /configs. Derives the
 *  global/API summary tiles and the Drivers/Transports/Rules lists. */
export const ActiveSummaryCard: React.FC<{
  configData: ConfigSummaryResponse | undefined
  isLoadingConfigs: boolean
  isError: boolean
  error: unknown
  isFetchingConfigs: boolean
  onRetry: () => void
}> = ({ configData, isLoadingConfigs, isError, error, isFetchingConfigs, onRetry }) => {
  const { t } = useTranslation()
  const apiListen = configData?.global?.api?.listen
  const secretSet = configData?.global?.api?.['secret-set']
  const drivers = configData?.drivers ?? []
  const transports = configData?.transports ?? []
  const rules = configData?.rules ?? []
  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-sm font-semibold flex items-center space-x-2">
          <ListChecks className="w-4 h-4 text-primary" />
          <span>{t('config.activeSummary')}</span>
        </CardTitle>
        <CardDescription className="text-xs">{t('config.activeSummaryDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        {isLoadingConfigs && !configData ? (
          <div className="text-xs text-muted-foreground py-6 text-center">
            {t('config.loadingOverview')}
          </div>
        ) : isError ? (
          <div className="space-y-3 py-10 text-center">
            <AlertCircle className="mx-auto h-8 w-8 text-status-error" />
            <div className="text-sm font-semibold">{t('common.error')}</div>
            {error instanceof Error && error.message && (
              <div className="mx-auto max-w-md break-all font-mono text-xs text-status-error/80">
                {error.message}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              disabled={isFetchingConfigs}
              className="h-8 text-xs"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 mr-1.5 ${isFetchingConfigs ? 'animate-spin' : ''}`}
              />
              {t('common.retry')}
            </Button>
          </div>
        ) : (
          <>
            {/* Global + API summary tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  {t('config.globalLogLevel')}
                </div>
                <div className="font-mono text-xs font-bold text-foreground mt-1 uppercase">
                  {configData?.global?.['log-level'] ?? t('config.notAvailable')}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  {t('config.apiListener')}
                </div>
                <div className="font-mono text-xs font-bold text-foreground mt-1">
                  {apiListen ?? t('config.notAvailable')}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <div className="text-xs text-muted-foreground uppercase font-semibold flex items-center space-x-1">
                  <KeyRound className="w-3 h-3" />
                  <span>{t('config.apiSecret')}</span>
                </div>
                <div className="mt-1">
                  {secretSet === undefined ? (
                    <span className="text-xs text-muted-foreground">
                      {t('config.notAvailable')}
                    </span>
                  ) : secretSet ? (
                    <Badge variant="success">{t('config.secretSet')}</Badge>
                  ) : (
                    <Badge variant="warning">{t('config.secretUnset')}</Badge>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <div className="text-xs text-muted-foreground uppercase font-semibold">
                  {t('config.components')}
                </div>
                <div className="font-mono text-xs font-bold text-foreground mt-1">
                  {t('config.componentsTotal', {
                    count: drivers.length + transports.length + rules.length,
                  })}
                </div>
              </div>
            </div>

            {/* Drivers / Transports / Rules summaries */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              <ComponentList
                title={t('config.drivers')}
                icon={<Cpu className="w-3 h-3 text-primary" />}
                entries={drivers}
                typeLabel={t('config.colType')}
                emptyText={t('config.noDrivers')}
              />
              <ComponentList
                title={t('config.transports')}
                icon={<Network className="w-3 h-3 text-primary" />}
                entries={transports}
                typeLabel={t('config.colType')}
                emptyText={t('config.noTransports')}
              />
              <ComponentList
                title={t('config.rules')}
                icon={<ListChecks className="w-3 h-3 text-primary" />}
                entries={rules}
                typeLabel={t('config.colMatch')}
                emptyText={t('config.noRules')}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
